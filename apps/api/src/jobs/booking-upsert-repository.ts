import { type Database, bookings } from '@premura/db';
import { isRichDataSource } from '@premura/shared';
import { and, eq, sql } from 'drizzle-orm';
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
/**
 * Cerca una prenotazione gia' presente sulla STESSA property che copre lo
 * stesso soggiorno, arrivata da un'altra chiave (altro feed, o inserimento
 * manuale).
 *
 * Perche' serve una seconda chiave oltre a (platform, platform_booking_ref):
 * quella chiave e' l'UID iCal, ed e' diversa per ogni sorgente. Una property
 * con due feed (Villa Cristina: Booking + Airbnb) vede lo stesso periodo due
 * volte con due UID diversi — un canale come prenotazione, l'altro come
 * blocco calendario — e senza questo controllo diventerebbero due righe.
 * Stesso problema per le righe inserite a mano prima di collegare il feed:
 * il loro ref non e' un UID iCal, quindi non collide mai.
 *
 * Chiave scelta: (property_id, giorno di check-in, giorno di check-out).
 * Confronto sul GIORNO e non sul timestamp perche' l'iCal porta date pure
 * (mezzanotte UTC) mentre le righe manuali hanno l'orario reale di
 * check-in/out. Un'unita' non puo' ospitare due soggiorni sulle stesse
 * identiche notti, quindi la chiave non produce falsi positivi; due
 * soggiorni back-to-back (uno esce il 1 ago, l'altro entra il 1 ago) hanno
 * coppie di date diverse e restano distinti.
 */
async function findSameStayOnProperty(
  db: Database,
  shell: IcalBookingShell,
): Promise<{ id: string; dataSource: string; platformBookingRef: string } | undefined> {
  const [row] = await db
    .select({
      id: bookings.id,
      dataSource: bookings.dataSource,
      platformBookingRef: bookings.platformBookingRef,
    })
    .from(bookings)
    .where(
      and(
        eq(bookings.propertyId, shell.propertyId),
        sql`${bookings.checkinAt}::date = ${shell.checkinAt.toISOString()}::timestamptz::date`,
        sql`${bookings.checkoutAt}::date = ${shell.checkoutAt.toISOString()}::timestamptz::date`,
        sql`${bookings.status} <> 'cancelled'`,
      ),
    )
    .limit(1);

  return row;
}

export async function upsertBookingShell(
  db: Database,
  shell: IcalBookingShell,
): Promise<UpsertBookingShellResult> {
  // Guardia anti-doppione cross-feed / manuale. Va PRIMA dell'insert:
  // l'unique index copre solo (platform, platform_booking_ref) e non
  // intercetta lo stesso soggiorno arrivato con un UID diverso.
  const sameStay = await findSameStayOnProperty(db, shell);
  if (sameStay && sameStay.platformBookingRef !== shell.platformBookingRef) {
    return {
      inserted: false,
      bookingId: sameStay.id,
      skipped: true,
      reason: isRichDataSource(sameStay.dataSource)
        ? 'same stay already present with rich data (other feed or manual entry)'
        : 'same stay already covered by another feed',
    };
  }

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

  await db.update(bookings).set({ updatedAt: sql`NOW()` }).where(eq(bookings.id, existing.id));

  return {
    inserted: false,
    bookingId: existing.id,
    skipped: true,
    reason: 'already exists with same data_source',
  };
}
