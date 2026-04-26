import { describe, it, expect, vi } from 'vitest';
import { upsertGuestProfile, hashEmail } from '../lib/repositories/guest-profiles';
import type { Database } from '@premura/db';
import type { ParsedAirbnbConfirmation } from '../lib/airbnb-email-parser';

function buildConfirmation(name = 'Stephen Smith'): ParsedAirbnbConfirmation {
  return {
    email_type: 'confirmation',
    guest_full_name: name,
    guest_first_name: name.split(' ')[0]!,
    guest_country_code: 'GB',
    guest_language: 'en',
    guest_count: 2,
    guest_message_original: null,
    guest_message_lang: null,
    host_payout_amount: 100,
    host_payout_currency: 'EUR',
    check_in_date: '2025-09-23',
    check_out_date: '2025-09-24',
    nights: 1,
    booking_external_code: 'HM1234',
    property_name: 'X',
    airbnb_listing_url: null,
  };
}

describe('upsertGuestProfile — INSERT path', () => {
  it('crea nuovo profilo con total_stays_count=1 quando ospite nuovo', async () => {
    const valuesSpy = vi.fn().mockReturnValue({
      returning: vi.fn(async () => [{ id: 'new-profile-uuid' }]),
    });
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn(async () => []), // nessun esistente
      }),
      insert: vi.fn().mockReturnValue({ values: valuesSpy }),
    } as unknown as Database;

    const result = await upsertGuestProfile(db, 'host-1', buildConfirmation());
    expect(result).toEqual({ profileId: 'new-profile-uuid', created: true });
    const insertCall = valuesSpy.mock.calls[0];
    if (!insertCall) throw new Error('no calls');
    const inserted = insertCall[0];
    expect(inserted.fullName).toBe('Stephen Smith');
    expect(inserted.totalStaysCount).toBe(1);
    expect(inserted.lastSeenAt).toBeInstanceOf(Date);
  });
});

describe('upsertGuestProfile — UPDATE path (ospite ricorrente)', () => {
  it('incrementa total_stays_count e aggiorna last_seen_at', async () => {
    const setSpy = vi.fn().mockReturnValue({
      where: vi.fn(async () => undefined),
    });
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn(async () => [{ id: 'existing-profile-uuid' }]),
      }),
      update: vi.fn().mockReturnValue({ set: setSpy }),
      insert: vi.fn(),
    } as unknown as Database;

    const result = await upsertGuestProfile(db, 'host-1', buildConfirmation());
    expect(result).toEqual({ profileId: 'existing-profile-uuid', created: false });
    const updateCall = setSpy.mock.calls[0];
    if (!updateCall) throw new Error('no calls');
    const updated = updateCall[0];
    // L'increment è un sql template, non un numero literale.
    expect(updated.totalStaysCount).toBeDefined();
    expect(updated.lastSeenAt).toBeInstanceOf(Date);
    expect(updated.firstName).toBe('Stephen');
  });
});

describe('hashEmail', () => {
  it('produce SHA-256 hex deterministico, case-insensitive, trim', () => {
    const a = hashEmail('Foo@Bar.com');
    const b = hashEmail('  foo@bar.com  ');
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });
});
