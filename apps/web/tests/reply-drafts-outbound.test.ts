import type { Database } from '@premura/db';
import { describe, expect, it } from 'vitest';
import { approveAndQueueReplyDraft, rejectReplyDraft } from '../lib/repositories/reply-drafts';

// Fase 4 weekend (30/07) — unit test approveAndQueueReplyDraft +
// rejectReplyDraft. L'approve NON fa piu' chiamate di rete: il test
// verifica lo state machine puro su DB (lock atomico + insert 'queued').
// L'invio vero e' del worker outbound-queue (apps/api, test suoi).

// Drizzle mock: copre le 3 query del path:
//   1. SELECT pendingDrafts JOIN bookings LEFT JOIN messages -> draft row
//   2. UPDATE pendingDrafts -> status=approved/modified (lock)
//   3. INSERT messages -> outbound row 'queued'

type MockState = {
  draftRow: {
    draft: Record<string, unknown>;
    guestPhone: string | null;
    inboundChannel: string | null;
    inboundConversationId: string | null;
  } | null;
  inserts: Array<{ table: string; values: Record<string, unknown> }>;
  updates: Array<{ table: string; values: Record<string, unknown> }>;
  // true = un altro processo ha gia' preso il lock: l'UPDATE non matcha.
  lockTaken: boolean;
};

function makeMockDb(state: MockState): Database {
  return {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          leftJoin: () => ({
            where: () => ({
              limit: () => Promise.resolve(state.draftRow ? [state.draftRow] : []),
            }),
          }),
        }),
        where: () => ({
          limit: () => Promise.resolve([]),
        }),
      }),
    }),
    update: () => ({
      set: (vals: Record<string, unknown>) => ({
        where: () => ({
          returning: () => {
            state.updates.push({ table: 'pending_drafts', values: vals });
            return Promise.resolve(state.lockTaken ? [] : [{ id: 'pd-locked' }]);
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
      inboundConversationId: 'conv-1',
      ...opts.draftRow,
    },
    inserts: [],
    updates: [],
    lockTaken: false,
    ...opts,
  };
}

describe('approveAndQueueReplyDraft', () => {
  it('happy path: lock approved + insert messages QUEUED nel thread giusto, nessun invio', async () => {
    const state = makeState();
    const db = makeMockDb(state);

    const r = await approveAndQueueReplyDraft(db, 'pd-1', baseDraft.draftResponse, 'host-1');

    expect(r.status).toBe('queued');
    if (r.status === 'queued') {
      expect(r.messageId).toBe('msg-inserted');
    }
    // Lock: body identico al draft -> status 'approved' (non 'modified').
    expect(state.updates.length).toBe(1);
    expect(state.updates[0]?.values.status).toBe('approved');
    expect(state.updates[0]?.values.finalResponseSent).toBe(baseDraft.draftResponse);
    // Insert: 'queued', niente sent_at, niente platform id, thread giusto.
    expect(state.inserts.length).toBe(1);
    const msgInsert = state.inserts[0];
    expect(msgInsert?.values.status).toBe('queued');
    expect(msgInsert?.values.sentAt).toBeUndefined();
    expect(msgInsert?.values.platformMessageId).toBeUndefined();
    expect(msgInsert?.values.conversationId).toBe('conv-1');
    expect(msgInsert?.values.direction).toBe('outbound');
    expect(msgInsert?.values.recipientExternalId).toBe('+393331234567');
    expect((msgInsert?.values.metadata as Record<string, unknown>).reply_draft_id).toBe('pd-1');
  });

  it('body modificato dall host -> lock con status modified', async () => {
    const state = makeState();
    const db = makeMockDb(state);
    const r = await approveAndQueueReplyDraft(db, 'pd-1', 'Testo riscritto dall host.', 'host-1');
    expect(r.status).toBe('queued');
    expect(state.updates[0]?.values.status).toBe('modified');
    expect(state.updates[0]?.values.finalResponseSent).toBe('Testo riscritto dall host.');
    expect(state.inserts[0]?.values.body).toBe('Testo riscritto dall host.');
  });

  it('draft not found -> not_found', async () => {
    const state = makeState({ draftRow: null });
    state.draftRow = null;
    const db = makeMockDb(state);
    const r = await approveAndQueueReplyDraft(db, 'pd-x', 'body', 'host-1');
    expect(r.status).toBe('not_found');
    expect(state.inserts.length).toBe(0);
  });

  it('no guest phone -> no_guest_phone, niente coda', async () => {
    const state = makeState();
    state.draftRow = {
      draft: { ...baseDraft },
      guestPhone: null,
      inboundChannel: 'whatsapp',
      inboundConversationId: 'conv-1',
    };
    const db = makeMockDb(state);
    const r = await approveAndQueueReplyDraft(db, 'pd-1', 'body', 'host-1');
    expect(r.status).toBe('no_guest_phone');
    expect(state.inserts.length).toBe(0);
  });

  it('canale email -> channel_not_supported', async () => {
    const state = makeState();
    state.draftRow = {
      draft: { ...baseDraft },
      guestPhone: '+393331234567',
      inboundChannel: 'email',
      inboundConversationId: null,
    };
    const db = makeMockDb(state);
    const r = await approveAndQueueReplyDraft(db, 'pd-1', 'body', 'host-1');
    expect(r.status).toBe('channel_not_supported');
    if (r.status === 'channel_not_supported') {
      expect(r.channel).toBe('email');
    }
    expect(state.inserts.length).toBe(0);
  });

  it('draft gia approvato (idempotency) -> already_processed, niente doppia coda', async () => {
    const state = makeState();
    state.draftRow = {
      draft: { ...baseDraft, status: 'approved' },
      guestPhone: '+393331234567',
      inboundChannel: 'whatsapp',
      inboundConversationId: 'conv-1',
    };
    const db = makeMockDb(state);
    const r = await approveAndQueueReplyDraft(db, 'pd-1', 'body proper', 'host-1');
    expect(r.status).toBe('already_processed');
    expect(state.inserts.length).toBe(0);
    expect(state.updates.length).toBe(0);
  });

  it('race condition: lock perso -> already_processed, nessun insert', async () => {
    const state = makeState();
    state.lockTaken = true;
    const db = makeMockDb(state);
    const r = await approveAndQueueReplyDraft(db, 'pd-1', 'body proper', 'host-1');
    expect(r.status).toBe('already_processed');
    expect(state.inserts.length).toBe(0);
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
