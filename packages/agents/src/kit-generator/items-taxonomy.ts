// Slice C — Items taxonomy (V1 hardcoded, estendibile).
//
// Tassonomia degli item proponibili da Premura. Ogni chiave mappa a:
//  - fonte: dove si compra (amazon Business / Glovo same-day / manuale)
//  - leadTime: tempo dal click al "in mano al cleaner"
//  - examples: prodotti specifici tipici (testo libero, NO ASIN — il
//    founder sceglie ASIN preciso al momento dell'ordine)
//  - typicalPriceEur: range range V1 calibrato sul mercato italiano
//
// L'agent kit-generator usa questa tassonomia per limitare il search space.
// Pilot Napoli: bias forte su prodotti locali (pasticceria, vino Campania,
// limoncello). Per host non-napoletani in V2 sara' esteso per regione.

export type Fonte = 'amazon' | 'glovo' | 'manual_print' | 'manual_write';
export type LeadTime = 'same_day' | '1_day' | '2_days' | '1_hour';

export type TaxonomyEntry = {
  fonte: Fonte;
  leadTime: LeadTime;
  examples?: string[];
  description_it?: string;
  description_en?: string;
  typicalPriceEur: { min: number; max: number; perPerson?: boolean };
};

export const ITEMS_TAXONOMY: Record<string, TaxonomyEntry> = {
  // ─── FRESH SAME-DAY (Glovo) ────────────────────────────────
  pasticceria_fresca_napoletana: {
    fonte: 'glovo',
    leadTime: 'same_day',
    examples: ['pasticciotti Scaturchio', 'sfogliatelle Poppella', 'baba Pintauro'],
    typicalPriceEur: { min: 2, max: 5, perPerson: true },
  },
  fiori_freschi_piccolo_mazzo: {
    fonte: 'glovo',
    leadTime: 'same_day',
    examples: ['mazzolino piccolo', 'rosa singola elegante'],
    typicalPriceEur: { min: 5, max: 15 },
  },
  frutta_fresca_stagionale: {
    fonte: 'glovo',
    leadTime: 'same_day',
    examples: ['cestino frutta misto'],
    typicalPriceEur: { min: 5, max: 12 },
  },

  // ─── PACKAGED (Amazon Business, lead 2-3gg) ────────────────
  caffe_napoletano_confezionato: {
    fonte: 'amazon',
    leadTime: '2_days',
    examples: ['Kimbo bustina filtro', 'Passalacqua moka 250g', 'Toraldo macinato'],
    typicalPriceEur: { min: 3, max: 8 },
  },
  vino_locale_campania: {
    fonte: 'amazon',
    leadTime: '2_days',
    examples: ['Falanghina Feudi San Gregorio', 'Greco di Tufo', 'Aglianico riserva'],
    typicalPriceEur: { min: 8, max: 20 },
  },
  liquore_locale: {
    fonte: 'amazon',
    leadTime: '2_days',
    examples: ['Limoncello Sorrento mini 100ml', 'Strega Alberti', 'Nocillo'],
    typicalPriceEur: { min: 5, max: 12 },
  },
  cioccolato_artigianale: {
    fonte: 'amazon',
    leadTime: '2_days',
    examples: ['Tavoletta Gay-Odin Cremino', 'Cuneesi al rhum'],
    typicalPriceEur: { min: 4, max: 10 },
  },
  prodotto_iconico_napoli: {
    fonte: 'amazon',
    leadTime: '2_days',
    examples: ['friselle pugliesi', 'taralli sugna e pepe', 'pasta Gragnano IGP'],
    typicalPriceEur: { min: 3, max: 8 },
  },
  acqua_minerale_premium: {
    fonte: 'amazon',
    leadTime: '2_days',
    examples: ['Ferrarelle vetro 750ml x2', 'Acqua Lete'],
    typicalPriceEur: { min: 3, max: 6 },
  },
  te_premium: {
    fonte: 'amazon',
    leadTime: '2_days',
    examples: ['Tea English breakfast bustine x10', 'Earl Grey premium'],
    typicalPriceEur: { min: 4, max: 8 },
  },
  prodotto_kids_baby: {
    fonte: 'amazon',
    leadTime: '2_days',
    examples: ['biscotti per bambini', 'succo di frutta bio'],
    typicalPriceEur: { min: 3, max: 8 },
  },

  // ─── MANUAL (Andrea/Karen prepara) ─────────────────────────
  mappa_personalizzata_stampata: {
    fonte: 'manual_print',
    leadTime: '1_day',
    description_it: 'Stampa A4 con suggerimenti curati host',
    description_en: 'Curated A4 print with host suggestions',
    typicalPriceEur: { min: 0.5, max: 1 },
  },
  biglietto_manoscritto: {
    fonte: 'manual_write',
    leadTime: '1_hour',
    description_it: 'Cleaner scrive nome guest a mano su biglietto pre-stampato',
    description_en: 'Cleaner writes guest name by hand on pre-printed card',
    typicalPriceEur: { min: 0, max: 0 },
  },
  guida_napoli_curata: {
    fonte: 'manual_print',
    leadTime: '1_day',
    description_it: '5 ristoranti, 2 panorami, 1 frase "evita questo"',
    description_en: '5 restaurants, 2 viewpoints, 1 "avoid this"',
    typicalPriceEur: { min: 1, max: 2 },
  },
};

export type TaxonomyKey = keyof typeof ITEMS_TAXONOMY;

// Helper: budget tier in funzione delle notti (CONTEXT.md §5 ratio).
// hostPayout: importo netto host post-fee channel.
// Nights -> budget target (capped):
//   1-2: min(hostPayout * 0.07, 12)
//   3-5: min(hostPayout * 0.06, 18)
//   6+:  min(hostPayout * 0.05, 30)
export function computeKitBudgetEur(input: { nights: number; hostPayoutEur: number }): number {
  const { nights, hostPayoutEur } = input;
  if (nights <= 2) return Math.min(hostPayoutEur * 0.07, 12);
  if (nights <= 5) return Math.min(hostPayoutEur * 0.06, 18);
  return Math.min(hostPayoutEur * 0.05, 30);
}
