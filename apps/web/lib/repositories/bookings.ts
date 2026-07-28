import { type Database, bookings, properties } from '@premura/db';
import { and, desc, eq, gte, ne } from 'drizzle-orm';
import type { ParsedAirbnbEmail } from '../airbnb-email-parser';
import type { BookingForDashboard, DataSource } from '../types';

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

// Lettura per la dashboard host (M2a.4 slice 5).
// Join su properties per recuperare il nome struttura (mostrato nella riga
// prenotazione). Filtro per host via properties.host_id; il propertyId
// opzionale serve quando in futuro mostreremo viste per singola struttura.
//
// Esclude le cancellate (status='cancelled'): lo slice 5 e' data hygiene
// sulle prenotazioni vive, le cancellate sono rumore. Schema bookings non
// espone cancelled_at, quindi filtriamo via status enum.
// Niente filtro soft-delete: schema bookings/properties non espone
// deleted_at.
//
// Filtro temporale: solo prenotazioni con check-in da oggi - 2gg in
// avanti. Le passate sono archivio, fuori dal flusso operativo della
// dashboard. Soglia di 2 giorni copre ospiti ancora in casa con
// check-in di ieri o l'altro ieri.
//
// Order by check-in desc: prossime prima, archivio dopo.
export async function findByHostId(args: {
  db: Database;
  hostId: string;
  propertyId?: string;
}): Promise<BookingForDashboard[]> {
  const { db, hostId, propertyId } = args;

  const cutoff = computeOperativeCutoff();

  const filter = and(
    eq(properties.hostId, hostId),
    ne(bookings.status, 'cancelled'),
    // Operativa = non ancora conclusa. Sul CHECKOUT, non sul check-in:
    // include chi e' in casa adesso e chi esce oggi, esclude chi e'
    // gia' andato via. Vedi computeOperativeCutoff in fondo al file.
    gte(bookings.checkoutAt, cutoff),
    propertyId ? eq(bookings.propertyId, propertyId) : undefined,
  );

  const rows = await db
    .select({
      id: bookings.id,
      propertyId: bookings.propertyId,
      propertyName: properties.name,
      dataSource: bookings.dataSource,
      hostSkippedCompletion: bookings.hostSkippedCompletion,
      guestFullName: bookings.guestFullName,
      guestFirstName: bookings.guestFirstName,
      guestPhone: bookings.guestPhone,
      guestLanguage: bookings.guestLanguage,
      guestCountryCode: bookings.guestCountryCode,
      numGuests: bookings.numGuests,
      checkinAt: bookings.checkinAt,
      checkoutAt: bookings.checkoutAt,
    })
    .from(bookings)
    .innerJoin(properties, eq(properties.id, bookings.propertyId))
    .where(filter)
    .orderBy(desc(bookings.checkinAt));

  // Cast del data_source: la sorgente di verita' applicativa per la lista
  // valori e' DATA_SOURCES in packages/shared/src/booking-data-richness.ts,
  // ma il DB lo tiene varchar libero per non bloccare evoluzioni dietro
  // migration (vedi schema bookings riga 99 sgg.). Quindi il tipo che
  // arriva da drizzle e' string e qui forziamo la narrowing.
  // Valori non riconosciuti restano string a runtime e degradano sul badge
  // 'neutral' lato UI senza crash; un type guard runtime non e' necessario
  // perche' la dashboard tollera il fallback.
  return rows.map((r) => ({
    ...r,
    dataSource: r.dataSource as DataSource,
  }));
}

// Slice 6 fase 6.5: pre-check ownership per le server actions di
// mutazione (complete-manual, skip-completion). Le actions
// inoltrano bookingId all'API Fastify, che attualmente non valida
// l'ownership; il fix architetturale completo (JWT validation
// Fastify) e' tracciato come slice 6.5 dedicato. Qui chiudiamo il
// buco a livello applicativo apps/web.
//
// Ritorna { hostId } se la booking esiste e e' associata a una
// property tracciata. null se la booking non esiste.
//
// Il caller confronta hostId restituito con la sessione corrente:
// se diverso o null, deve trattarli identico (stessa risposta
// "non trovata") per non rivelare l'esistenza di booking altrui.
export async function findOwnership(args: {
  db: Database;
  bookingId: string;
}): Promise<{ hostId: string } | null> {
  const { db, bookingId } = args;
  const rows = await db
    .select({ hostId: properties.hostId })
    .from(bookings)
    .innerJoin(properties, eq(properties.id, bookings.propertyId))
    .where(eq(bookings.id, bookingId))
    .limit(1);
  if (rows.length === 0) return null;
  return { hostId: rows[0]!.hostId };
}

// Slice 8.2 helper: ritorna host_id della booking via JOIN properties.
// Variant di findOwnership che ritorna direttamente la stringa o null
// (no wrapper object) — usato dai logger fire-and-forget.
export async function findHostIdForBooking(
  db: Database,
  bookingId: string,
): Promise<string | null> {
  const rows = await db
    .select({ hostId: properties.hostId })
    .from(bookings)
    .innerJoin(properties, eq(properties.id, bookings.propertyId))
    .where(eq(bookings.id, bookingId))
    .limit(1);
  return rows[0]?.hostId ?? null;
}

function parseIsoDate(yyyymmdd: string): Date {
  // YYYY-MM-DD → UTC midnight (timezone-safe per check-in date logica).
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(yyyymmdd);
  if (!m) throw new Error(`parseIsoDate: formato non valido "${yyyymmdd}"`);
  const [, y, mo, d] = m;
  return new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
}

// Soglia "prenotazione operativa": mezzanotte locale di oggi, confrontata
// con il CHECKOUT.
//
// Prima si filtrava su (checkin >= oggi - 2 giorni), con l'idea che il -2
// coprisse gli ospiti ancora in casa. Non funziona: un soggiorno di una
// settimana entrato lunedi' sparisce dalla lista il mercoledi', mentre
// l'ospite e' ancora dentro. Il caso peggiore e' proprio quello che serve
// di piu' — chi fa checkout oggi e a cui bisogna scrivere adesso.
//
// La domanda giusta non e' "quando e' entrato" ma "e' gia' uscito":
// una prenotazione e' operativa finche' il checkout non e' passato,
// qualunque sia la durata del soggiorno.
//
// Iniettabile via parametro per i test (default new Date()).
function computeOperativeCutoff(now: Date = new Date()): Date {
  const c = new Date(now);
  c.setHours(0, 0, 0, 0);
  return c;
}

export const _internals = { parseIsoDate, computeOperativeCutoff };
