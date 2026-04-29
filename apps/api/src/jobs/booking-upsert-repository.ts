import { and, eq, sql } from 'drizzle-orm';
import { bookings, type Database } from '@premura/db';
import { isRichDataSource } from '@premura/shared';
import type { IcalBookingShell } from './ical-event-mapper';

/**
 * Esito di un upsert iCal su bookings.
 *
 * - inserted: true   -> riga creata ex novo, primo iCal poll che la incontra
 * - inserted: false  -> riga gia' esistente; skipped sara' true e reason
 *                       descrive perche' non si e' sovrascritto
 *
 * skipped distingue tre scenari di no-op:
 *  1. 'rich data source preserved'        -> esiste una versione arricchita
 *                                            (email Airbnb / form manuale Booking),
 *                                            non sovrascriviamo per non distruggere PII
 *  2. 'already exists with same data_source' -> idempotenza pura: stesso UID,
 *                                                stesse date, refresh updated_at
 *  3. 'date changed - handled in slice 3.2'  -> caso modifica prenotazione,
 *                                                fuori scope slice 3.1
 */
export type UpsertBookingShellResult = {
  inserted: boolean;
  bookingId: string;
  skipped: boolean;
  reason?: string;
};

/**
 * Upsert idempotente di una booking shell iCal.
 *
 * Match key: (platform, platformBookingRef) — combacia con l'unique index
 * `bookings_platform_ref_uniq` (vedi packages/db/src/schema/bookings.ts).
 *
 * Nota cross-tenant: l'unique index NON include propertyId. Significa che
 * se due property diverse (anche di host diversi) ricevono lo stesso UID
 * iCal, il match qui troverebbe la riga della prima property, non della
 * seconda. Caso edge raro: i provider iCal generano UID univoci per
 * tenant ed e' improbabile che due host ricevano lo stesso UID.
 * Mitigation se diventa problema reale: aggiungere propertyId all'index
 * unique e a questa query.
 *
 * Concorrenza: usa `INSERT ... ON CONFLICT DO NOTHING` per evitare race
 * condition tra worker BullMQ paralleli. Se due job processano lo stesso
 * UID simultaneamente, uno solo riesce ad inserire; l'altro fallisce il
 * conflict e cade nel ramo "esiste gia'".
 *
 * Decisioni rispetto a una riga preesistente:
 *  1. data_source RICH (isRichDataSource)        -> NO-OP, preserva PII
 *  2. data_source non-RICH + date cambiate       -> NO-OP, slice 3.2 gestira'
 *                                                   modifica prenotazione
 *  3. data_source non-RICH + date invariate      -> touch updated_at per
 *                                                   tracciare il poll
 */
export async function upsertBookingShell(
  db: Database,
  shell: IcalBookingShell,
): Promise<UpsertBookingShellResult> {
  const [insertedRow] = await db
    .insert(bookings)
    .values({
      propertyId: shell.propertyId,
      platform: shell.platform,
      platformBookingRef: shell.platformBookingRef,
      bookingExternalCode: shell.bookingExternalCode,
      guestFullName: shell.guestFullName,
      numGuests: shell.numGuests,
      numAdults: shell.numAdults,
      numChildren: shell.numChildren,
      checkinAt: shell.checkinAt,
      checkoutAt: shell.checkoutAt,
      nights: shell.nights,
      status: shell.status,
      dataSource: shell.dataSource,
    })
    .onConflictDoNothing({
      target: [bookings.platform, bookings.platformBookingRef],
    })
    .returning({ id: bookings.id });

  if (insertedRow) {
    return { inserted: true, bookingId: insertedRow.id, skipped: false };
  }

  const [existing] = await db
    .select({
      id: bookings.id,
      dataSource: bookings.dataSource,
      checkinAt: bookings.checkinAt,
      checkoutAt: bookings.checkoutAt,
    })
    .from(bookings)
    .where(
      and(
        eq(bookings.platform, shell.platform),
        eq(bookings.platformBookingRef, shell.platformBookingRef),
      ),
    )
    .limit(1);

  if (!existing) {
    // Difensivo: ON CONFLICT DO NOTHING ha mangiato l'INSERT, quindi una riga
    // con quella chiave esiste. Se la SELECT non la trova, qualcosa di
    // inaspettato e' successo (es. cancellazione concorrente).
    throw new Error(
      `[booking-upsert] riga sparita dopo conflict per ${shell.platform}/${shell.platformBookingRef}`,
    );
  }

  if (isRichDataSource(existing.dataSource)) {
    return {
      inserted: false,
      bookingId: existing.id,
      skipped: true,
      reason: 'rich data source preserved',
    };
  }

  const datesChanged =
    existing.checkinAt.getTime() !== shell.checkinAt.getTime() ||
    existing.checkoutAt.getTime() !== shell.checkoutAt.getTime();

  if (datesChanged) {
    return {
      inserted: false,
      bookingId: existing.id,
      skipped: true,
      reason: 'date changed - handled in slice 3.2',
    };
  }

  await db
    .update(bookings)
    .set({ updatedAt: sql`NOW()` })
    .where(eq(bookings.id, existing.id));

  return {
    inserted: false,
    bookingId: existing.id,
    skipped: true,
    reason: 'already exists with same data_source',
  };
}
