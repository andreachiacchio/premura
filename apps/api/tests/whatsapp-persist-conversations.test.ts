import { bookings, conversations, messages } from '@premura/db';
import { describe, expect, it } from 'vitest';
import { persistInboundMessage } from '../src/api/webhooks/whatsapp-persist';

// Fase 2 weekend (30/07): conversazioni cablate. I tre casi richiesti:
// inbound da numero noto, inbound da numero sconosciuto (conversation
// NON attribuita, mai scartata), due inbound consecutivi che devono
// finire nella STESSA conversation.
//
// Finto Database sul pattern di reserve-and-send-contact-leak: le
// catene drizzle risolvono per identita' di tabella. La select sulle
// conversations restituisce lo store corrente, cosi' il secondo inbound
// trova la conversation creata dal primo.

type ConvRow = { id: string; bookingId: string | null; externalThreadId: string };

function makeFakeDb(bookingMatch: Array<{ id: string; checkinAt: Date }>) {
  const convStore: ConvRow[] = [];
  const insertedMessages: Array<Record<string, unknown>> = [];
  let convSeq = 0;
  let msgSeq = 0;
  let convUpdates = 0;

  const selectResult = (table: unknown): Promise<unknown[]> => {
    if (table === messages) return Promise.resolve([]);
    if (table === bookings) return Promise.resolve(bookingMatch);
    if (table === conversations) return Promise.resolve([...convStore]);
    return Promise.resolve([]);
  };

  const db = {
    select: () => ({
      from: (table: unknown) => ({
        where: () => ({
          limit: () => selectResult(table),
          orderBy: () => ({ limit: () => selectResult(table) }),
        }),
      }),
    }),
    insert: (table: unknown) => ({
      values: (v: Record<string, unknown>) => ({
        returning: () => {
          if (table === conversations) {
            convSeq += 1;
            const row: ConvRow = {
              id: `conv-${convSeq}`,
              bookingId: (v.bookingId as string | null) ?? null,
              externalThreadId: v.externalThreadId as string,
            };
            convStore.push(row);
            return Promise.resolve([{ id: row.id }]);
          }
          msgSeq += 1;
          insertedMessages.push(v);
          return Promise.resolve([{ id: `msg-${msgSeq}` }]);
        },
      }),
    }),
    update: () => ({
      set: () => ({
        where: () => {
          convUpdates += 1;
          return Promise.resolve();
        },
      }),
    }),
  };

  return {
    db: db as never,
    convStore,
    insertedMessages,
    counters: { get convUpdates() { return convUpdates; } },
  };
}

function inbound(msgId: string, from: string) {
  return {
    message: {
      id: msgId,
      from,
      timestamp: '1785400000',
      type: 'text' as const,
      text: { body: 'Ciao, a che ora è il check-in?' },
    },
    contactName: 'Test Guest',
    wabaId: 'waba-1',
    phoneNumberId: 'phone-1',
  } as never;
}

const NOW = new Date('2026-07-30T16:00:00Z');

describe('persistInboundMessage — Fase 2', () => {
  it('numero NOTO: conversation legata al booking attivo, messaggio received', async () => {
    const fake = makeFakeDb([{ id: 'bk-julian', checkinAt: new Date('2026-08-01') }]);
    const result = await persistInboundMessage(fake.db, inbound('wamid-1', '4748356805'), NOW);

    expect(result.status).toBe('inserted');
    expect(result.bookingId).toBe('bk-julian');
    expect(result.conversationId).toBe('conv-1');
    expect(fake.convStore[0]?.bookingId).toBe('bk-julian');
    expect(fake.insertedMessages[0]).toMatchObject({
      direction: 'inbound',
      channel: 'whatsapp',
      status: 'received',
      bookingId: 'bk-julian',
      conversationId: 'conv-1',
    });
  });

  it('numero SCONOSCIUTO: conversation creata comunque, non attribuita, nulla scartato', async () => {
    const fake = makeFakeDb([]);
    const result = await persistInboundMessage(fake.db, inbound('wamid-2', '491701234567'), NOW);

    expect(result.status).toBe('orphan_inserted');
    expect(result.bookingId).toBeNull();
    expect(result.conversationId).toBe('conv-1');
    expect(fake.convStore[0]?.bookingId).toBeNull();
    expect(fake.insertedMessages[0]).toMatchObject({
      conversationId: 'conv-1',
      bookingId: null,
      status: 'received',
    });
    expect((fake.insertedMessages[0]?.metadata as Record<string, unknown>).orphan).toBe(true);
  });

  it('due inbound consecutivi dallo stesso numero: STESSA conversation', async () => {
    const fake = makeFakeDb([]);
    const first = await persistInboundMessage(fake.db, inbound('wamid-3', '491701234567'), NOW);
    const second = await persistInboundMessage(fake.db, inbound('wamid-4', '491701234567'), NOW);

    expect(first.conversationId).toBe('conv-1');
    expect(second.conversationId).toBe('conv-1');
    expect(fake.convStore).toHaveLength(1);
    expect(fake.counters.convUpdates).toBe(1);
    expect(fake.insertedMessages).toHaveLength(2);
  });
});
