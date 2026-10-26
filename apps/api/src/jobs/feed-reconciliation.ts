import { CANCELLATION_REASONS, type Database, bookings } from '@premura/db';
import { and, eq, gte, inArray, ne } from 'drizzle-orm';

// Cancellazioni dal feed iCal: decide Premura, non l'host (26/10).
//
// Il problema di partenza (30/07): un evento che sparisce dal feed iCal
// non veniva mai marcato — la riga restava 'confirmed' per sempre, e si
// preparavano kit e pulizie per ospiti che avevano disdetto.
//
// La prima risposta fu chiedere all'host. Misurato il 26/10 su Villa
// Cristina: 7 "possibili cancellazioni" ferme da 5 a 67 giorni, nessuna
// risposta. Erano tutte cancellazioni vere. Una domanda che nessuno
// apre non protegge niente: sposta solo il problema in home.
//
// Le regole adesso:
//  - 2 poll riusciti senza l'evento -> in osservazione
//    (possible_cancellation_at). Non e' una decisione per l'host.
//  - 3 giorni di poll riusciti senza l'evento -> cancellata da Premura,
//    cancellation_reason = 'feed_missing_3d'.
//  - UID sparito ma date coperte da un altro evento dello STESSO feed ->
//    cancellata subito, cancellation_reason = 'superseded'. Una
//    struttura e' un'unita' sola: due prenotazioni sovrapposte non
//    esistono, e quella che copre e' la stessa che Booking ha rinominato.
//  - Mai cancellare un soggiorno gia' iniziato: l'ospite e' in casa.
//    "Oggi" e' il giorno di Roma, non quello del server (UTC su Fly).
//  - "Era ancora attiva" dell'host (host_kept_active_at) vince finche'
//    l'UID resta assente: la riga si osserva ma non si cancella. Quando
//    l'UID ricompare l'esenzione cade, e una nuova sparizione si conta.
//  - Una riga cancellata da Premura il cui UID ricompare nel feed torna
//    confirmed: la decisione era di Premura, e il feed la smentisce.
//  - Un feed che risponde senza nessun evento non prova niente: non si
//    conta (26/10, revisione). Tre giorni di feed vuoto cancellerebbero
//    tutta la struttura.
//
// VINCOLO OBBLIGATORIO (Andrea 30/07): "feed risponde e l'evento non c'e'"
// e' diverso da "feed non risponde". Solo il primo caso conta. Un poll
// fallito (HTTP error, timeout, body non parsabile) NON incrementa il
// contatore — il chiamante NON deve nemmeno chiamare questa funzione in
// quel caso. Il feed morto di La Goccia (400 Invalid Token) non deve mai
// far sembrare cancellata un'intera struttura.

export const MISSING_POLLS_THRESHOLD = 2;

/** Il poll iCal gira ogni 15 minuti (ical-cron.ts): 96 al giorno. */
const POLLS_PER_DAY = 96;
/** 3 giorni di poll riusciti consecutivi: 288. */
export const CANCEL_AFTER_MISSING_POLLS = 3 * POLLS_PER_DAY;

export type ReconcileTarget = {
  id: string;
  platformBookingRef: string;
  feedMissingCount: number;
  possibleCancellationAt: Date | null;
  checkinAt: Date;
  checkoutAt: Date;
  /** L'host ha detto "era ancora attiva" (host_kept_active_at). */
  hostKeptActive: boolean;
};

/**
 * Una fascia vista nel poll e la riga a cui l'upsert l'ha assegnata.
 * Si registra DOPO un upsert riuscito (R2): una fascia il cui upsert e'
 * fallito non prova che un'altra riga abbia preso il posto di questa.
 */
export type SeenRange = { checkinAt: Date; checkoutAt: Date; bookingId: string };

type Range = { checkinAt: Date; checkoutAt: Date };

/** Sovrapposizione STRETTA: due soggiorni consecutivi si toccano, non si coprono. */
function overlaps(a: Range, b: Range): boolean {
  return a.checkinAt < b.checkoutAt && b.checkinAt < a.checkoutAt;
}

/**
 * Inizio di oggi a Roma, nel formato in cui l'iCal salva checkin_at
 * (mezzanotte UTC della data). Su Fly il processo e' in UTC: con
 * setHours(0), fra le 23 e le 24 UTC un arrivo di ieri risultava ancora
 * di oggi — proprio l'ora in cui Booking riemette i residui.
 */
export function romeStartOfDay(now: Date): Date {
  const romeDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(now);
  return new Date(`${romeDate}T00:00:00Z`);
}

export type MissingUpdatePlan = {
  /** Righe riapparse nel feed: contatore e osservazione si azzerano. */
  resetIds: string[];
  /** UID sparito, date coperte da un altro evento: stessa prenotazione rinominata. */
  supersededIds: string[];
  /** Righe assenti in QUESTO poll riuscito. */
  updates: Array<{ id: string; nextCount: number; flagNow: boolean; cancelNow: boolean }>;
};

/** Decisione pura, testabile: cosa fare per ogni riga dato l'insieme
 *  degli UID e delle fasce visti in un poll RIUSCITO. */
export function planMissingUpdates(
  targets: ReconcileTarget[],
  seenRefs: ReadonlySet<string>,
  seenRanges: readonly SeenRange[],
  startOfToday: Date,
): MissingUpdatePlan {
  const resetIds: string[] = [];
  const supersededIds: string[] = [];
  const updates: MissingUpdatePlan['updates'] = [];

  // Nessun evento nel feed: non e' la prova che tutte le prenotazioni
  // siano sparite, e' la prova che il feed e' vuoto (calendario
  // scollegato, struttura disattivata). Come un poll fallito: non conta.
  if (seenRefs.size === 0) return { resetIds, supersededIds, updates };

  for (const t of targets) {
    if (seenRefs.has(t.platformBookingRef)) {
      if (t.feedMissingCount > 0 || t.possibleCancellationAt || t.hostKeptActive) {
        resetIds.push(t.id);
      }
      continue;
    }

    // Un soggiorno gia' iniziato non si cancella mai: l'ospite e' in
    // casa, e un feed che lo accorcia o lo rinomina non lo fa uscire.
    if (t.checkinAt < startOfToday) continue;

    // 06/08 il caso Julian: Booking riemette la fascia col periodo
    // residuo e un UID nuovo. Allora si concluse "non e' una
    // cancellazione" e la riga restava confirmed per sempre — anche
    // quando la riga che copre era un'ALTRA riga del database (26/10:
    // 22-30 ott e 27-30 ott, la seconda ferma dal 21/09). Le date
    // coperte dicono che la prenotazione esiste, non che esiste QUESTA
    // riga: quella vera e' l'altra — purche' la fascia sia andata
    // davvero a un'ALTRA riga.
    const coveredByAnother = seenRanges.some((r) => r.bookingId !== t.id && overlaps(r, t));
    if (coveredByAnother && !t.hostKeptActive) {
      supersededIds.push(t.id);
      continue;
    }

    const nextCount = t.feedMissingCount + 1;
    updates.push({
      id: t.id,
      nextCount,
      flagNow: nextCount >= MISSING_POLLS_THRESHOLD && !t.possibleCancellationAt,
      cancelNow: nextCount >= CANCEL_AFTER_MISSING_POLLS && !t.hostKeptActive,
    });
  }
  return { resetIds, supersededIds, updates };
}

/** Righe cancellate da Premura il cui UID e' tornato nel feed. */
export function planRevivals(
  cancelledByPremura: ReadonlyArray<{ id: string; platformBookingRef: string }>,
  seenRefs: ReadonlySet<string>,
): string[] {
  return cancelledByPremura.filter((c) => seenRefs.has(c.platformBookingRef)).map((c) => c.id);
}

export type ReconcileSummary = {
  reset: number;
  missed: number;
  flagged: string[];
  cancelled: string[];
  superseded: string[];
  revived: string[];
};

/**
 * Da chiamare SOLO dopo un fetch+parse riuscito del feed di
 * (propertyId, source). Considera solo arrivi da oggi in poi: un
 * soggiorno in corso che esce dalla finestra del feed non e' una
 * cancellazione.
 */
export async function reconcileMissingEvents(
  db: Database,
  propertyId: string,
  source: 'booking' | 'airbnb',
  seenRefs: ReadonlySet<string>,
  now: Date = new Date(),
  seenRanges: readonly SeenRange[] = [],
): Promise<ReconcileSummary> {
  const startOfToday = romeStartOfDay(now);
  const sameFeed = and(
    eq(bookings.propertyId, propertyId),
    eq(bookings.dataSource, `${source}_ical_only`),
    eq(bookings.isCalendarBlock, false),
    gte(bookings.checkinAt, startOfToday),
  );

  const rows = await db
    .select({
      id: bookings.id,
      platformBookingRef: bookings.platformBookingRef,
      feedMissingCount: bookings.feedMissingCount,
      possibleCancellationAt: bookings.possibleCancellationAt,
      checkinAt: bookings.checkinAt,
      checkoutAt: bookings.checkoutAt,
      hostKeptActiveAt: bookings.hostKeptActiveAt,
    })
    .from(bookings)
    .where(and(sameFeed, ne(bookings.status, 'cancelled')));
  const targets = rows.map(({ hostKeptActiveAt, ...t }) => ({
    ...t,
    hostKeptActive: hostKeptActiveAt !== null,
  }));

  const plan = planMissingUpdates(targets, seenRefs, seenRanges, startOfToday);

  if (plan.resetIds.length > 0) {
    await db
      .update(bookings)
      .set({
        feedMissingCount: 0,
        possibleCancellationAt: null,
        hostKeptActiveAt: null,
        updatedAt: now,
      })
      .where(inArray(bookings.id, plan.resetIds));
  }

  const cancelledByPremura = await db
    .select({ id: bookings.id, platformBookingRef: bookings.platformBookingRef })
    .from(bookings)
    .where(
      and(
        sameFeed,
        eq(bookings.status, 'cancelled'),
        inArray(bookings.cancellationReason, [...CANCELLATION_REASONS]),
      ),
    );
  const revived = planRevivals(cancelledByPremura, seenRefs);
  if (revived.length > 0) {
    await db
      .update(bookings)
      .set({
        status: 'confirmed',
        cancellationReason: null,
        feedMissingCount: 0,
        possibleCancellationAt: null,
        updatedAt: now,
      })
      .where(inArray(bookings.id, revived));
  }

  if (plan.supersededIds.length > 0) {
    await db
      .update(bookings)
      .set({ status: 'cancelled', cancellationReason: 'superseded', updatedAt: now })
      .where(inArray(bookings.id, plan.supersededIds));
  }

  const flagged: string[] = [];
  const cancelled: string[] = [];
  for (const u of plan.updates) {
    await db
      .update(bookings)
      .set({
        feedMissingCount: u.nextCount,
        // possible_cancellation_at resta anche dopo la cancellazione: e'
        // il momento in cui il feed ha tolto la prenotazione, ed e' la
        // data che la home mostra all'host.
        ...(u.flagNow ? { possibleCancellationAt: now } : {}),
        ...(u.cancelNow
          ? { status: 'cancelled' as const, cancellationReason: 'feed_missing_3d' as const }
          : {}),
        updatedAt: now,
      })
      .where(eq(bookings.id, u.id));
    if (u.flagNow) flagged.push(u.id);
    if (u.cancelNow) cancelled.push(u.id);
  }

  return {
    reset: plan.resetIds.length,
    missed: plan.updates.length,
    flagged,
    cancelled,
    superseded: plan.supersededIds,
    revived,
  };
}
