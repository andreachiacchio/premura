import type { Database } from '@premura/db';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Slice 7B — unit test approveAndSendReplyDraft + rejectReplyDraft.
// Mocka @premura/integrations sendText: testiamo lo state machine
// senza chiamare Meta vero. Il client Meta ha test propri.

const sendTextMock = vi.fn();
class MockWhatsappSendError extends Error {
  status: number;
  body: string;
  retryable: boolean;
  constructor(status: number, body: string) {
    super(`mock ${status}`);
    this.name = 'WhatsappSendError';
    this.status = status;
    this.body = body;
    this.retryable = status >= 500 || status === 429;
  }
}

vi.mock('@premura/integrations', async () => {
  const actual = (await vi.importActual('@premura/integrations')) as Record<string, unknown>;
  return {
    ...actual,
    sendText: (...args: unknown[]) => sendTextMock(...args),
    WhatsappSendError: MockWhatsappSendError,
  };
});

const { approveAndSendReplyDraft, rejectReplyDraft } = await import(
  '../lib/repositories/reply-drafts'
);

// Drizzle mock: serve a coprire le 4 query principali del path:
//   1. SELECT pendingDrafts JOIN bookings LEFT JOIN messages -> draft row
//   2. UPDATE pendingDrafts -> status=approved (lock)
//   3. INSERT messages -> outbound row
//   4. UPDATE pendingDrafts -> status=sent + sent_at + meta_message_id

type MockState = {
  draftRow: {
    draft: Record<string, unknown>;
    guestPhone: string | null;
    inboundChannel: string | null;
  } | null;
  // Capture insert/update calls for assertions.
  inserts: Array<{ table: string; values: Record<string, unknown> }>;
  updates: Array<{ table: string; values: Record<string, unknown> }>;
  // For UPDATE pendingDrafts WHERE status=pending: ritorna []
  // se "lockTaken" e' true, altrimenti [{id}].
  lockTaken: boolean;
  // Per re-leggi dopo race.
  latestMetaMessageId: string | null;
};

function makeMockDb(state: MockState): Database {
  let selectCount = 0;
  let updateCount = 0;
  return {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          leftJoin: () => ({
            where: () => ({
              limit: () => {
                selectCount++;
                return Promise.resolve(state.draftRow ? [state.draftRow] : []);
              },
            }),
          }),
        }),
        where: () => ({
          limit: () => {
            // SELECT metaMessageId post-race.
            return Promise.resolve([{ metaMessageId: state.latestMetaMessageId }]);
          },
        }),
      }),
    }),
    update: () => ({
      set: (vals: Record<string, unknown>) => ({
        where: () => ({
          returning: () => {
            updateCount++;
            // Prima UPDATE = lock atomico.
            if (updateCount === 1) {
              state.updates.push({ table: 'pending_drafts', values: vals });
              return Promise.resolve(state.lockTaken ? [] : [{ id: 'pd-locked' }]);
            }
            return Promise.resolve([]);
          },
        }),
      }),
    }),
    insert: () => ({
      values: (vals: Record<string, unknown>) => {
        state.inserts.push({ table: 'messages', values: vals });
        return {
          returning: () => Promise.resolve([{ id: 'msg-inserted' }]),
        };
      },
    }),
  } as unknown as Database;
}

const baseDraft = {
  id: 'pd-1',
  bookingId: 'b1',
  hostId: 'host-1',
  status: 'pending' as const,
  draftResponse: 'Ciao Mario, le chiavi sono nel keybox 1234.',
  metaMessageId: null,
};

function makeState(opts: Partial<MockState> = {}): MockState {
  return {
    draftRow: {
      draft: { ...baseDraft },
      guestPhone: '+393331234567',
      inboundChannel: 'whatsapp',
      ...opts.draftRow,
    },
    inserts: [],
    updates: [],
    lockTaken: false,
    latestMetaMessageId: null,
    ...opts,
  };
}

describe('approveAndSendReplyDraft', () => {
  beforeEach(() => {
    sendTextMock.mockReset();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('happy path: send 200 -> status sent + insert messages outbound + update meta_message_id', async () => {
    const state = makeState();
    sendTextMock.mockResolvedValue({ messageId: 'wamid.ABC' });
    const db = makeMockDb(state);

    const r = await approveAndSendReplyDraft(db, 'pd-1', baseDraft.draftResponse, 'host-1');

    expect(r.status).toBe('sent');
    if (r.status === 'sent') {
      expect(r.metaMessageId).toBe('wamid.ABC');
      expect(r.messageId).toBe('msg-inserted');
    }
    expect(sendTextMock).toHaveBeenCalledOnce();
    expect(sendTextMock).toHaveBeenCalledWith('+393331234567', baseDraft.draftResponse);
    // 1 messages insert + 2 pending_drafts updates (lock + sent).
    expect(state.inserts.length).toBe(1);
    const msgInsert = state.inserts[0];
    expect(msgInsert?.values.platformMessageId).toBe('wamid.ABC');
    expect(msgInsert?.values.direction).toBe('outbound');
    expect(msgInsert?.values.fromEntity).toBe('host');
    expect(msgInsert?.values.recipientExternalId).toBe('+393331234567');
  });

  it('draft not found -> not_found', async () => {
    const state: MockState = {
      draftRow: null,
      inserts: [],
      updates: [],
      lockTaken: false,
      latestMetaMessageId: null,
    };
    const db = makeMockDb(state);
    const r = await approveAndSendReplyDraft(db, 'pd-x', 'body', 'host-1');
    expect(r.status).toBe('not_found');
    expect(sendTextMock).not.toHaveBeenCalled();
  });

  it('no guest phone -> no_guest_phone, niente call Meta', async () => {
    const state = makeState();
    state.draftRow = {
      draft: { ...baseDraft },
      guestPhone: null,
      inboundChannel: 'whatsapp',
    };
    const db = makeMockDb(state);
    const r = await approveAndSendReplyDraft(db, 'pd-1', 'body', 'host-1');
    expect(r.status).toBe('no_guest_phone');
    expect(sendTextMock).not.toHaveBeenCalled();
  });

  it('canale email -> channel_not_supported', async () => {
    const state = makeState();
    state.draftRow = {
      draft: { ...baseDraft },
      guestPhone: '+393331234567',
      inboundChannel: 'email',
    };
    const db = makeMockDb(state);
    const r = await approveAndSendReplyDraft(db, 'pd-1', 'body', 'host-1');
    expect(r.status).toBe('channel_not_supported');
    if (r.status === 'channel_not_supported') {
      expect(r.channel).toBe('email');
    }
  });

  it('Meta 400 (4xx non-retryable) -> status failed + error_log, no retry', async () => {
    const state = makeState();
    sendTextMock.mockRejectedValue(new MockWhatsappSendError(400, '{"error":"recipient invalid"}'));
    const db = makeMockDb(state);

    const r = await approveAndSendReplyDraft(db, 'pd-1', 'body proper', 'host-1');

    expect(r.status).toBe('failed');
    if (r.status === 'failed') {
      expect(r.error).toContain('400');
    }
    expect(sendTextMock).toHaveBeenCalledOnce(); // no retry on 4xx
  });

  it('Meta 503 (5xx retryable) -> retry 1x, poi success se 200', async () => {
    const state = makeState();
    sendTextMock
      .mockRejectedValueOnce(new MockWhatsappSendError(503, 'service unavailable'))
      .mockResolvedValueOnce({ messageId: 'wamid.RETRY' });
    const db = makeMockDb(state);

    const r = await approveAndSendReplyDraft(db, 'pd-1', 'body proper', 'host-1');

    expect(r.status).toBe('sent');
    if (r.status === 'sent') {
      expect(r.metaMessageId).toBe('wamid.RETRY');
    }
    expect(sendTextMock).toHaveBeenCalledTimes(2);
  });

  it('Meta 503 + 503 (retry esaurito) -> failed', async () => {
    const state = makeState();
    sendTextMock.mockRejectedValue(new MockWhatsappSendError(503, 'still unavailable'));
    const db = makeMockDb(state);

    const r = await approveAndSendReplyDraft(db, 'pd-1', 'body proper', 'host-1');

    expect(r.status).toBe('failed');
    expect(sendTextMock).toHaveBeenCalledTimes(2); // 1 + 1 retry
  });

  it('draft gia approved (idempotency) -> already_sent senza call Meta', async () => {
    const state = makeState();
    state.draftRow = {
      draft: { ...baseDraft, status: 'sent', metaMessageId: 'wamid.OLD' },
      guestPhone: '+393331234567',
      inboundChannel: 'whatsapp',
    };
    const db = makeMockDb(state);
    const r = await approveAndSendReplyDraft(db, 'pd-1', 'body proper', 'host-1');
    expect(r.status).toBe('already_sent');
    if (r.status === 'already_sent') {
      expect(r.metaMessageId).toBe('wamid.OLD');
    }
    expect(sendTextMock).not.toHaveBeenCalled();
  });

  it('race condition: lock fallito -> already_sent (re-leggi metaMessageId)', async () => {
    const state = makeState();
    state.lockTaken = true;
    state.latestMetaMessageId = 'wamid.RACE';
    const db = makeMockDb(state);
    const r = await approveAndSendReplyDraft(db, 'pd-1', 'body proper', 'host-1');
    expect(r.status).toBe('already_sent');
    if (r.status === 'already_sent') {
      expect(r.metaMessageId).toBe('wamid.RACE');
    }
    expect(sendTextMock).not.toHaveBeenCalled();
  });
});

describe('rejectReplyDraft', () => {
  it('pending -> rejected con reason', async () => {
    const updates: Array<Record<string, unknown>> = [];
    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () => Promise.resolve([{ id: 'pd-1', status: 'pending' as const }]),
          }),
        }),
      }),
      update: () => ({
        set: (v: Record<string, unknown>) => {
          updates.push(v);
          return { where: () => Promise.resolve() };
        },
      }),
    } as unknown as Database;
    const r = await rejectReplyDraft(db, 'pd-1', 'host-1', 'Tono sbagliato');
    expect(r.status).toBe('rejected');
    expect(updates[0]?.status).toBe('rejected');
    expect(updates[0]?.rejectionReason).toBe('Tono sbagliato');
  });

  it('reason undefined -> null in DB', async () => {
    const updates: Array<Record<string, unknown>> = [];
    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () => Promise.resolve([{ id: 'pd-1', status: 'pending' as const }]),
          }),
        }),
      }),
      update: () => ({
        set: (v: Record<string, unknown>) => {
          updates.push(v);
          return { where: () => Promise.resolve() };
        },
      }),
    } as unknown as Database;
    await rejectReplyDraft(db, 'pd-1', 'host-1');
    expect(updates[0]?.rejectionReason).toBeNull();
  });

  it('not found -> not_found', async () => {
    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () => Promise.resolve([]),
          }),
        }),
      }),
    } as unknown as Database;
    const r = await rejectReplyDraft(db, 'pd-x', 'host-1');
    expect(r.status).toBe('not_found');
  });

  it('gia rejected -> already_processed', async () => {
    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () => Promise.resolve([{ id: 'pd-1', status: 'rejected' as const }]),
          }),
        }),
      }),
    } as unknown as Database;
    const r = await rejectReplyDraft(db, 'pd-1', 'host-1');
    expect(r.status).toBe('already_processed');
  });
});
