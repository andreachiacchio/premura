import {
  type Database,
  bookings,
  guestQuizzes,
  hosts,
  kits,
  outboundSends,
  properties,
} from '@premura/db';
import { and, asc, eq, gte, inArray, lte, ne } from 'drizzle-orm';

// Slice A — Repository helpers per la dashboard "Prossimi check-in".
//
// Finestra: dal soggiorno IN CORSO fino a check-in a +14gg.
// Il limite inferiore e' il checkout (>= oggi), non il check-in: un
// soggiorno iniziato ieri e' ancora materia dell'host (stato "in corso"),
// e serve per mostrare gli ospiti esclusi di proposito mentre sono in
// casa. Oltre +14gg l'host non ha senso pre-configurare il numero.

export type SurveyStatus = 'not_yet' | 'sent' | 'completed' | 'skipped';

/**
 * Stato Premura della prenotazione, derivato da due campi:
 *
 *  active        -> numero presente + premura_active_at valorizzato
 *  missing_phone -> nessun numero (l'agente non puo' fare nulla)
 *  excluded      -> numero presente ma premura_active_at NULL: scelta
 *                   deliberata dell'host di tenere l'agente fuori da
 *                   questa prenotazione (es. ospite gia' gestito a mano)
 */
export type PremuraState = 'active' | 'missing_phone' | 'excluded';

export function derivePremuraState(
  guestPhone: string | null,
  premuraActiveAt: Date | null,
): PremuraState {
  if (!guestPhone) return 'missing_phone';
  return premuraActiveAt ? 'active' : 'excluded';
}

export type OutboundTimelineEntry = {
  trigger: 'welcome' | 'midstay' | 'checkout';
  status: 'reserved' | 'sent' | 'failed' | 'skipped';
  sentAt: Date | null;
  dryRun: boolean;
};

export type UpcomingCheckinRow = {
  id: string;
  guestFullName: string;
  guestFirstName: string | null;
  propertyId: string;
  propertyName: string;
  checkinAt: Date;
  checkoutAt: Date;
  numGuests: number;
  platform: 'booking' | 'airbnb' | 'direct';
  guestPhone: string | null;
  premuraActiveAt: Date | null;
  guestPhoneSource: string | null;
  premuraState: PremuraState;
  /**
   * Fascia iCal Booking senza ospite noto (data_source booking_ical_only):
   * il feed dice solo "occupato", chi arriva si scopre sull'extranet.
   * In UI ha una sezione propria, mai mescolata alle prenotazioni vere.
   */
  unknownOccupied: boolean;
  // Slice B: stato survey pre-arrival + timestamp per la timeline.
  surveyStatus: SurveyStatus;
  surveySentAt: Date | null;
  surveyCompletedAt: Date | null;
  // Slice E: welcome message (via kit) gia' inviato?
  welcomeSentAt: Date | null;
  // Slot outbound (welcome/midstay/checkout) gia' prenotati o inviati.
  outbound: OutboundTimelineEntry[];
};

export type UpcomingCheckinsData = {
  rows: UpcomingCheckinRow[];
  /** Tutte le property dell'host, per il filtro in testa alla pagina. */
  properties: Array<{ id: string; name: string }>;
  /** hosts.welcome_time_slot (HH:MM) — orario previsto del benvenuto. */
  welcomeTimeSlot: string;
};

const WINDOW_DAYS = 14;

export async function listUpcomingCheckins(
  db: Database,
  hostId: string,
  now: Date = new Date(),
): Promise<UpcomingCheckinsData> {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const windowEnd = new Date(startOfToday);
  windowEnd.setDate(windowEnd.getDate() + WINDOW_DAYS);

  const [hostRow] = await db
    .select({ welcomeTimeSlot: hosts.welcomeTimeSlot })
    .from(hosts)
    .where(eq(hosts.id, hostId))
    .limit(1);

  const propertyRows = await db
    .select({ id: properties.id, name: properties.name })
    .from(properties)
    .where(and(eq(properties.hostId, hostId), eq(properties.isActive, true)))
    .orderBy(asc(properties.name));

  const rows = await db
    .select({
      id: bookings.id,
      guestFullName: bookings.guestFullName,
      guestFirstName: bookings.guestFirstName,
      propertyId: bookings.propertyId,
      propertyName: properties.name,
      checkinAt: bookings.checkinAt,
      checkoutAt: bookings.checkoutAt,
      numGuests: bookings.numGuests,
      platform: bookings.platform,
      guestPhone: bookings.guestPhone,
      premuraActiveAt: bookings.premuraActiveAt,
      guestPhoneSource: bookings.guestPhoneSource,
      dataSource: bookings.dataSource,
      // Slice B: LEFT JOIN guest_quizzes per stato survey.
      surveySentAt: guestQuizzes.sentAt,
      surveyCompletedAt: guestQuizzes.completedAt,
      surveySkippedAt: guestQuizzes.skippedAt,
    })
    .from(bookings)
    .innerJoin(properties, eq(properties.id, bookings.propertyId))
    .leftJoin(guestQuizzes, eq(guestQuizzes.bookingId, bookings.id))
    .where(
      and(
        eq(properties.hostId, hostId),
        ne(bookings.status, 'cancelled'),
        // I blocchi calendario non sono ospiti: fuori da lista e conteggi.
        eq(bookings.isCalendarBlock, false),
        // Soggiorni in corso inclusi: e' il checkout a dover essere futuro.
        gte(bookings.checkoutAt, startOfToday),
        lte(bookings.checkinAt, windowEnd),
      ),
    )
    .orderBy(asc(bookings.checkinAt));

  const bookingIds = rows.map((r) => r.id);

  // Timeline: due query separate invece di altri leftJoin sulla
  // principale — outbound_sends ha fino a 3 righe per prenotazione e
  // moltiplicherebbe le righe del listato.
  const kitRows = bookingIds.length
    ? await db
        .select({ bookingId: kits.bookingId, welcomeMessageSentAt: kits.welcomeMessageSentAt })
        .from(kits)
        .where(inArray(kits.bookingId, bookingIds))
    : [];
  const welcomeByBooking = new Map(
    kitRows.filter((k) => k.welcomeMessageSentAt).map((k) => [k.bookingId, k.welcomeMessageSentAt]),
  );

  const sendRows = bookingIds.length
    ? await db
        .select({
          bookingId: outboundSends.bookingId,
          trigger: outboundSends.trigger,
          status: outboundSends.status,
          sentAt: outboundSends.sentAt,
          dryRun: outboundSends.dryRun,
        })
        .from(outboundSends)
        .where(inArray(outboundSends.bookingId, bookingIds))
    : [];
  const outboundByBooking = new Map<string, OutboundTimelineEntry[]>();
  for (const s of sendRows) {
    const list = outboundByBooking.get(s.bookingId) ?? [];
    list.push({ trigger: s.trigger, status: s.status, sentAt: s.sentAt, dryRun: s.dryRun });
    outboundByBooking.set(s.bookingId, list);
  }

  return {
    rows: rows.map((r) => ({
      id: r.id,
      guestFullName: r.guestFullName,
      guestFirstName: r.guestFirstName,
      propertyId: r.propertyId,
      propertyName: r.propertyName,
      checkinAt: r.checkinAt,
      checkoutAt: r.checkoutAt,
      numGuests: r.numGuests,
      platform: r.platform,
      guestPhone: r.guestPhone,
      premuraActiveAt: r.premuraActiveAt,
      guestPhoneSource: r.guestPhoneSource,
      premuraState: derivePremuraState(r.guestPhone, r.premuraActiveAt),
      // Fascia iCal Booking senza ospite noto: sezione propria in UI,
      // mai mescolata alle prenotazioni vere (decisione 30/07).
      unknownOccupied: r.dataSource === 'booking_ical_only',
      surveyStatus: deriveSurveyStatus(r.surveySentAt, r.surveyCompletedAt, r.surveySkippedAt),
      surveySentAt: r.surveySentAt,
      surveyCompletedAt: r.surveyCompletedAt,
      welcomeSentAt: welcomeByBooking.get(r.id) ?? null,
      outbound: outboundByBooking.get(r.id) ?? [],
    })),
    properties: propertyRows,
    welcomeTimeSlot: hostRow?.welcomeTimeSlot ?? '08:00',
  };
}

function deriveSurveyStatus(
  sentAt: Date | null,
  completedAt: Date | null,
  skippedAt: Date | null,
): SurveyStatus {
  if (completedAt) return 'completed';
  if (skippedAt) return 'skipped';
  if (sentAt) return 'sent';
  return 'not_yet';
}

// Set guest_phone + activate booking. Idempotente:
//  - premura_active_at non viene sovrascritto se gia' valorizzato
//    (un secondo update conserva la timestamp prima attivazione).
//  - se l'host cambia il numero (refattora typo), guest_phone si
//    aggiorna ma premura_active_at resta.
//  - CASO ESCLUSO: se la prenotazione era esclusa di proposito
//    (numero presente, premura_active_at NULL), correggere il numero
//    NON la riattiva — l'esclusione e' una scelta dell'host e si
//    revoca solo con l'azione esplicita (setBookingPremuraActive).
//  - guest_phone_source = 'manual' (slice A path).
//  - guest_phone_added_by_host_id viene update solo se prima era null.
export type SetPhoneResult =
  | { ok: true; bookingId: string; premuraActiveAt: Date | null }
  | { ok: false; reason: 'not_found' | 'wrong_host' };

export async function setBookingGuestPhone(
  db: Database,
  bookingId: string,
  hostId: string,
  phoneE164: string,
): Promise<SetPhoneResult> {
  // Pre-check ownership via join properties.
  const [row] = await db
    .select({
      bookingId: bookings.id,
      ownerHostId: properties.hostId,
      currentPhone: bookings.guestPhone,
      currentPremuraActiveAt: bookings.premuraActiveAt,
      currentAddedByHostId: bookings.guestPhoneAddedByHostId,
    })
    .from(bookings)
    .innerJoin(properties, eq(properties.id, bookings.propertyId))
    .where(eq(bookings.id, bookingId))
    .limit(1);
  if (!row) return { ok: false, reason: 'not_found' };
  if (row.ownerHostId !== hostId) return { ok: false, reason: 'wrong_host' };

  const now = new Date();
  // Riga esclusa (numero presente + attivazione NULL): il numero si
  // aggiorna ma l'esclusione resta. Riga mai attivata SENZA numero:
  // inserire il numero attiva, com'e' sempre stato in slice A.
  const wasExcluded = Boolean(row.currentPhone) && row.currentPremuraActiveAt === null;
  const finalPremuraActiveAt = row.currentPremuraActiveAt ?? (wasExcluded ? null : now);

  await db
    .update(bookings)
    .set({
      guestPhone: phoneE164,
      premuraActiveAt: finalPremuraActiveAt,
      guestPhoneAddedByHostId: row.currentAddedByHostId ?? hostId,
      guestPhoneSource: 'manual',
      updatedAt: now,
    })
    .where(eq(bookings.id, bookingId));

  return { ok: true, bookingId, premuraActiveAt: finalPremuraActiveAt };
}

// Clear: unset guest_phone + premura_active_at. Use case "ho inserito
// il numero sbagliato e voglio ripartire da zero". Audit fields lasciati
// per memoria (l'utente che aveva inserito + source).
export type ClearPhoneResult = { ok: true } | { ok: false; reason: 'not_found' | 'wrong_host' };

export async function clearBookingGuestPhone(
  db: Database,
  bookingId: string,
  hostId: string,
): Promise<ClearPhoneResult> {
  const [row] = await db
    .select({ ownerHostId: properties.hostId })
    .from(bookings)
    .innerJoin(properties, eq(properties.id, bookings.propertyId))
    .where(eq(bookings.id, bookingId))
    .limit(1);
  if (!row) return { ok: false, reason: 'not_found' };
  if (row.ownerHostId !== hostId) return { ok: false, reason: 'wrong_host' };

  await db
    .update(bookings)
    .set({
      guestPhone: null,
      premuraActiveAt: null,
      // Lasciamo guestPhoneAddedByHostId + source per audit storico.
      updatedAt: new Date(),
    })
    .where(eq(bookings.id, bookingId));

  return { ok: true };
}

// Toggle Escluso <-> Attivo, a numero invariato.
//
// active=false: l'agente non tocca piu' questa prenotazione (i finder
// delle pipeline filtrano su premura_active_at NOT NULL). Il numero
// resta: e' un'esclusione, non una cancellazione.
// active=true: richiede un numero presente — attivare una prenotazione
// che l'agente non puo' contattare sarebbe uno stato bugiardo.
export type SetPremuraActiveResult =
  | { ok: true; premuraActiveAt: Date | null }
  | { ok: false; reason: 'not_found' | 'wrong_host' | 'no_phone' };

export async function setBookingPremuraActive(
  db: Database,
  bookingId: string,
  hostId: string,
  active: boolean,
): Promise<SetPremuraActiveResult> {
  const [row] = await db
    .select({
      ownerHostId: properties.hostId,
      guestPhone: bookings.guestPhone,
      premuraActiveAt: bookings.premuraActiveAt,
    })
    .from(bookings)
    .innerJoin(properties, eq(properties.id, bookings.propertyId))
    .where(eq(bookings.id, bookingId))
    .limit(1);
  if (!row) return { ok: false, reason: 'not_found' };
  if (row.ownerHostId !== hostId) return { ok: false, reason: 'wrong_host' };
  if (active && !row.guestPhone) return { ok: false, reason: 'no_phone' };

  // Idempotente: riattivare un attivo conserva il timestamp originale.
  const premuraActiveAt = active ? (row.premuraActiveAt ?? new Date()) : null;

  await db
    .update(bookings)
    .set({ premuraActiveAt, updatedAt: new Date() })
    .where(eq(bookings.id, bookingId));

  return { ok: true, premuraActiveAt };
}
