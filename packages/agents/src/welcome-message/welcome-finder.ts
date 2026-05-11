import { type Database, bookings, hosts, kits, properties, propertyKnowledge } from '@premura/db';
import { and, eq, gte, isNotNull, isNull, lte, sql } from 'drizzle-orm';

// Slice E — Finder kit pronti per welcome message.
//
// Criteri:
//  - kit.status = 'set_up' AND cleanerPhotoUrl IS NOT NULL
//  - booking.checkinAt e' OGGI (lower=startOfDay, upper=endOfDay del time zone Europe/Rome)
//  - kit.welcomeMessageSentAt IS NULL (idempotency)
//  - host.welcomeAutoSend = true
//  - now >= host.welcomeTimeSlot (HH:MM)
// Returns: candidati con tutto il context per generator.

export type WelcomeMessageCandidate = {
  kitId: string;
  bookingId: string;
  hostId: string;
  hostFullName: string | null;
  hostFirstName: string | null;
  guestFullName: string;
  guestFirstName: string | null;
  guestPhone: string | null;
  guestLanguage: string;
  propertyName: string;
  propertyId: string;
  checkinAt: Date;
  cleanerPhotoUrl: string;
  cardMessage: string | null;
  cardMessageEn: string | null;
  keyboxCode: string | null;
};

export async function findKitsForWelcomeMessage(
  db: Database,
  now: Date = new Date(),
): Promise<WelcomeMessageCandidate[]> {
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const rows = await db
    .select({
      kitId: kits.id,
      bookingId: kits.bookingId,
      hostId: hosts.id,
      hostFullName: hosts.fullName,
      hostEmail: hosts.email,
      guestFullName: bookings.guestFullName,
      guestFirstName: bookings.guestFirstName,
      guestPhone: bookings.guestPhone,
      guestLanguage: kits.guestLanguage,
      propertyName: properties.name,
      propertyId: properties.id,
      checkinAt: bookings.checkinAt,
      cleanerPhotoUrl: kits.cleanerPhotoUrl,
      cardMessage: kits.cardMessage,
      cardMessageEn: kits.cardMessageEn,
      welcomeAutoSend: hosts.welcomeAutoSend,
      welcomeTimeSlot: hosts.welcomeTimeSlot,
    })
    .from(kits)
    .innerJoin(bookings, eq(kits.bookingId, bookings.id))
    .innerJoin(properties, eq(bookings.propertyId, properties.id))
    .innerJoin(hosts, eq(properties.hostId, hosts.id))
    .where(
      and(
        sql`${kits.status} = 'set_up'`,
        isNotNull(kits.cleanerPhotoUrl),
        isNull(kits.welcomeMessageSentAt),
        gte(bookings.checkinAt, startOfDay),
        lte(bookings.checkinAt, endOfDay),
        eq(hosts.welcomeAutoSend, true),
        // host.welcomeTimeSlot <= now (HH:MM stringa lexicographic OK).
        lte(hosts.welcomeTimeSlot, hhmm),
      ),
    );

  if (rows.length === 0) return [];

  // Join property_knowledge per keybox code (opzionale).
  const propIds = [...new Set(rows.map((r) => r.propertyId))];
  const knowledgeRows = await db
    .select({
      propertyId: propertyKnowledge.propertyId,
      keybox: propertyKnowledge.keybox,
    })
    .from(propertyKnowledge)
    .where(sql`${propertyKnowledge.propertyId} = ANY(${propIds})`);
  const keyboxMap = new Map<string, string | null>();
  for (const k of knowledgeRows) {
    keyboxMap.set(k.propertyId, k.keybox?.code ?? null);
  }

  return rows.map((r) => ({
    kitId: r.kitId,
    bookingId: r.bookingId,
    hostId: r.hostId,
    hostFullName: r.hostFullName,
    hostFirstName: r.hostFullName ? (r.hostFullName.split(' ')[0] ?? null) : null,
    guestFullName: r.guestFullName,
    guestFirstName: r.guestFirstName,
    guestPhone: r.guestPhone,
    guestLanguage: r.guestLanguage,
    propertyName: r.propertyName,
    propertyId: r.propertyId,
    checkinAt: r.checkinAt,
    cleanerPhotoUrl: r.cleanerPhotoUrl ?? '',
    cardMessage: r.cardMessage,
    cardMessageEn: r.cardMessageEn,
    keyboxCode: keyboxMap.get(r.propertyId) ?? null,
  }));
}

// Stale: kit con checkin oggi ma cleanerPhotoUrl null (cleaner non ha
// completato setup entro le 09:00 — alert founder).
export async function findStaleSetups(
  db: Database,
  thresholdHour = 9,
  now: Date = new Date(),
): Promise<Array<{ kitId: string; propertyName: string; checkinAt: Date }>> {
  if (now.getHours() < thresholdHour) return [];
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);

  return db
    .select({
      kitId: kits.id,
      propertyName: properties.name,
      checkinAt: bookings.checkinAt,
    })
    .from(kits)
    .innerJoin(bookings, eq(kits.bookingId, bookings.id))
    .innerJoin(properties, eq(bookings.propertyId, properties.id))
    .where(
      and(
        gte(bookings.checkinAt, startOfDay),
        lte(bookings.checkinAt, endOfDay),
        isNull(kits.cleanerPhotoUrl),
        sql`${kits.status} NOT IN ('set_up', 'delivered_to_guest')`,
      ),
    );
}

export async function markWelcomeMessageSent(
  db: Database,
  kitId: string,
): Promise<{ ok: true } | { ok: false; reason: 'not_found' }> {
  const now = new Date();
  const [row] = await db
    .update(kits)
    .set({
      welcomeMessageSentAt: now,
      status: 'delivered_to_guest',
      guestConfirmedAt: now,
      updatedAt: now,
    })
    .where(eq(kits.id, kitId))
    .returning({ id: kits.id });
  if (!row) return { ok: false, reason: 'not_found' };
  return { ok: true };
}
