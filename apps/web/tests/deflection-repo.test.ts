import type { Database } from '@premura/db';
import { describe, expect, it } from 'vitest';
import {
  DEFLECTION_KIND,
  getOrCreateDeflectionDraft,
  markDeflectionSent,
} from '../lib/deflection-draft';

// Test della logica getOrCreateDeflectionDraft + markDeflectionSent
// (slice 7a.3) con mock Drizzle inline. Stesso pattern di
// gmail-message-ingestor.test.ts: state machine sequenziale dei select.

type MockOpts = {
  bookingRow?: {
    id: string;
    platform: 'booking' | 'airbnb' | 'whatsapp';
    guestFullName: string;
    guestFirstName: string | null;
    guestLanguage: string | null;
    checkoutAt: Date;
    propertyName: string;
    hostId: string;
  };
  existingDraft?: {
    id: string;
    bookingId: string;
    hostId: string;
    draftResponse: string;
    status: 'pending' | 'approved' | 'rejected' | 'modified' | 'expired';
    metadata: Record<string, unknown>;
    createdAt: Date;
    expiresAt: Date;
  };
};

function makeMockDb(opts: MockOpts) {
  const insertCalls: Array<{ table: string; values: Record<string, unknown> }> = [];
  const updateCalls: Array<{ values: Record<string, unknown> }> = [];

  let selectCount = 0;
  const mock = {
    select: () => ({
      from: () => {
        selectCount++;
        const step = selectCount;
        return {
          innerJoin: () => ({
            where: () => ({
              limit: () => Promise.resolve(opts.bookingRow ? [opts.bookingRow] : []),
            }),
          }),
          where: () => ({
            limit: () => {
              if (step === 2) {
                // pending_drafts lookup (after the booking innerJoin)
                return Promise.resolve(opts.existingDraft ? [opts.existingDraft] : []);
              }
              // markDeflectionSent: select draft by id (1° select)
              return Promise.resolve(opts.existingDraft ? [opts.existingDraft] : []);
            },
          }),
        };
      },
    }),
    insert: () => ({
      values: (vals: Record<string, unknown>) => {
        const isMessage = 'direction' in vals;
        insertCalls.push({
          table: isMessage ? 'messages' : 'pending_drafts',
          values: vals,
        });
        return {
          returning: () =>
            Promise.resolve([
              {
                id: `${isMessage ? 'msg' : 'draft'}-id-${insertCalls.length}`,
                bookingId: vals.bookingId,
                hostId: vals.hostId,
                draftResponse: vals.draftResponse,
                status: 'pending',
                metadata: vals.metadata ?? {},
                createdAt: new Date(),
                expiresAt: vals.expiresAt,
              },
            ]),
        };
      },
    }),
    update: () => ({
      set: (vals: Record<string, unknown>) => {
        updateCalls.push({ values: vals });
        return {
          where: () => Promise.resolve(),
        };
      },
    }),
  };

  return { db: mock as unknown as Database, insertCalls, updateCalls };
}

describe('getOrCreateDeflectionDraft', () => {
  const futureCheckout = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  it('booking non trovata -> null', async () => {
    const { db } = makeMockDb({});
    const r = await getOrCreateDeflectionDraft(db, 'booking-x', '+39 351 451 2070');
    expect(r).toBeNull();
  });

  it('booking platform whatsapp (non platform-based) -> null', async () => {
    const { db } = makeMockDb({
      bookingRow: {
        id: 'b-1',
        platform: 'whatsapp' as 'booking' | 'airbnb' | 'whatsapp',
        guestFullName: 'Mario Rossi',
        guestFirstName: 'Mario',
        guestLanguage: 'it',
        checkoutAt: futureCheckout,
        propertyName: 'La Goccia',
        hostId: 'host-1',
      },
    });
    const r = await getOrCreateDeflectionDraft(db, 'b-1', '+39 351 451 2070');
    expect(r).toBeNull();
  });

  it('booking nuovo + draft inesistente -> insert + ritorna draft', async () => {
    const { db, insertCalls } = makeMockDb({
      bookingRow: {
        id: 'b-1',
        platform: 'booking',
        guestFullName: 'Mario Rossi',
        guestFirstName: 'Mario',
        guestLanguage: 'it',
        checkoutAt: futureCheckout,
        propertyName: 'La Goccia',
        hostId: 'host-1',
      },
    });

    const r = await getOrCreateDeflectionDraft(db, 'b-1', '+39 351 451 2070');
    expect(r).not.toBeNull();
    expect(r?.bookingId).toBe('b-1');

    const draftInsert = insertCalls.find((c) => c.table === 'pending_drafts');
    expect(draftInsert).toBeDefined();
    expect(draftInsert?.values.kind).toBe(DEFLECTION_KIND);
    expect((draftInsert?.values.metadata as Record<string, unknown>).target_channel).toBe(
      'booking_inbox',
    );
    expect((draftInsert?.values.metadata as Record<string, unknown>).wa_number).toBe(
      '+39 351 451 2070',
    );
    expect((draftInsert?.values.draftResponse as string).startsWith('Ciao Mario')).toBe(true);
    expect((draftInsert?.values.draftResponse as string).endsWith('— La Goccia')).toBe(true);
  });

  it('booking airbnb -> target_channel = airbnb_inbox', async () => {
    const { db, insertCalls } = makeMockDb({
      bookingRow: {
        id: 'b-2',
        platform: 'airbnb',
        guestFullName: 'John Smith',
        guestFirstName: 'John',
        guestLanguage: 'en',
        checkoutAt: futureCheckout,
        propertyName: 'La Goccia',
        hostId: 'host-1',
      },
    });
    await getOrCreateDeflectionDraft(db, 'b-2', '+39 351 451 2070');
    const draftInsert = insertCalls.find((c) => c.table === 'pending_drafts');
    expect((draftInsert?.values.metadata as Record<string, unknown>).target_channel).toBe(
      'airbnb_inbox',
    );
    expect((draftInsert?.values.draftResponse as string).startsWith('Hi John')).toBe(true);
  });

  it('draft gia esistente -> ritorna esistente, no insert nuovo', async () => {
    const { db, insertCalls } = makeMockDb({
      bookingRow: {
        id: 'b-3',
        platform: 'booking',
        guestFullName: 'Mario Rossi',
        guestFirstName: 'Mario',
        guestLanguage: 'it',
        checkoutAt: futureCheckout,
        propertyName: 'La Goccia',
        hostId: 'host-1',
      },
      existingDraft: {
        id: 'draft-existing',
        bookingId: 'b-3',
        hostId: 'host-1',
        draftResponse: 'esistente',
        status: 'pending',
        metadata: { target_channel: 'booking_inbox' },
        createdAt: new Date(),
        expiresAt: futureCheckout,
      },
    });
    const r = await getOrCreateDeflectionDraft(db, 'b-3', '+39 351 451 2070');
    expect(r?.id).toBe('draft-existing');
    expect(r?.draftResponse).toBe('esistente');
    expect(insertCalls.find((c) => c.table === 'pending_drafts')).toBeUndefined();
  });

  it('booking con guestFirstName null -> usa first token di guestFullName', async () => {
    const { db, insertCalls } = makeMockDb({
      bookingRow: {
        id: 'b-4',
        platform: 'booking',
        guestFullName: 'Anna van Dijsseldonk',
        guestFirstName: null,
        guestLanguage: 'it',
        checkoutAt: futureCheckout,
        propertyName: 'La Goccia',
        hostId: 'host-1',
      },
    });
    await getOrCreateDeflectionDraft(db, 'b-4', '+39 351 451 2070');
    const draftInsert = insertCalls.find((c) => c.table === 'pending_drafts');
    expect((draftInsert?.values.draftResponse as string).startsWith('Ciao Anna')).toBe(true);
  });
});

describe('markDeflectionSent', () => {
  const futureCheckout = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  it('draft non trovato -> not_found', async () => {
    const { db } = makeMockDb({});
    const r = await markDeflectionSent(db, 'draft-x');
    expect(r.status).toBe('not_found');
  });

  it('draft pending -> marked + insert message outbound', async () => {
    const { db, insertCalls, updateCalls } = makeMockDb({
      existingDraft: {
        id: 'draft-1',
        bookingId: 'b-1',
        hostId: 'host-1',
        draftResponse: 'Ciao Mario, scrivimi su WA',
        status: 'pending',
        metadata: { target_channel: 'booking_inbox', wa_number: '+39 351 451 2070' },
        createdAt: new Date(),
        expiresAt: futureCheckout,
      },
    });

    const r = await markDeflectionSent(db, 'draft-1');
    expect(r.status).toBe('marked');
    expect(r.messageId).toBeDefined();

    // Update sul pending_drafts (status approved)
    expect(updateCalls.length).toBe(1);

    // Insert messages outbound
    const msgInsert = insertCalls.find((c) => c.table === 'messages');
    expect(msgInsert).toBeDefined();
    const vals = msgInsert?.values as Record<string, unknown>;
    expect(vals.channel).toBe('booking_inbox');
    expect(vals.direction).toBe('outbound');
    expect(vals.fromEntity).toBe('host');
    expect(vals.toEntity).toBe('guest');
    expect(vals.body).toBe('Ciao Mario, scrivimi su WA');
    expect((vals.metadata as Record<string, unknown>).deflection_attempt).toBe(true);
    expect((vals.metadata as Record<string, unknown>).deflection_draft_id).toBe('draft-1');
  });

  it('draft gia approved -> already_marked, no nuovo message', async () => {
    const { db, insertCalls } = makeMockDb({
      existingDraft: {
        id: 'draft-2',
        bookingId: 'b-2',
        hostId: 'host-1',
        draftResponse: 'X',
        status: 'approved',
        metadata: { target_channel: 'booking_inbox' },
        createdAt: new Date(),
        expiresAt: futureCheckout,
      },
    });

    const r = await markDeflectionSent(db, 'draft-2');
    expect(r.status).toBe('already_marked');
    expect(insertCalls.find((c) => c.table === 'messages')).toBeUndefined();
  });

  it('draft con target_channel airbnb_inbox -> message channel coerente', async () => {
    const { db, insertCalls } = makeMockDb({
      existingDraft: {
        id: 'draft-3',
        bookingId: 'b-3',
        hostId: 'host-1',
        draftResponse: 'Hi John, write me on WA',
        status: 'pending',
        metadata: { target_channel: 'airbnb_inbox', wa_number: '+39 351 451 2070' },
        createdAt: new Date(),
        expiresAt: futureCheckout,
      },
    });

    await markDeflectionSent(db, 'draft-3');
    const msgInsert = insertCalls.find((c) => c.table === 'messages');
    expect((msgInsert?.values as Record<string, unknown>).channel).toBe('airbnb_inbox');
  });
});
