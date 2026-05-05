import type { Database } from '@premura/db';
import { describe, expect, it, vi } from 'vitest';
import { ingestAirbnbMessage, ingestBookingMessage } from '../lib/gmail-message-ingestor';

// Test ingestor messages Gmail (slice 7a.2). Mock Drizzle inline +
// mock parser AI (no Anthropic API). Esercita il flusso di
// classificazione + lookup booking + persist via il repository
// messages (mockato).

// Mock Drizzle:
//   - select().from(table) ritorna una "chain" che si ramifica in
//     innerJoin (booking lookup) o where().limit() (conversation/message
//     lookup).
//   - Il discriminante del lookup e': se la query ha innerJoin -> e' il
//     booking lookup; altrimenti -> conversation o message (gestiamo
//     entrambe via stato sequenziale, l'ingestor cerca prima messages
//     [dedup], poi conversations [se booking matchato]).
//   - insert(table).values(v).returning() pusha la call e ritorna fake id;
//     identifichiamo il "table" via shape dei values (presenza di campi
//     channel+direction = messages; channel+lastMessageAt = conversations).
function makeMockDb(opts: {
  bookingMatch?: { id: string };
  existingMessage?: { id: string; conversationId: string | null };
  existingConv?: { id: string };
}) {
  const insertCalls: {
    table: 'messages' | 'conversations' | 'unknown';
    values: Record<string, unknown>;
  }[] = [];
  const updateCalls: { values: unknown }[] = [];

  // State machine sull'ordine dei select:
  //   1° select.from(messages).where(eq(platformMessageId)) -> messages dedup
  //   2° select.from(bookings).innerJoin(properties).where(...) -> booking lookup
  //   3° select.from(conversations).where(...) -> conversation lookup-or-insert
  let selectCount = 0;

  const mock = {
    select: () => ({
      from: () => {
        selectCount++;
        const currentStep = selectCount;
        return {
          innerJoin: () => ({
            where: () => ({
              limit: () => Promise.resolve(opts.bookingMatch ? [opts.bookingMatch] : []),
            }),
          }),
          where: () => ({
            limit: () => {
              if (currentStep === 1) {
                // messages dedup
                return Promise.resolve(opts.existingMessage ? [opts.existingMessage] : []);
              }
              // conversation lookup (3° select se non skippa il booking)
              return Promise.resolve(opts.existingConv ? [opts.existingConv] : []);
            },
          }),
        };
      },
    }),
    insert: () => ({
      values: (vals: Record<string, unknown>) => {
        const isMessage = 'direction' in vals && 'fromEntity' in vals;
        const isConversation = 'lastMessageAt' in vals && !('direction' in vals);
        const tableLabel: 'messages' | 'conversations' | 'unknown' = isMessage
          ? 'messages'
          : isConversation
            ? 'conversations'
            : 'unknown';
        insertCalls.push({ table: tableLabel, values: vals });
        return {
          returning: () => Promise.resolve([{ id: `${tableLabel}-id-${insertCalls.length}` }]),
        };
      },
    }),
    update: () => ({
      set: (vals: unknown) => {
        updateCalls.push({ values: vals });
        return {
          where: () => Promise.resolve(),
        };
      },
    }),
  };

  return { db: mock as unknown as Database, insertCalls, updateCalls };
}

describe('ingestBookingMessage', () => {
  it('subject non-message -> skipped_not_message', async () => {
    const { db } = makeMockDb({});
    const r = await ingestBookingMessage(db, {
      hostId: 'host-1',
      emailId: 'gmail-msg-1',
      emailReceivedAt: new Date('2026-05-04T12:00:00Z'),
      subject: 'Booking.com - Hai una nuova prenotazione! (123, abc)',
      htmlBody: '',
      textBody: '',
      snippet: '',
    });
    expect(r.status).toBe('skipped_not_message');
    expect(r.bookingId).toBeNull();
  });

  it('subject message + booking matchato -> inserted', async () => {
    const { db, insertCalls } = makeMockDb({
      bookingMatch: { id: 'booking-1' },
    });
    const r = await ingestBookingMessage(db, {
      hostId: 'host-1',
      emailId: 'gmail-msg-2',
      emailReceivedAt: new Date('2026-05-04T12:00:00Z'),
      subject: 'Booking.com - Hai un nuovo messaggio da Mario Rossi (1234567, La Goccia)',
      htmlBody: '<blockquote>Ciao, posso fare check-in alle 16?</blockquote>',
      textBody: '',
      snippet: 'Ciao, posso fare check-in alle 16?',
    });
    expect(r.status).toBe('inserted');
    expect(r.bookingId).toBe('booking-1');

    // Verifica che il messaggio sia stato persistito con i campi giusti.
    const msgInsert = insertCalls.find((c) => c.table === 'messages');
    expect(msgInsert).toBeDefined();
    const vals = msgInsert?.values as Record<string, unknown>;
    expect(vals.channel).toBe('booking_inbox');
    expect(vals.direction).toBe('inbound');
    expect(vals.fromEntity).toBe('guest');
    expect(vals.bookingId).toBe('booking-1');
    expect((vals.body as string).includes('check-in alle 16')).toBe(true);
    expect((vals.metadata as Record<string, unknown>).sender_name).toBe('Mario Rossi');
    expect((vals.metadata as Record<string, unknown>).booking_code).toBe('1234567');
    expect((vals.metadata as Record<string, unknown>).signal_only).toBe(false);
  });

  it('subject message senza booking match -> orphan_inserted', async () => {
    const { db, insertCalls } = makeMockDb({});
    const r = await ingestBookingMessage(db, {
      hostId: 'host-1',
      emailId: 'gmail-msg-3',
      emailReceivedAt: new Date('2026-05-04T12:00:00Z'),
      subject: 'Booking.com - Hai un nuovo messaggio da Mario Rossi (9999, X)',
      htmlBody: '',
      textBody: '',
      snippet: 'Apri Extranet per leggerlo',
    });
    expect(r.status).toBe('orphan_inserted');
    expect(r.bookingId).toBeNull();

    const msgInsert = insertCalls.find((c) => c.table === 'messages');
    const vals = msgInsert?.values as Record<string, unknown>;
    expect(vals.bookingId).toBeNull();
    expect((vals.metadata as Record<string, unknown>).orphan).toBe(true);
    expect((vals.metadata as Record<string, unknown>).signal_only).toBe(true);
    expect((vals.body as string).startsWith('[Booking message')).toBe(true);
  });

  it('duplicate gmail message id -> duplicate_skipped', async () => {
    const { db } = makeMockDb({
      existingMessage: { id: 'existing-msg', conversationId: 'conv-existing' },
    });
    const r = await ingestBookingMessage(db, {
      hostId: 'host-1',
      emailId: 'gmail-msg-DUP',
      emailReceivedAt: new Date('2026-05-04T12:00:00Z'),
      subject: 'Booking.com - Hai un nuovo messaggio da Mario Rossi',
      htmlBody: '<blockquote>X</blockquote>',
      textBody: '',
      snippet: '',
    });
    expect(r.status).toBe('duplicate_skipped');
    expect(r.messageId).toBe('existing-msg');
  });
});

describe('ingestAirbnbMessage', () => {
  const fakeParser = vi.fn().mockResolvedValue({
    guest_message_original: 'Hello, can I check in early?',
    guest_message_lang: 'en',
    airbnb_thread_id: 'thread-abc',
    booking_external_code: 'HM4XDFHECP',
    property_name: 'La Goccia',
  });

  it('subject non-message -> skipped_not_message + no parser AI call', async () => {
    fakeParser.mockClear();
    const { db } = makeMockDb({});
    const r = await ingestAirbnbMessage(db, {
      hostId: 'host-1',
      emailId: 'gmail-msg-X',
      emailReceivedAt: new Date(),
      subject: 'Nuova prenotazione confermata!',
      htmlBody: '',
      textBody: '',
      parser: fakeParser,
    });
    expect(r.status).toBe('skipped_not_message');
    expect(fakeParser).not.toHaveBeenCalled();
  });

  it('subject message + parser AI restituisce body + booking match -> inserted', async () => {
    fakeParser.mockClear();
    const { db, insertCalls } = makeMockDb({
      bookingMatch: { id: 'booking-airbnb-1' },
    });
    const r = await ingestAirbnbMessage(db, {
      hostId: 'host-1',
      emailId: 'gmail-msg-Y',
      emailReceivedAt: new Date('2026-05-04T12:00:00Z'),
      subject: 'New message from John Smith',
      htmlBody: '<html>...</html>',
      textBody: 'plain text',
      parser: fakeParser,
    });
    expect(r.status).toBe('inserted');
    expect(r.bookingId).toBe('booking-airbnb-1');
    expect(fakeParser).toHaveBeenCalledOnce();

    const msgInsert = insertCalls.find((c) => c.table === 'messages');
    const vals = msgInsert?.values as Record<string, unknown>;
    expect(vals.channel).toBe('airbnb_inbox');
    expect(vals.body).toBe('Hello, can I check in early?');
    expect(vals.language).toBe('en');
    expect((vals.metadata as Record<string, unknown>).sender_name).toBe('John Smith');
    expect((vals.metadata as Record<string, unknown>).airbnb_thread_id).toBe('thread-abc');
  });

  it('parser AI throws -> orphan inserted con metadata.parser_error', async () => {
    const failingParser = vi.fn().mockRejectedValue(new Error('Anthropic timeout'));
    const { db, insertCalls } = makeMockDb({});
    const r = await ingestAirbnbMessage(db, {
      hostId: 'host-1',
      emailId: 'gmail-msg-Z',
      emailReceivedAt: new Date(),
      subject: 'New message from John Smith',
      htmlBody: '<html>x</html>',
      textBody: '',
      parser: failingParser,
    });
    expect(r.status).toBe('orphan_inserted');

    const msgInsert = insertCalls.find((c) => c.table === 'messages');
    const vals = msgInsert?.values as Record<string, unknown>;
    expect((vals.metadata as Record<string, unknown>).parser_error).toBe('Anthropic timeout');
    expect((vals.body as string).includes('parser error')).toBe(true);
  });

  it('parser AI restituisce booking_code ma nessun booking matchato -> orphan_inserted', async () => {
    fakeParser.mockClear();
    const { db } = makeMockDb({}); // no bookingMatch
    const r = await ingestAirbnbMessage(db, {
      hostId: 'host-1',
      emailId: 'gmail-msg-W',
      emailReceivedAt: new Date(),
      subject: 'New message from Anna',
      htmlBody: '<html>x</html>',
      textBody: '',
      parser: fakeParser,
    });
    expect(r.status).toBe('orphan_inserted');
    expect(r.bookingId).toBeNull();
  });
});
