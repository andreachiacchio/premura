import { type Database, bookings, guestQuizzes, properties } from '@premura/db';
import { and, asc, eq, gte, lte, ne } from 'drizzle-orm';

// Slice A — Repository helpers per la dashboard "Prossimi check-in".
//
// Window 14gg: showing solo booking con check-in fra oggi (start of
// day, locale) e +14gg. Soglia inferiore = oggi (no booking gia'
// iniziati / scaduti). Soglia superiore = +14gg (oltre il quale
// l'host non ha senso pre-configurare il numero).

export type SurveyStatus = 'not_yet' | 'sent' | 'completed' | 'skipped';

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
  // Slice B: stato survey pre-arrival.
  surveyStatus: SurveyStatus;
  surveySentAt: Date | null;
  surveyCompletedAt: Date | null;
};

const WINDOW_DAYS = 14;

export async function listUpcomingCheckins(
  db: Database,
  hostId: string,
  now: Date = new Date(),
): Promise<UpcomingCheckinRow[]> {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const windowEnd = new Date(startOfToday);
  windowEnd.setDate(windowEnd.getDate() + WINDOW_DAYS);

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
        gte(bookings.checkinAt, startOfToday),
        lte(bookings.checkinAt, windowEnd),
      ),
    )
    .orderBy(asc(bookings.checkinAt));

  return rows.map((r) => ({
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
    surveyStatus: deriveSurveyStatus(r.surveySentAt, r.surveyCompletedAt, r.surveySkippedAt),
    surveySentAt: r.surveySentAt,
    surveyCompletedAt: r.surveyCompletedAt,
  }));
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
//  - guest_phone_source = 'manual' (slice A path).
//  - guest_phone_added_by_host_id viene update solo se prima era null.
export type SetPhoneResult =
  | { ok: true; bookingId: string; premuraActiveAt: Date }
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
  const finalPremuraActiveAt = row.currentPremuraActiveAt ?? now;

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
