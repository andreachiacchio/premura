// Importi scritti da un host italiano.
//
// "1.234,50" e' come si scrive milleduecentotrentaquattro e cinquanta.
// Un replace(',', '.') secco lo avrebbe salvato come 1,234 euro: il
// prezzo pilota il budget del kit, quindi sbagliarlo di mille volte
// non e' un dettaglio di formattazione.
//
// Modulo separato dalle server action di proposito: quelle importano
// next/cache e next/navigation e non si testano a mano.

/** Importo scritto all'italiana -> stringa decimale per drizzle.
 *  "1.234,50" -> "1234.50"; "450" -> "450"; "12,5" -> "12.5".
 *  Ritorna null se non e' un importo valido. */
export function normalizeEuroAmount(raw: string): string | null {
  const s = raw.trim().replace(/[\s€]/g, '');
  if (s === '') return null;

  // Con una virgola presente, quella e' il separatore decimale e i
  // punti sono migliaia. Senza virgola, un gruppo di punti ogni tre
  // cifre e' comunque migliaia ("1.234"); tutto il resto e' un punto
  // decimale all'anglosassone ("99.90").
  let normalizzato: string;
  if (s.includes(',')) {
    normalizzato = s.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    normalizzato = s.replace(/\./g, '');
  } else {
    normalizzato = s;
  }

  if (!/^\d+(\.\d+)?$/.test(normalizzato)) return null;
  const n = Number(normalizzato);
  if (!Number.isFinite(n) || n < 0 || n > 99_999_999) return null;
  return normalizzato;
}
