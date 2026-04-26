import { and, eq } from 'drizzle-orm';
import { bookings, type Database } from '@premura/db';
import type { ParsedAirbnbEmail } from '../airbnb-email-parser';

// Repository bookings: upsert da email Airbnb (M2a.3 Fase 2).
//
// Logica idempotente:
//   1. Cerca per (property_id, booking_external_code). Se esiste E
//      raw_email_id === messageId → skip (già processata).
//   2. Se esiste e raw_email_id diverso: UPDATE (preserve campi iCal
//      come checkin_at se l'email non li espone in modo migliore).
//   3. Se non esiste: INSERT.
//
// Filtro check-in futuro: applicato dal caller (orchestrator) prima di
// chiamarci, per registrare lo skip nelle stats. Qui assumiamo già
// filtrato.
//
// Cancellation: il caller verifica email_type === 'cancellation' e
// chiama cancelBooking() invece di upsertBookingFromEmail.

export type UpsertBookingResult =
  | { skipped: 'already_synced'; bookingId: string }
  | { upserted: true; created: boolean; enriched: boolean; bookingId: string };

export async function upsertBookingFromEmail(args: {
  db: Database;
  propertyId: string;
  guestProfileId: string | null;
  rawEmailId: string;
  parsed: Extract<ParsedAirbnbEmail, { email_type: 'confirmation' }>;
}): Promise<UpsertBookingResult> {
  const { db, propertyId, guestProfileId, rawEmailId, parsed } = args;

  if (!parsed.booking_external_code) {
    throw new Error('upsertBookingFromEmail: booking_external_code obbligatorio');
  }

  // Cerca riga esistente per (property_id, booking_external_code).
  const existing = await db
    .select({
      id: bookings.id,
      rawEmailId: bookings.rawEmailId,
      guestFullName: bookings.guestFullName,
    })
    .from(bookings)
    .where(
      and(
        eq(bookings.propertyId, propertyId),
        eq(bookings.bookingExternalCode, parsed.booking_external_code),
      ),
    )
    .limit(1);

  const now = new Date();
  const checkinAt = parseIsoDate(parsed.check_in_date);
  const checkoutAt = parseIsoDate(parsed.check_out_date);

  if (existing.length > 0) {
    const row = existing[0]!;
    // Idempotenza: se la stessa email è già stata processata, skip.
    if (row.rawEmailId === rawEmailId) {
      return { skipped: 'already_synced', bookingId: row.id };
    }
    // UPDATE arricchimento. Sovrascriviamo guest_full_name (tipicamente
    // "Reserved" da iCal) col valore reale dall'email.
    await db
      .update(bookings)
      .set({
        bookingExternalCode: parsed.booking_external_code,
        guestFullName: parsed.guest_full_name,
        guestFirstName: parsed.guest_first_name ?? null,
        guestCountryCode: parsed.guest_country_code ?? null,
        guestLanguage: parsed.guest_language ?? null,
        guestMessageOriginal: parsed.guest_message_original ?? null,
        guestMessageLang: parsed.guest_message_lang ?? null,
        numGuests: parsed.guest_count,
        // Le date dall'email sono autoritative: l'iCal aveva timestamp
        // approssimati dall'orario standard check-in/out della property.
        checkinAt,
        checkoutAt,
        nights: parsed.nights,
        hostPayoutAmount: parsed.host_payout_amount?.toFixed(2) ?? null,
        hostPayoutCurrency: parsed.host_payout_currency ?? null,
        listingUrl: parsed.airbnb_listing_url ?? null,
        rawEmailId,
        lastEmailSyncedAt: now,
        guestProfileId: guestProfileId ?? null,
        updatedAt: now,
      })
      .where(eq(bookings.id, row.id));
    return {
      upserted: true,
      created: false,
      enriched: true,
      bookingId: row.id,
    };
  }

  // INSERT nuova riga.
  const inserted = await db
    .insert(bookings)
    .values({
      propertyId,
      platform: 'airbnb',
      // Quando creiamo da email senza riga iCal preesistente, usiamo il
      // booking_external_code come platformBookingRef (chiave naturale).
      platformBookingRef: parsed.booking_external_code,
      bookingExternalCode: parsed.booking_external_code,
      guestFullName: parsed.guest_full_name,
      guestFirstName: parsed.guest_first_name ?? null,
      guestCountryCode: parsed.guest_country_code ?? null,
      guestLanguage: parsed.guest_language ?? null,
      guestMessageOriginal: parsed.guest_message_original ?? null,
      guestMessageLang: parsed.guest_message_lang ?? null,
      numGuests: parsed.guest_count,
      numAdults: parsed.guest_count, // approssimazione: parser non separa
      numChildren: 0,
      checkinAt,
      checkoutAt,
      nights: parsed.nights,
      hostPayoutAmount: parsed.host_payout_amount?.toFixed(2) ?? null,
      hostPayoutCurrency: parsed.host_payout_currency ?? null,
      listingUrl: parsed.airbnb_listing_url ?? null,
      rawEmailId,
      lastEmailSyncedAt: now,
      guestProfileId: guestProfileId ?? null,
      status: 'confirmed',
    })
    .returning({ id: bookings.id });

  if (inserted.length === 0) {
    throw new Error('upsertBookingFromEmail: INSERT ... RETURNING vuoto');
  }
  return {
    upserted: true,
    created: true,
    enriched: false,
    bookingId: inserted[0]!.id,
  };
}

// Cancellation: marca status='cancelled' senza toccare altro.
// Ritorna null se la booking non esiste (es. cancellata prima ancora di
// arrivare l'email di conferma — caso raro ma non blocca).
export async function cancelBooking(args: {
  db: Database;
  propertyId: string;
  bookingExternalCode: string;
}): Promise<{ bookingId: string; alreadyCancelled: boolean } | null> {
  const { db, propertyId, bookingExternalCode } = args;
  const existing = await db
    .select({ id: bookings.id, status: bookings.status })
    .from(bookings)
    .where(
      and(
        eq(bookings.propertyId, propertyId),
        eq(bookings.bookingExternalCode, bookingExternalCode),
      ),
    )
    .limit(1);
  if (existing.length === 0) return null;
  const row = existing[0]!;
  if (row.status === 'cancelled') {
    return { bookingId: row.id, alreadyCancelled: true };
  }
  await db
    .update(bookings)
    .set({ status: 'cancelled', updatedAt: new Date() })
    .where(eq(bookings.id, row.id));
  return { bookingId: row.id, alreadyCancelled: false };
}

function parseIsoDate(yyyymmdd: string): Date {
  // YYYY-MM-DD → UTC midnight (timezone-safe per check-in date logica).
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(yyyymmdd);
  if (!m) throw new Error(`parseIsoDate: formato non valido "${yyyymmdd}"`);
  const [, y, mo, d] = m;
  return new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
}

export const _internals = { parseIsoDate };
