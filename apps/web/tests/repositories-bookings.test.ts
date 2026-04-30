import { describe, it, expect, vi } from 'vitest';
import { upsertBookingFromEmail, cancelBooking, _internals } from '../lib/repositories/bookings';
import type { Database } from '@premura/db';
import type { ParsedAirbnbEmail } from '../lib/airbnb-email-parser';

// Test del repository bookings con DB mockato. Verifica:
//  - INSERT su nuova booking (row creato + returning id)
//  - UPDATE arricchimento se esiste con raw_email_id diverso
//  - SKIP idempotente se raw_email_id === messageId già presente
//  - cancelBooking marca status='cancelled'
//
// Test integration veri (con Postgres testcontainer) sono nell'orchestrator.

function buildConfirmation(overrides: Partial<Extract<ParsedAirbnbEmail, { email_type: 'confirmation' }>> = {}): Extract<ParsedAirbnbEmail, { email_type: 'confirmation' }> {
  return {
    email_type: 'confirmation',
    guest_full_name: 'Stephen Smith',
    guest_first_name: 'Stephen',
    guest_country_code: 'GB',
    guest_language: 'en',
    guest_count: 2,
    guest_message_original: 'Hello!',
    guest_message_lang: 'en',
    host_payout_amount: 110.62,
    host_payout_currency: 'EUR',
    check_in_date: '2025-09-23',
    check_out_date: '2025-09-24',
    nights: 1,
    booking_external_code: 'HM4XDFHECP',
    property_name: 'La goccia di S.Gennaro',
    airbnb_listing_url: null,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────
// upsertBookingFromEmail — INSERT path
// ─────────────────────────────────────────────────────────────

describe('upsertBookingFromEmail — INSERT', () => {
  it('inserisce nuova booking se (property_id, booking_external_code) non esiste', async () => {
    const insertValuesSpy = vi.fn().mockReturnValue({
      returning: vi.fn(async () => [{ id: 'new-booking-uuid' }]),
    });
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn(async () => []), // nessuna riga esistente
      }),
      insert: vi.fn().mockReturnValue({
        values: insertValuesSpy,
      }),
    } as unknown as Database;

    const result = await upsertBookingFromEmail({
      db,
      propertyId: 'prop-uuid',
      guestProfileId: 'profile-uuid',
      rawEmailId: 'msg-1',
      parsed: buildConfirmation(),
    });

    expect(result).toEqual({
      upserted: true,
      created: true,
      enriched: false,
      bookingId: 'new-booking-uuid',
    });
    expect(insertValuesSpy).toHaveBeenCalledOnce();
    const firstCall = insertValuesSpy.mock.calls[0];
    if (!firstCall) throw new Error('no calls');
    const inserted = firstCall[0];
    expect(inserted.bookingExternalCode).toBe('HM4XDFHECP');
    expect(inserted.guestFullName).toBe('Stephen Smith');
    expect(inserted.numGuests).toBe(2);
    expect(inserted.platform).toBe('airbnb');
    expect(inserted.platformBookingRef).toBe('HM4XDFHECP'); // fallback al codice
    expect(inserted.rawEmailId).toBe('msg-1');
    expect(inserted.guestProfileId).toBe('profile-uuid');
  });
});

// ─────────────────────────────────────────────────────────────
// UPDATE path — arricchimento
// ─────────────────────────────────────────────────────────────

describe('upsertBookingFromEmail — UPDATE arricchimento', () => {
  it('aggiorna riga esistente con raw_email_id diverso (sovrascrivendo Reserved)', async () => {
    const updateSetSpy = vi.fn().mockReturnValue({
      where: vi.fn(async () => undefined),
    });
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn(async () => [
          { id: 'existing-id', rawEmailId: null, guestFullName: 'Reserved' },
        ]),
      }),
      update: vi.fn().mockReturnValue({
        set: updateSetSpy,
      }),
    } as unknown as Database;

    const result = await upsertBookingFromEmail({
      db,
      propertyId: 'prop-uuid',
      guestProfileId: 'profile-uuid',
      rawEmailId: 'msg-1',
      parsed: buildConfirmation(),
    });

    expect(result).toEqual({
      upserted: true,
      created: false,
      enriched: true,
      bookingId: 'existing-id',
    });
    expect(updateSetSpy).toHaveBeenCalledOnce();
    const updateFirstCall = updateSetSpy.mock.calls[0];
    if (!updateFirstCall) throw new Error('no calls');
    const updated = updateFirstCall[0];
    expect(updated.guestFullName).toBe('Stephen Smith');
    expect(updated.rawEmailId).toBe('msg-1');
    expect(updated.hostPayoutAmount).toBe('110.62');
  });
});

// ─────────────────────────────────────────────────────────────
// SKIP idempotente
// ─────────────────────────────────────────────────────────────

describe('upsertBookingFromEmail — idempotenza', () => {
  it('skip se la stessa email è già stata processata', async () => {
    const updateSpy = vi.fn();
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn(async () => [
          { id: 'existing-id', rawEmailId: 'msg-1', guestFullName: 'Stephen Smith' },
        ]),
      }),
      update: updateSpy,
    } as unknown as Database;

    const result = await upsertBookingFromEmail({
      db,
      propertyId: 'prop-uuid',
      guestProfileId: 'profile-uuid',
      rawEmailId: 'msg-1', // stesso message ID già presente
      parsed: buildConfirmation(),
    });

    expect(result).toEqual({ skipped: 'already_synced', bookingId: 'existing-id' });
    expect(updateSpy).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────
// cancelBooking
// ─────────────────────────────────────────────────────────────

describe('cancelBooking', () => {
  it('marca status=cancelled se booking esiste', async () => {
    const updateSetSpy = vi.fn().mockReturnValue({
      where: vi.fn(async () => undefined),
    });
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn(async () => [{ id: 'existing-id', status: 'confirmed' }]),
      }),
      update: vi.fn().mockReturnValue({ set: updateSetSpy }),
    } as unknown as Database;

    const result = await cancelBooking({
      db,
      propertyId: 'prop-uuid',
      bookingExternalCode: 'HMABCD1234',
    });
    expect(result).toEqual({ bookingId: 'existing-id', alreadyCancelled: false });
    expect(updateSetSpy).toHaveBeenCalledOnce();
    const cancelCall = updateSetSpy.mock.calls[0];
    if (!cancelCall) throw new Error('no calls');
    expect(cancelCall[0].status).toBe('cancelled');
  });

  it('return null se booking non esiste', async () => {
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn(async () => []),
      }),
    } as unknown as Database;
    const result = await cancelBooking({
      db,
      propertyId: 'prop-uuid',
      bookingExternalCode: 'HMNONEXIST',
    });
    expect(result).toBeNull();
  });

  it('alreadyCancelled=true se status già cancelled (no UPDATE)', async () => {
    const updateSpy = vi.fn();
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn(async () => [{ id: 'existing-id', status: 'cancelled' }]),
      }),
      update: updateSpy,
    } as unknown as Database;
    const result = await cancelBooking({
      db,
      propertyId: 'prop-uuid',
      bookingExternalCode: 'HMABCD1234',
    });
    expect(result).toEqual({ bookingId: 'existing-id', alreadyCancelled: true });
    expect(updateSpy).not.toHaveBeenCalled();
  });
});

describe('parseIsoDate', () => {
  it('parse YYYY-MM-DD → UTC midnight', () => {
    const d = _internals.parseIsoDate('2025-09-23');
    expect(d.toISOString()).toBe('2025-09-23T00:00:00.000Z');
  });
  it('throw su formato non valido', () => {
    expect(() => _internals.parseIsoDate('23/09/2025')).toThrow(/formato/);
  });
});

// ─────────────────────────────────────────────────────────────
// findByHostId — cutoff temporale -2gg
// ─────────────────────────────────────────────────────────────
//
// Verifica indiretta dell'esclusione dell'archivio: testiamo l'helper
// computeOperativeCutoff usato dal WHERE in findByHostId. Una volta
// aperto un Postgres testcontainer (vedi gmail-sync-orchestrator) si
// potrà testare l'esclusione end-to-end con righe inserite e contate.

describe('findByHostId — computeOperativeCutoff', () => {
  it('cutoff = now - 2 giorni a mezzanotte locale', () => {
    const now = new Date(2026, 3, 30, 15, 30, 45, 123); // 30 aprile 2026 15:30:45.123
    const cutoff = _internals.computeOperativeCutoff(now);
    expect(cutoff.getFullYear()).toBe(2026);
    expect(cutoff.getMonth()).toBe(3); // aprile (0-indexed)
    expect(cutoff.getDate()).toBe(28);
    expect(cutoff.getHours()).toBe(0);
    expect(cutoff.getMinutes()).toBe(0);
    expect(cutoff.getSeconds()).toBe(0);
    expect(cutoff.getMilliseconds()).toBe(0);
  });

  it('cutoff attraversa il mese precedente', () => {
    const now = new Date(2026, 4, 1, 10, 0, 0); // 1 maggio 2026
    const cutoff = _internals.computeOperativeCutoff(now);
    expect(cutoff.getMonth()).toBe(3); // aprile
    expect(cutoff.getDate()).toBe(29);
  });

  it('non muta il Date passato come argomento', () => {
    const now = new Date(2026, 3, 30, 15, 30);
    const before = now.getTime();
    _internals.computeOperativeCutoff(now);
    expect(now.getTime()).toBe(before);
  });
});
