import { type Database, bookings } from '@premura/db';
import { and, eq, gte, inArray, ne } from 'drizzle-orm';

// Rilevamento cancellazioni 2-poll (Andrea 30/07).
//
// Il problema: un evento che sparisce dal feed iCal oggi non viene mai
// marcato — la riga resta 'confirmed' per sempre, e si preparano kit e
// pulizie per ospiti che hanno disdetto.
//
// La regola: se un evento iCal non compare per DUE POLL RIUSCITI
// consecutivi, la prenotazione diventa "possibile cancellazione"
// (possible_cancellation_at) e sale in "Serve una tua decisione".
//
// VINCOLO OBBLIGATORIO (Andrea): "feed risponde e l'evento non c'e'" e'
// diverso da "feed non risponde". Solo il primo caso conta. Un poll
// fallito (HTTP error, timeout, body non parsabile) NON incrementa il
// contatore — il chiamante NON deve nemmeno chiamare questa funzione in
// quel caso. Il feed morto di La Goccia (400 Invalid Token) non deve
// mai far sembrare cancellata un'intera struttura.

export const MISSING_POLLS_THRESHOLD = 2;

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
  /** Righe riapparse nel feed: contatore e sospetto si azzerano. */
  resetIds: string[];
  /** Righe assenti in QUESTO poll riuscito. */
  updates: Array<{ id: string; nextCount: number; flagNow: boolean }>;
};

/** Decisione pura, testabile: cosa fare per ogni riga dato l'insieme
 *  degli UID visti in un poll RIUSCITO. */
export function planMissingUpdates(
  targets: ReconcileTarget[],
  seenRefs: ReadonlySet<string>,
  seenRanges: readonly SeenRange[] = [],
): MissingUpdatePlan {
  const resetIds: string[] = [];
  const updates: MissingUpdatePlan['updates'] = [];
  for (const t of targets) {
    // Un UID sparito NON e' una cancellazione se le sue date sono ancora
    // coperte da un altro evento dello STESSO feed (06/08).
    //
    // Booking riemette la fascia col periodo residuo e un UID nuovo a
    // ogni notte: il vecchio UID sparisce davvero, ma l'ospite e' ancora
    // li' — lo dice l'evento che ha preso il suo posto. Guardare solo
    // gli UID faceva concludere "cancellata" da una prova che non
    // riguardava la prenotazione, ma il modo in cui il feed la nomina.
    const stillCovered =
      seenRefs.has(t.platformBookingRef) ||
      seenRanges.some((r) => overlaps(r, { checkinAt: t.checkinAt, checkoutAt: t.checkoutAt }));

    if (stillCovered) {
      if (t.feedMissingCount > 0 || t.possibleCancellationAt) resetIds.push(t.id);
    } else {
      const nextCount = t.feedMissingCount + 1;
      updates.push({
        id: t.id,
        nextCount,
        flagNow: nextCount >= MISSING_POLLS_THRESHOLD && !t.possibleCancellationAt,
      });
    }
  }
  return { resetIds, updates };
}

export type ReconcileSummary = { reset: number; missed: number; flagged: string[] };

/**
 * Da chiamare SOLO dopo un fetch+parse riuscito del feed di
 * (propertyId, source). Considera solo arrivi FUTURI: un soggiorno in
 * corso che esce dalla finestra del feed non e' una cancellazione.
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
        gte(bookings.checkinAt, startOfToday),
      ),
    );

  const plan = planMissingUpdates(targets, seenRefs, seenRanges);

  if (plan.resetIds.length > 0) {
    await db
      .update(bookings)
      .set({ feedMissingCount: 0, possibleCancellationAt: null, updatedAt: now })
      .where(inArray(bookings.id, plan.resetIds));
  }

  const flagged: string[] = [];
  for (const u of plan.updates) {
    await db
      .update(bookings)
      .set({
        feedMissingCount: u.nextCount,
        ...(u.flagNow ? { possibleCancellationAt: now } : {}),
        updatedAt: now,
      })
      .where(eq(bookings.id, u.id));
    if (u.flagNow) flagged.push(u.id);
  }

  return { reset: plan.resetIds.length, missed: plan.updates.length, flagged };
}
