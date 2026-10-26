import { type Database, bookings } from '@premura/db';
import { and, eq, gte, inArray, isNull, ne } from 'drizzle-orm';

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
//  - "Era ancora attiva" dell'host (host_kept_active_at) vince: quella
//    riga non viene piu' toccata.
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
};

/** Una fascia vista nel poll: serve a capire se copre ancora una riga. */
export type SeenRange = { checkinAt: Date; checkoutAt: Date };

/** Sovrapposizione STRETTA: due soggiorni consecutivi si toccano, non si coprono. */
function overlaps(a: SeenRange, b: SeenRange): boolean {
  return a.checkinAt < b.checkoutAt && b.checkinAt < a.checkoutAt;
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
  for (const t of targets) {
    if (seenRefs.has(t.platformBookingRef)) {
      if (t.feedMissingCount > 0 || t.possibleCancellationAt) resetIds.push(t.id);
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
    // riga: quella vera e' l'altra.
    if (seenRanges.some((r) => overlaps(r, t))) {
      supersededIds.push(t.id);
      continue;
    }

    const nextCount = t.feedMissingCount + 1;
    updates.push({
      id: t.id,
      nextCount,
      flagNow: nextCount >= MISSING_POLLS_THRESHOLD && !t.possibleCancellationAt,
      cancelNow: nextCount >= CANCEL_AFTER_MISSING_POLLS,
    });
  }
  return { resetIds, supersededIds, updates };
}

export type ReconcileSummary = {
  reset: number;
  missed: number;
  flagged: string[];
  cancelled: string[];
  superseded: string[];
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
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const targets = await db
    .select({
      id: bookings.id,
      platformBookingRef: bookings.platformBookingRef,
      feedMissingCount: bookings.feedMissingCount,
      possibleCancellationAt: bookings.possibleCancellationAt,
      checkinAt: bookings.checkinAt,
      checkoutAt: bookings.checkoutAt,
    })
    .from(bookings)
    .where(
      and(
        eq(bookings.propertyId, propertyId),
        eq(bookings.dataSource, `${source}_ical_only`),
        eq(bookings.isCalendarBlock, false),
        ne(bookings.status, 'cancelled'),
        isNull(bookings.hostKeptActiveAt),
        gte(bookings.checkinAt, startOfToday),
      ),
    );

  const plan = planMissingUpdates(targets, seenRefs, seenRanges, startOfToday);

  if (plan.resetIds.length > 0) {
    await db
      .update(bookings)
      .set({ feedMissingCount: 0, possibleCancellationAt: null, updatedAt: now })
      .where(inArray(bookings.id, plan.resetIds));
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
  };
}
