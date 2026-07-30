// Sistema colori per struttura (Andrea, 30/07): un colore fisso per
// riconoscere la struttura senza leggere, usato come SISTEMA in tutta
// l'app — bordo sinistro delle righe, chip, avatar, intestazioni di
// gruppo. La verita' sta in properties.color; alla creazione si
// assegna il primo colore libero della palette.

/** Palette definita: i primi tre sono i colori decisi per le strutture
 *  esistenti (VC blu-verde, Goccia terracotta, Sotterranea viola). */
export const PROPERTY_PALETTE = [
  '#2E7D96',
  '#C05621',
  '#6B4E9E',
  '#3E7A4E',
  '#8A6D1F',
  '#A04E6E',
  '#4E6EA0',
  '#6E7D2E',
] as const;

/** Primo colore della palette non ancora usato dalle property dell'host. */
export function nextPropertyColor(usedColors: Array<string | null>): string {
  const used = new Set(usedColors.filter((c): c is string => Boolean(c)));
  for (const c of PROPERTY_PALETTE) {
    if (!used.has(c)) return c;
  }
  // Palette esaurita: si ricomincia — meglio un colore ripetuto che
  // una struttura senza colore.
  return PROPERTY_PALETTE[usedColors.length % PROPERTY_PALETTE.length] ?? '#2E7D96';
}

/**
 * Colore da mostrare quando la riga non ha ancora properties.color
 * (property creata prima della migration): deterministico dal nome,
 * cosi' la stessa struttura ha sempre lo stesso colore ovunque.
 */
export function propertyColorOrFallback(color: string | null, propertyName: string): string {
  if (color) return color;
  let hash = 0;
  for (const ch of propertyName) hash = (hash * 31 + ch.charCodeAt(0)) % 997;
  return PROPERTY_PALETTE[hash % PROPERTY_PALETTE.length] ?? '#2E7D96';
}
