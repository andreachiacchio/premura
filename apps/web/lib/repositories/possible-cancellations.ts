import { type Database, bookings, properties } from '@premura/db';
import { and, asc, eq, gte, isNotNull } from 'drizzle-orm';

// Prenotazioni tolte dal calendario (26/10): le cancella Premura, non
// l'host.
//
// Fino al 26/10 qui c'erano le "possibili cancellazioni", una card per
// riga con due bottoni. Villa Cristina ne ha accumulate 7, ferme da 5 a
// 67 giorni, mai risolte: erano cancellazioni vere. Adesso il worker
// (apps/api/src/jobs/feed-reconciliation.ts) cancella da solo dopo 3
// giorni di assenza dal feed, e la home mostra solo quanto ha tolto,
// con una via per dire "era ancora attiva".
//
// Le righe solo in osservazione (assenti da meno di 3 giorni) NON
// passano di qui: non sono una decisione, sono un controllo in corso.
//
// La finestra dei 30 giorni si conta da quando Premura ha cancellato
// (auto_cancelled_at), non da quando il feed ha tolto la riga (Andrea
// 26/10): una prenotazione sparita ad agosto e cancellata oggi e' una
// decisione di oggi, e l'host deve vederla.
// Le righe 'superseded' nemmeno: non le ha tolte Booking, le ha
// rinominate — dirlo all'host sarebbe falso.

export const CALENDAR_REMOVALS_WINDOW_DAYS = 30;

export type CalendarRemoval = {
  bookingId: string;
  propertyName: string;
  platform: string;
  checkinAt: Date;
  checkoutAt: Date;
  /** Quando il feed l'ha tolta (possible_cancellation_at), mostrato per riga. */
  removedAt: Date;
};

export async function listCalendarRemovals(
  db: Database,
  hostId: string,
  now: Date = new Date(),
): Promise<CalendarRemoval[]> {
  const since = new Date(now.getTime() - CALENDAR_REMOVALS_WINDOW_DAYS * 86_400_000);
  const rows = await db
    .select({
      bookingId: bookings.id,
      propertyName: properties.name,
      platform: bookings.platform,
      checkinAt: bookings.checkinAt,
      checkoutAt: bookings.checkoutAt,
      removedAt: bookings.possibleCancellationAt,
    })
    .from(bookings)
    .innerJoin(properties, eq(properties.id, bookings.propertyId))
    .where(
      and(
        eq(properties.hostId, hostId),
        eq(bookings.status, 'cancelled'),
        eq(bookings.cancellationReason, 'feed_missing_3d'),
        eq(bookings.isCalendarBlock, false),
        gte(bookings.autoCancelledAt, since),
        isNotNull(bookings.possibleCancellationAt),
      ),
    )
    .orderBy(asc(bookings.checkinAt));
  // removedAt non-null garantito dal filtro isNotNull.
  return rows.map((r) => ({ ...r, removedAt: r.removedAt as Date }));
}

export type RestoreRemovalResult =
  | { ok: true }
  | { ok: false; reason: 'not_found' | 'wrong_host' | 'not_removed_by_premura' };

/**
 * L'host dice "era ancora attiva": la prenotazione torna confirmed e
 * Premura non la tocca piu' (host_kept_active_at). Solo su righe che ha
 * cancellato Premura per assenza dal feed: una cancellazione dell'host o
 * di un'email non si annulla da qui.
 */
export async function restoreCalendarRemoval(
  db: Database,
  hostId: string,
  bookingId: string,
  now: Date = new Date(),
): Promise<RestoreRemovalResult> {
  const [row] = await db
    .select({
      ownerHostId: properties.hostId,
      status: bookings.status,
      cancellationReason: bookings.cancellationReason,
    })
    .from(bookings)
    .innerJoin(properties, eq(properties.id, bookings.propertyId))
    .where(eq(bookings.id, bookingId))
    .limit(1);
  if (!row) return { ok: false, reason: 'not_found' };
  if (row.ownerHostId !== hostId) return { ok: false, reason: 'wrong_host' };
  if (row.status !== 'cancelled' || row.cancellationReason !== 'feed_missing_3d') {
    return { ok: false, reason: 'not_removed_by_premura' };
  }

  await db
    .update(bookings)
    .set({
      status: 'confirmed',
      cancellationReason: null,
      autoCancelledAt: null,
      feedMissingCount: 0,
      possibleCancellationAt: null,
      hostKeptActiveAt: now,
      updatedAt: now,
    })
    .where(eq(bookings.id, bookingId));
  return { ok: true };
}
