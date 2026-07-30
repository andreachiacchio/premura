// Doppioni tra iCal Booking e prenotazioni note (decisione 30/07):
// l'iCal Booking unisce soggiorni contigui in un'unica fascia "CLOSED"
// (es. "30 lug - 8 ago" = Krzysztof 29 lug-1 ago + Julian 1-8 ago).
// Se una fascia "occupato, sorgente ignota" e' INTERAMENTE coperta da
// prenotazioni note della stessa property, mostrarla e' rumore:
// l'informazione c'e' gia'.
//
// Copertura per intervalli [start, end): si fondono gli intervalli noti
// e si verifica che la fascia stia dentro un intervallo fuso. Confronto
// per GIORNO (date-only): gli orari di check-in/out non contano per
// l'occupazione del calendario.

type Range = { checkinAt: Date; checkoutAt: Date };

/** Millisecondi del giorno (UTC) — normalizza via gli orari. */
function dayUtc(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** La fascia e' interamente coperta dall'unione degli intervalli noti? */
export function isRangeCoveredByBookings(range: Range, known: Range[]): boolean {
  const start = dayUtc(range.checkinAt);
  const end = dayUtc(range.checkoutAt);
  if (end <= start) return true;

  const sorted = known
    .map((k) => ({ s: dayUtc(k.checkinAt), e: dayUtc(k.checkoutAt) }))
    .filter((k) => k.e > k.s)
    .sort((a, b) => a.s - b.s);

  // Scorri gli intervalli fusi: la copertura deve avanzare senza buchi
  // dal primo all'ultimo giorno della fascia.
  let cursor = start;
  for (const k of sorted) {
    if (k.s > cursor) break; // buco prima di questo intervallo
    if (k.e > cursor) cursor = k.e;
    if (cursor >= end) return true;
  }
  return cursor >= end;
}
