import { type Database, bookings } from '@premura/db';
import { ANONYMOUS_ICAL_SOURCES, isRichDataSource } from '@premura/shared';
import { and, eq, ne, notInArray, sql } from 'drizzle-orm';
import type { IcalBookingShell } from './ical-event-mapper';

// ─── Dedup fasce anonime (Andrea 30/07, PARTE A) ────────────────────
//
// Il feed Booking esporta fasce contigue come UN evento "CLOSED": su
// Villa Cristina la fascia 30/7-8/8 era Krzysztof + Julian, gia'
// presenti con nome e codice. Un evento ANONIMO interamente coperto
// dall'unione di prenotazioni con nome sulla stessa property e' rumore
// e non va creato; se esiste gia', al poll successivo diventa blocco
// calendario (sparisce dalle viste ospite, resta tracciabile).

// Fonte unica condivisa con apps/web (05/08): l'assorbimento della
// fascia da parte di una prenotazione inserita a mano deve usare
// ESATTAMENTE lo stesso elenco, o le due parti divergono al primo
// valore nuovo.
const ANON_SOURCES: string[] = [...ANONYMOUS_ICAL_SOURCES];
const ANON_NAMES = new Set(['booking guest', 'reserved', 'ospite']);

function isAnonymousShell(shell: IcalBookingShell): boolean {
  return (
    ANON_SOURCES.includes(shell.dataSource) &&
    ANON_NAMES.has(shell.guestFullName.trim().toLowerCase())
  );
}

function dayUtc(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** La fascia [checkin, checkout) e' coperta dall'unione degli
 *  intervalli? Confronto per GIORNO; la copertura puo' venire da PIU'
 *  prenotazioni contigue, non solo da una. */
export function isRangeCoveredByIntervals(
  range: { checkinAt: Date; checkoutAt: Date },
  intervals: Array<{ checkinAt: Date; checkoutAt: Date }>,
): boolean {
  const start = dayUtc(range.checkinAt);
  const end = dayUtc(range.checkoutAt);
  if (end <= start) return true;
  const sorted = intervals
    .map((k) => ({ s: dayUtc(k.checkinAt), e: dayUtc(k.checkoutAt) }))
    .filter((k) => k.e > k.s)
    .sort((a, b) => a.s - b.s);
  let cursor = start;
  for (const k of sorted) {
    if (k.s > cursor) break;
    if (k.e > cursor) cursor = k.e;
    if (cursor >= end) return true;
  }
  return cursor >= end;
}

/** Prenotazione con nome che copre (in parte) la fascia anonima —
 *  materiale per il log di soppressione. */
export type CoveringBooking = {
  id: string;
  guestFullName: string;
  checkinAt: Date;
  checkoutAt: Date;
};

async function findCoveringNamedBookings(
  db: Database,
  shell: IcalBookingShell,
): Promise<CoveringBooking[] | null> {
  const named = await db
    .select({
      id: bookings.id,
      guestFullName: bookings.guestFullName,
      checkinAt: bookings.checkinAt,
      checkoutAt: bookings.checkoutAt,
    })
    .from(bookings)
    .where(
      and(
        eq(bookings.propertyId, shell.propertyId),
        notInArray(bookings.dataSource, ANON_SOURCES),
        eq(bookings.isCalendarBlock, false),
        ne(bookings.status, 'cancelled'),
        sql`${bookings.checkinAt} < ${shell.checkoutAt.toISOString()}::timestamptz`,
        sql`${bookings.checkoutAt} > ${shell.checkinAt.toISOString()}::timestamptz`,
      ),
    );
  return isRangeCoveredByIntervals(shell, named) ? named : null;
}

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
  /**
   * Valorizzato quando una fascia anonima e' stata soppressa perche'
   * coperta da prenotazioni con nome (PARTE A, 30/07). MAI sopprimere
   * in silenzio: finche' i feed sono incrociati, un evento di un'altra
   * casa puo' risultare "coperto" per sbaglio — il log del chiamante
   * e' l'unico modo per sapere cosa e' stato scartato e recuperarlo
   * dopo la rimappatura dei feed.
   */
  suppressedCoverage?: {
    propertyId: string;
    platformBookingRef: string;
    checkinAt: Date;
    checkoutAt: Date;
    coveredBy: CoveringBooking[];
  };
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
  // Dedup fasce anonime (PARTE A): un evento senza nome interamente
  // coperto da prenotazioni con nome NON si crea proprio.
  if (isAnonymousShell(shell)) {
    const coveredBy = await findCoveringNamedBookings(db, shell);
    if (coveredBy) {
      return {
        inserted: false,
        bookingId: '',
        skipped: true,
        reason: 'anonymous range covered by named bookings',
        suppressedCoverage: {
          propertyId: shell.propertyId,
          platformBookingRef: shell.platformBookingRef,
          checkinAt: shell.checkinAt,
          checkoutAt: shell.checkoutAt,
          coveredBy,
        },
      };
    }
  }

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

  // Stessa logica in AGGIORNAMENTO (PARTE A): se la riga anonima
  // esistente risulta ora coperta da prenotazioni con nome (arrivate
  // dopo), diventa blocco calendario — sparisce dalle viste ospite,
  // resta tracciabile (stessa semantica della bonifica 30/07).
  if (isAnonymousShell(shell)) {
    const coveredBy = await findCoveringNamedBookings(db, shell);
    if (coveredBy) {
      await db
        .update(bookings)
        .set({ isCalendarBlock: true, updatedAt: sql`NOW()` })
        .where(eq(bookings.id, existing.id));
      return {
        inserted: false,
        bookingId: existing.id,
        skipped: true,
        reason: 'anonymous range now covered by named bookings - marked as block',
        suppressedCoverage: {
          propertyId: shell.propertyId,
          platformBookingRef: shell.platformBookingRef,
          checkinAt: shell.checkinAt,
          checkoutAt: shell.checkoutAt,
          coveredBy,
        },
      };
    }
  }

  await db.update(bookings).set({ updatedAt: sql`NOW()` }).where(eq(bookings.id, existing.id));

  return {
    inserted: false,
    bookingId: existing.id,
    skipped: true,
    reason: 'already exists with same data_source',
  };
}
