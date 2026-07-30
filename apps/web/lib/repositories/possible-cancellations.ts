import { type Database, bookings, properties } from '@premura/db';
import { and, asc, eq, isNotNull, ne } from 'drizzle-orm';

// Possibili cancellazioni (30/07): prenotazioni il cui evento iCal e'
// assente da 2 poll RIUSCITI consecutivi (possible_cancellation_at
// valorizzato dal worker). L'host decide: cancellata davvero (status
// -> cancelled) o ancora attiva (il sospetto si azzera; se sparisce
// di nuovo per 2 poll, risale).

export type PossibleCancellation = {
  bookingId: string;
  guestFullName: string;
  guestFirstName: string | null;
  propertyName: string;
  propertyColor: string | null;
  platform: string;
  checkinAt: Date;
  checkoutAt: Date;
  flaggedAt: Date;
};

export async function listPossibleCancellations(
  db: Database,
  hostId: string,
): Promise<PossibleCancellation[]> {
  const rows = await db
    .select({
      bookingId: bookings.id,
      guestFullName: bookings.guestFullName,
      guestFirstName: bookings.guestFirstName,
      propertyName: properties.name,
      propertyColor: properties.color,
      platform: bookings.platform,
      checkinAt: bookings.checkinAt,
      checkoutAt: bookings.checkoutAt,
      flaggedAt: bookings.possibleCancellationAt,
    })
    .from(bookings)
    .innerJoin(properties, eq(properties.id, bookings.propertyId))
    .where(
      and(
        eq(properties.hostId, hostId),
        isNotNull(bookings.possibleCancellationAt),
        ne(bookings.status, 'cancelled'),
        eq(bookings.isCalendarBlock, false),
      ),
    )
    .orderBy(asc(bookings.checkinAt));
  // flaggedAt non-null garantito dal filtro isNotNull.
  return rows.map((r) => ({ ...r, flaggedAt: r.flaggedAt as Date }));
}

export type ResolveCancellationResult =
  | { ok: true }
  | { ok: false; reason: 'not_found' | 'wrong_host' };

async function assertOwnership(
  db: Database,
  hostId: string,
  bookingId: string,
): Promise<ResolveCancellationResult | null> {
  const [row] = await db
    .select({ ownerHostId: properties.hostId })
    .from(bookings)
    .innerJoin(properties, eq(properties.id, bookings.propertyId))
    .where(eq(bookings.id, bookingId))
    .limit(1);
  if (!row) return { ok: false, reason: 'not_found' };
  if (row.ownerHostId !== hostId) return { ok: false, reason: 'wrong_host' };
  return null;
}

/** L'host conferma: la prenotazione e' cancellata davvero. */
export async function confirmCancellation(
  db: Database,
  hostId: string,
  bookingId: string,
): Promise<ResolveCancellationResult> {
  const denied = await assertOwnership(db, hostId, bookingId);
  if (denied) return denied;
  await db
    .update(bookings)
    .set({
      status: 'cancelled',
      possibleCancellationAt: null,
      feedMissingCount: 0,
      updatedAt: new Date(),
    })
    .where(eq(bookings.id, bookingId));
  return { ok: true };
}

/** L'host smentisce: ancora attiva. Contatore e sospetto si azzerano. */
export async function dismissCancellation(
  db: Database,
  hostId: string,
  bookingId: string,
): Promise<ResolveCancellationResult> {
  const denied = await assertOwnership(db, hostId, bookingId);
  if (denied) return denied;
  await db
    .update(bookings)
    .set({ possibleCancellationAt: null, feedMissingCount: 0, updatedAt: new Date() })
    .where(eq(bookings.id, bookingId));
  return { ok: true };
}
