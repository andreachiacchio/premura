// Fasce "occupato — sorgente ignota": helper condivisi tra home e
// pagina check-in (ristrutturazione Andrea 30/07).
//
// Principio: raggruppare per quello che l'host deve FARE, non per come
// e' organizzato il database. Due gruppi per urgenza:
//   - "Da verificare ora" = check-in entro 30 giorni
//   - "Piu' avanti"       = tutto il resto, compresso
// La struttura e' un chip a inizio riga; le date sono l'unica
// informazione della riga e non si troncano mai.

export type OccupiedRange = {
  id: string;
  propertyId: string;
  propertyName: string;
  checkinAtIso: string;
  checkoutAtIso: string;
};

export const URGENT_WINDOW_DAYS = 30;

function startOfDay(d: Date): Date {
  const day = new Date(d);
  day.setHours(0, 0, 0, 0);
  return day;
}

/** Giorni interi da oggi al check-in (negativo = gia' iniziata). */
export function daysUntil(dateIso: string, now: Date): number {
  const today = startOfDay(now);
  const target = startOfDay(new Date(dateIso));
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

/** Divide per urgenza; ogni gruppo in ordine cronologico. */
export function splitByUrgency(
  ranges: OccupiedRange[],
  now: Date,
): { soon: OccupiedRange[]; later: OccupiedRange[] } {
  const sorted = [...ranges].sort(
    (a, b) => new Date(a.checkinAtIso).getTime() - new Date(b.checkinAtIso).getTime(),
  );
  return {
    soon: sorted.filter((r) => daysUntil(r.checkinAtIso, now) <= URGENT_WINDOW_DAYS),
    later: sorted.filter((r) => daysUntil(r.checkinAtIso, now) > URGENT_WINDOW_DAYS),
  };
}

// Connettivi che restano per esteso quando si abbrevia il nome.
const CONNECTIVES = new Set(['di', 'del', 'della', 'dei', 'delle', 'da', 'e', 'la', 'il', 'lo']);
const ABBREVIATE_OVER_CHARS = 18;

/**
 * "La Goccia di San Gennaro" -> "La Goccia di S.G."
 * I nomi corti restano interi; oltre la soglia le parole dopo le prime
 * due diventano iniziali (i connettivi tipo "di" restano per esteso).
 * Le iniziali consecutive si attaccano ("S.G.", non "S. G.").
 */
export function abbreviatePropertyName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length <= ABBREVIATE_OVER_CHARS) return trimmed;
  const words = trimmed.split(/\s+/);
  const parts: string[] = [];
  for (const [i, word] of words.entries()) {
    if (i < 2 || CONNECTIVES.has(word.toLowerCase())) {
      parts.push(word);
    } else {
      const initial = `${word.charAt(0).toUpperCase()}.`;
      const prev = parts[parts.length - 1];
      // Iniziale dopo iniziale: attaccata alla precedente.
      if (prev?.endsWith('.') && i >= 2 && !CONNECTIVES.has(words[i - 1]?.toLowerCase() ?? '')) {
        parts[parts.length - 1] = `${prev}${initial}`;
      } else {
        parts.push(initial);
      }
    }
  }
  return parts.join(' ');
}

const MONTH_FMT = new Intl.DateTimeFormat('it-IT', { month: 'long' });
const MONTH_YEAR_FMT = new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric' });

/**
 * Date complete, mai troncate: "4 – 9 agosto 2026",
 * "30 luglio – 8 agosto 2026", "28 dicembre 2026 – 2 gennaio 2027".
 * L'ULTIMA notte e' checkout-1, ma per l'host la fascia si legge coi
 * giorni del calendario: check-in e check-out cosi' come sono.
 */
export function fullDateRange(checkinIso: string, checkoutIso: string): string {
  const start = new Date(checkinIso);
  const end = new Date(checkoutIso);
  const sameYear = start.getFullYear() === end.getFullYear();
  const sameMonth = sameYear && start.getMonth() === end.getMonth();
  if (sameMonth) {
    return `${start.getDate()} – ${end.getDate()} ${MONTH_YEAR_FMT.format(end)}`;
  }
  if (sameYear) {
    return `${start.getDate()} ${MONTH_FMT.format(start)} – ${end.getDate()} ${MONTH_YEAR_FMT.format(end)}`;
  }
  return `${start.getDate()} ${MONTH_YEAR_FMT.format(start)} – ${end.getDate()} ${MONTH_YEAR_FMT.format(end)}`;
}

/**
 * Etichetta di distanza: "fra N giorni" (o "oggi"/"domani"/"in corso")
 * per il gruppo urgente, il mese per quello lontano.
 */
export function distanceLabel(range: OccupiedRange, now: Date): string {
  const days = daysUntil(range.checkinAtIso, now);
  if (days > URGENT_WINDOW_DAYS) {
    const start = new Date(range.checkinAtIso);
    return start.getFullYear() === now.getFullYear()
      ? MONTH_FMT.format(start)
      : MONTH_YEAR_FMT.format(start);
  }
  if (days < 0) return 'in corso';
  if (days === 0) return 'oggi';
  if (days === 1) return 'domani';
  return `fra ${days} giorni`;
}
