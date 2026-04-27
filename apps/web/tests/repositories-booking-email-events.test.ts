import { describe, it, expect, vi } from 'vitest';
import {
  insertBookingEmailEvent,
  existsBookingEmailEvent,
  type BookingEmailEventInsert,
} from '../lib/repositories/booking-email-events';
import type { Database } from '@premura/db';

// Test unit del repository booking_email_events (M2a.3 Fase 3) con DB
// mockato. La logica vera dell'idempotenza onConflictDoNothing è coperta
// dall'integration test (testcontainer Postgres), qui verifichiamo solo
// che la chain Drizzle venga assemblata correttamente.

function buildInsert(
  overrides: Partial<BookingEmailEventInsert> = {},
): BookingEmailEventInsert {
  return {
    hostId: 'host-uuid',
    bookingId: null,
    eventType: 'new_booking',
    bookingExternalCode: '1234567',
    rawSubject: 'Booking.com - Hai una nuova prenotazione! (1234567, X)',
    rawEmailId: 'gmail-msg-1',
    emailReceivedAt: new Date('2026-04-25T10:00:00Z'),
    ingestionStatus: 'unmatched',
    ingestionReason: null,
    ...overrides,
  };
}

describe('insertBookingEmailEvent', () => {
  it('inserisce nuova riga con onConflictDoNothing → ritorna inserted=true', async () => {
    const returningSpy = vi.fn(async () => [{ id: 'audit-uuid' }]);
    const onConflictSpy = vi.fn().mockReturnValue({ returning: returningSpy });
    const valuesSpy = vi.fn().mockReturnValue({ onConflictDoNothing: onConflictSpy });
    const db = {
      insert: vi.fn().mockReturnValue({ values: valuesSpy }),
    } as unknown as Database;

    const result = await insertBookingEmailEvent(db, buildInsert());
    expect(result).toEqual({ inserted: true });
    expect(valuesSpy).toHaveBeenCalledOnce();
    const payload = valuesSpy.mock.calls[0]?.[0];
    expect(payload?.hostId).toBe('host-uuid');
    expect(payload?.eventType).toBe('new_booking');
    expect(payload?.rawEmailId).toBe('gmail-msg-1');
  });

  it('riga duplicata (onConflictDoNothing → no rows) → inserted=false (no throw)', async () => {
    // Simula il conflict path: onConflictDoNothing + RETURNING ritorna [].
    const returningSpy = vi.fn(async () => []);
    const onConflictSpy = vi.fn().mockReturnValue({ returning: returningSpy });
    const valuesSpy = vi.fn().mockReturnValue({ onConflictDoNothing: onConflictSpy });
    const db = {
      insert: vi.fn().mockReturnValue({ values: valuesSpy }),
    } as unknown as Database;

    const result = await insertBookingEmailEvent(db, buildInsert());
    expect(result).toEqual({ inserted: false });
    // Importante: non solleva.
  });

  it('booking_id pieno (matched) viene propagato', async () => {
    const returningSpy = vi.fn(async () => [{ id: 'audit-uuid' }]);
    const onConflictSpy = vi.fn().mockReturnValue({ returning: returningSpy });
    const valuesSpy = vi.fn().mockReturnValue({ onConflictDoNothing: onConflictSpy });
    const db = {
      insert: vi.fn().mockReturnValue({ values: valuesSpy }),
    } as unknown as Database;

    await insertBookingEmailEvent(
      db,
      buildInsert({ bookingId: 'booking-uuid', ingestionStatus: 'matched' }),
    );
    const payload = valuesSpy.mock.calls[0]?.[0];
    expect(payload?.bookingId).toBe('booking-uuid');
    expect(payload?.ingestionStatus).toBe('matched');
  });
});

describe('existsBookingEmailEvent', () => {
  it('ritorna true se la riga esiste', async () => {
    const limitSpy = vi.fn(async () => [{ id: 'audit-uuid' }]);
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: limitSpy,
      }),
    } as unknown as Database;

    const got = await existsBookingEmailEvent(db, 'gmail-msg-1');
    expect(got).toBe(true);
  });

  it('ritorna false se non esiste', async () => {
    const limitSpy = vi.fn(async () => []);
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: limitSpy,
      }),
    } as unknown as Database;

    const got = await existsBookingEmailEvent(db, 'gmail-msg-missing');
    expect(got).toBe(false);
  });
});
