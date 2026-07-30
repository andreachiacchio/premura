import { type Database, bookings, conversations, messages, pendingDrafts, providers } from '@premura/db';
import { describe, expect, it, vi } from 'vitest';
import { drainOutboundQueue } from '../src/jobs/outbound-queue-worker';

// Fase 4 weekend (30/07) — il worker della coda outbound e' l'unico
// punto che invia i messaggi approvati. I test pinnano le regole:
// kill switch ferma tutto senza toccare nulla, la guardia fornitori
// blocca il testo finale, gli errori diventano 'failed' solo dopo i
// tentativi massimi, e la coda non mente mai sullo stato.

type Captured = { table: string; values: Record<string, unknown> };

function tableName(table: unknown): string {
  if (table === messages) return 'messages';
  if (table === pendingDrafts) return 'pending_drafts';
  if (table === conversations) return 'conversations';
  return 'unknown';
}

function makeDb(opts: {
  queued: Array<Record<string, unknown>>;
  hostId?: string | null;
  providerPhones?: string[];
}): { db: Database; updates: Captured[] } {
  const updates: Captured[] = [];
  const db = {
    select: () => ({
      from: (table: unknown) => {
        if (table === messages) {
          return {
            where: () => ({
              orderBy: () => ({ limit: () => Promise.resolve(opts.queued) }),
            }),
          };
        }
        if (table === bookings) {
          return {
            innerJoin: () => ({
              where: () => ({
                limit: () =>
                  Promise.resolve(opts.hostId ? [{ hostId: opts.hostId }] : []),
              }),
            }),
          };
        }
        if (table === providers) {
          return {
            where: () =>
              Promise.resolve((opts.providerPhones ?? []).map((phone) => ({ phone }))),
          };
        }
        throw new Error('select su tabella inattesa');
      },
    }),
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: () => {
          updates.push({ table: tableName(table), values });
          return Promise.resolve();
        },
      }),
    }),
  } as unknown as Database;
  return { db, updates };
}

const NOW = new Date('2026-07-30T18:00:00Z');

const queuedRow = {
  id: 'm-1',
  bookingId: 'b1',
  conversationId: 'conv-1',
  body: 'Ciao Mario, il check-in è dalle 15.',
  recipientExternalId: '+393331234567',
  metadata: { reply_draft_id: 'pd-1' },
};

describe('drainOutboundQueue', () => {
  it('kill switch acceso -> coda intatta, nessun invio, nessun update', async () => {
    const sendFn = vi.fn();
    const { db, updates } = makeDb({ queued: [queuedRow] });
    const summary = await drainOutboundQueue(db, {
      sendFn,
      killSwitchOn: true,
      now: NOW,
    });
    expect(summary).toEqual({ queued: 1, sent: 0, failed: 0, blocked: 0, deferred: true });
    expect(sendFn).not.toHaveBeenCalled();
    expect(updates.length).toBe(0);
  });

  it('invio riuscito -> messaggio sent, bozza sent, disclosure marcata sulla conversazione', async () => {
    const sendFn = vi.fn().mockResolvedValue({ messageId: 'waha-99', dryRun: false });
    const { db, updates } = makeDb({ queued: [queuedRow], hostId: 'host-1' });
    const summary = await drainOutboundQueue(db, { sendFn, killSwitchOn: false, now: NOW });

    expect(summary.sent).toBe(1);
    expect(sendFn).toHaveBeenCalledWith('+393331234567', queuedRow.body);

    const msgUpdate = updates.find((u) => u.table === 'messages');
    expect(msgUpdate?.values.status).toBe('sent');
    expect(msgUpdate?.values.platformMessageId).toBe('waha-99');
    expect(msgUpdate?.values.sentAt).toEqual(NOW);

    const draftUpdate = updates.find((u) => u.table === 'pending_drafts');
    expect(draftUpdate?.values.status).toBe('sent');
    expect(draftUpdate?.values.metaMessageId).toBe('waha-99');

    const convUpdate = updates.find((u) => u.table === 'conversations');
    expect(convUpdate?.values.aiDisclosureSentAt).toEqual(NOW);
  });

  it('guardia fornitori sul testo FINALE -> blocked, bozza failed, nessun invio', async () => {
    const sendFn = vi.fn();
    const { db, updates } = makeDb({
      queued: [
        {
          ...queuedRow,
          body: 'Per il transfer chiama Antonio al +39 350 032 8207.',
        },
      ],
      hostId: 'host-1',
      providerPhones: ['+393500328207'],
    });
    const summary = await drainOutboundQueue(db, { sendFn, killSwitchOn: false, now: NOW });

    expect(summary.blocked).toBe(1);
    expect(sendFn).not.toHaveBeenCalled();
    const msgUpdate = updates.find((u) => u.table === 'messages');
    expect(msgUpdate?.values.status).toBe('blocked');
    const draftUpdate = updates.find((u) => u.table === 'pending_drafts');
    expect(draftUpdate?.values.status).toBe('failed');
  });

  it('errore di invio -> resta in coda con tentativo contato, non failed', async () => {
    const sendFn = vi.fn().mockRejectedValue(new Error('WAHA 502'));
    const { db, updates } = makeDb({ queued: [queuedRow], hostId: 'host-1' });
    const summary = await drainOutboundQueue(db, { sendFn, killSwitchOn: false, now: NOW });

    expect(summary.failed).toBe(0);
    const msgUpdate = updates.find((u) => u.table === 'messages');
    // Nessun cambio di status: solo il contatore dei tentativi.
    expect(msgUpdate?.values.status).toBeUndefined();
    expect((msgUpdate?.values.metadata as Record<string, unknown>).attempts).toBe(1);
  });

  it('terzo errore consecutivo -> failed esplicito su messaggio e bozza', async () => {
    const sendFn = vi.fn().mockRejectedValue(new Error('WAHA 502'));
    const { db, updates } = makeDb({
      queued: [{ ...queuedRow, metadata: { reply_draft_id: 'pd-1', attempts: 2 } }],
      hostId: 'host-1',
    });
    const summary = await drainOutboundQueue(db, { sendFn, killSwitchOn: false, now: NOW });

    expect(summary.failed).toBe(1);
    const msgUpdate = updates.find((u) => u.table === 'messages');
    expect(msgUpdate?.values.status).toBe('failed');
    expect((msgUpdate?.values.metadata as Record<string, unknown>).attempts).toBe(3);
    const draftUpdate = updates.find((u) => u.table === 'pending_drafts');
    expect(draftUpdate?.values.status).toBe('failed');
  });

  it('kill switch girato a meta tick (skippedReason) -> stop, riga intatta', async () => {
    const sendFn = vi.fn().mockResolvedValue({
      messageId: null,
      dryRun: false,
      skippedReason: 'kill_switch',
    });
    const { db, updates } = makeDb({ queued: [queuedRow], hostId: 'host-1' });
    const summary = await drainOutboundQueue(db, { sendFn, killSwitchOn: false, now: NOW });

    expect(summary.deferred).toBe(true);
    expect(summary.sent).toBe(0);
    expect(updates.length).toBe(0);
  });

  it('coda vuota -> nessun lavoro', async () => {
    const sendFn = vi.fn();
    const { db, updates } = makeDb({ queued: [] });
    const summary = await drainOutboundQueue(db, { sendFn, killSwitchOn: false, now: NOW });
    expect(summary).toEqual({ queued: 0, sent: 0, failed: 0, blocked: 0, deferred: false });
    expect(sendFn).not.toHaveBeenCalled();
    expect(updates.length).toBe(0);
  });
});
