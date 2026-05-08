import type { Database } from '@premura/db';
import { describe, expect, it } from 'vitest';
import { applyOutboundStatusUpdate } from '../src/api/webhooks/whatsapp-status-persist';

// Slice 7B — unit test status update flow.
// Drizzle mock: select message by wamid, update timestamps, select
// pending_draft by metaMessageId, optional update on failed.

type MockState = {
  msg: {
    id: string;
    deliveredAt: Date | null;
    readAt: Date | null;
    failedAt: Date | null;
  } | null;
  draft: { id: string; status: string } | null;
  msgUpdates: Array<Record<string, unknown>>;
  draftUpdates: Array<Record<string, unknown>>;
};

function makeMockDb(state: MockState): Database {
  let selectCount = 0;
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => {
            selectCount++;
            // 1: messages by platformMessageId
            // 2: pendingDrafts by metaMessageId
            if (selectCount === 1) return Promise.resolve(state.msg ? [state.msg] : []);
            return Promise.resolve(state.draft ? [state.draft] : []);
          },
        }),
      }),
    }),
    update: () => ({
      set: (vals: Record<string, unknown>) => ({
        where: () => {
          // Distinguiamo tra messages/pendingDrafts via le chiavi.
          if ('deliveredAt' in vals || 'readAt' in vals || 'failedAt' in vals) {
            state.msgUpdates.push(vals);
          } else {
            state.draftUpdates.push(vals);
          }
          return Promise.resolve();
        },
      }),
    }),
  } as unknown as Database;
}

describe('applyOutboundStatusUpdate', () => {
  it('no_match: wamid unknown -> matched=false', async () => {
    const state: MockState = {
      msg: null,
      draft: null,
      msgUpdates: [],
      draftUpdates: [],
    };
    const r = await applyOutboundStatusUpdate(makeMockDb(state), {
      wamid: 'wamid.UNKNOWN',
      status: 'delivered',
      timestamp: new Date(),
      errorMessage: null,
    });
    expect(r.matched).toBe(false);
    expect(r.applied).toBe('no_match');
    expect(state.msgUpdates).toHaveLength(0);
  });

  it('delivered: aggiorna messages.deliveredAt + nessun update pending_drafts', async () => {
    const state: MockState = {
      msg: { id: 'm-1', deliveredAt: null, readAt: null, failedAt: null },
      draft: { id: 'pd-1', status: 'sent' },
      msgUpdates: [],
      draftUpdates: [],
    };
    const ts = new Date('2026-05-08T10:00:00Z');
    const r = await applyOutboundStatusUpdate(makeMockDb(state), {
      wamid: 'wamid.A',
      status: 'delivered',
      timestamp: ts,
      errorMessage: null,
    });
    expect(r.matched).toBe(true);
    expect(r.applied).toBe('updated');
    expect(state.msgUpdates).toEqual([{ deliveredAt: ts }]);
    expect(state.draftUpdates).toHaveLength(0); // delivered non tocca pending_drafts
  });

  it('read: aggiorna readAt + deliveredAt (se mancante)', async () => {
    const state: MockState = {
      msg: { id: 'm-1', deliveredAt: null, readAt: null, failedAt: null },
      draft: null,
      msgUpdates: [],
      draftUpdates: [],
    };
    const ts = new Date('2026-05-08T10:05:00Z');
    const r = await applyOutboundStatusUpdate(makeMockDb(state), {
      wamid: 'wamid.B',
      status: 'read',
      timestamp: ts,
      errorMessage: null,
    });
    expect(r.matched).toBe(true);
    expect(state.msgUpdates).toEqual([{ readAt: ts, deliveredAt: ts }]);
  });

  it('read con deliveredAt gia presente -> setta solo readAt', async () => {
    const state: MockState = {
      msg: {
        id: 'm-1',
        deliveredAt: new Date('2026-05-08T09:59:00Z'),
        readAt: null,
        failedAt: null,
      },
      draft: null,
      msgUpdates: [],
      draftUpdates: [],
    };
    const ts = new Date('2026-05-08T10:05:00Z');
    await applyOutboundStatusUpdate(makeMockDb(state), {
      wamid: 'wamid.C',
      status: 'read',
      timestamp: ts,
      errorMessage: null,
    });
    expect(state.msgUpdates).toEqual([{ readAt: ts }]);
  });

  it('failed: aggiorna messages.failedAt + pending_drafts.status=failed', async () => {
    const state: MockState = {
      msg: { id: 'm-1', deliveredAt: null, readAt: null, failedAt: null },
      draft: { id: 'pd-1', status: 'sent' },
      msgUpdates: [],
      draftUpdates: [],
    };
    const ts = new Date('2026-05-08T10:00:00Z');
    const r = await applyOutboundStatusUpdate(makeMockDb(state), {
      wamid: 'wamid.D',
      status: 'failed',
      timestamp: ts,
      errorMessage: 'recipient unreachable',
    });
    expect(r.matched).toBe(true);
    expect(state.msgUpdates).toEqual([{ failedAt: ts, failureReason: 'recipient unreachable' }]);
    expect(state.draftUpdates).toHaveLength(1);
    expect(state.draftUpdates[0]?.status).toBe('failed');
    expect(state.draftUpdates[0]?.errorLog).toBe('recipient unreachable');
  });

  it('idempotency: deliveredAt gia settato -> no update', async () => {
    const state: MockState = {
      msg: {
        id: 'm-1',
        deliveredAt: new Date('2026-05-08T09:59:00Z'),
        readAt: null,
        failedAt: null,
      },
      draft: null,
      msgUpdates: [],
      draftUpdates: [],
    };
    const r = await applyOutboundStatusUpdate(makeMockDb(state), {
      wamid: 'wamid.E',
      status: 'delivered',
      timestamp: new Date('2026-05-08T10:00:00Z'),
      errorMessage: null,
    });
    expect(r.matched).toBe(true);
    expect(r.applied).toBe('already_applied');
    expect(state.msgUpdates).toHaveLength(0);
  });

  it('failed gia processato (draft.status=failed) -> non rifa update pending_drafts', async () => {
    const state: MockState = {
      msg: { id: 'm-1', deliveredAt: null, readAt: null, failedAt: null },
      draft: { id: 'pd-1', status: 'failed' },
      msgUpdates: [],
      draftUpdates: [],
    };
    await applyOutboundStatusUpdate(makeMockDb(state), {
      wamid: 'wamid.F',
      status: 'failed',
      timestamp: new Date(),
      errorMessage: 'second time',
    });
    // messages update si (failedAt era null) ma pending_drafts no.
    expect(state.draftUpdates).toHaveLength(0);
  });
});
