import { z } from 'zod';
import type { Anthropic } from '@anthropic-ai/sdk';
import { runClaude } from '@/utils/claude.js';
import type { DnaSignals, DnaRisk, KitItem } from '@/db/schema.js';

// ===== CATALOG =====
// The catalog is intentionally small and curated. Quality > variety.
// This is the full set of items the agent can pick from.
// In production, move this to DB with availability + price sync jobs.

export type CatalogItem = {
  sku: string;
  name: string;
  category: KitItem['category'];
  priceEur: number;
  supplier: KitItem['supplier'];
  tags: string[]; // e.g. ["vegetarian", "local_napoli", "gluten_free"]
  description: string;
};

export const DEFAULT_CATALOG: CatalogItem[] = [
  // Wines
  {
    sku: 'FAL-SAN-375',
    name: 'Falanghina del Sannio DOP 0.375L',
    category: 'wine',
    priceEur: 6.5,
    supplier: 'amazon',
    tags: ['wine_white', 'local_campania', 'dry'],
    description: 'Vino bianco campano, fresco e minerale. Perfetto aperitivo.',
  },
  {
    sku: 'AGL-TAB-375',
    name: 'Aglianico del Taburno DOCG 0.375L',
    category: 'wine',
    priceEur: 7.5,
    supplier: 'amazon',
    tags: ['wine_red', 'local_campania', 'structured'],
    description: 'Rosso intenso, tannini importanti. Ideale con cena.',
  },
  {
    sku: 'FRA-PIC-200',
    name: 'Franciacorta brut 0.200L',
    category: 'wine',
    priceEur: 8.0,
    supplier: 'amazon',
    tags: ['sparkling', 'celebration'],
    description: 'Bollicine per occasioni speciali.',
  },

  // Sweets
  {
    sku: 'SFO-POP-2',
    name: 'Sfogliatelle Poppella (2 pz, sottovuoto)',
    category: 'sweet',
    priceEur: 4.5,
    supplier: 'partner',
    tags: ['local_napoli', 'iconic', 'contains_gluten'],
    description: 'Sfogliatelle frolla della storica pasticceria Poppella al Rione Sanità.',
  },
  {
    sku: 'TAR-NAP-200',
    name: 'Taralli napoletani sugna e pepe 200g',
    category: 'sweet',
    priceEur: 3.0,
    supplier: 'amazon',
    tags: ['local_napoli', 'savory', 'shelf_stable'],
    description: 'Taralli artigianali, compagni perfetti del vino.',
  },
  {
    sku: 'CIO-MOD-100',
    name: 'Cioccolato di Modica IGP 100g',
    category: 'sweet',
    priceEur: 5.0,
    supplier: 'amazon',
    tags: ['sicily', 'vegan_friendly', 'gluten_free'],
    description: 'Cioccolato crudo, consistenza granulosa unica.',
  },

  // Fresh
  {
    sku: 'FRU-STA-500',
    name: 'Cesto frutta di stagione 500g',
    category: 'fresh',
    priceEur: 5.0,
    supplier: 'cortilia',
    tags: ['healthy', 'fresh', 'family_friendly'],
    description: 'Selezione di frutta fresca di stagione.',
  },
  {
    sku: 'MOZ-BUF-250',
    name: 'Mozzarella di Bufala Campana DOP 250g',
    category: 'fresh',
    priceEur: 6.0,
    supplier: 'cortilia',
    tags: ['local_campania', 'iconic', 'fresh'],
    description: 'Mozzarella freschissima del giorno.',
  },

  // Care
  {
    sku: 'EAR-PLU-2',
    name: 'Tappi per orecchie in cera (coppia)',
    category: 'care',
    priceEur: 2.0,
    supplier: 'amazon',
    tags: ['noise', 'sleep'],
    description: 'Tappi comfort per chi è sensibile al rumore notturno.',
  },
  {
    sku: 'TIS-REL-10',
    name: 'Tisana rilassante bio (10 filtri)',
    category: 'care',
    priceEur: 4.0,
    supplier: 'amazon',
    tags: ['wellness', 'herbal'],
    description: 'Camomilla, melissa, lavanda.',
  },
  {
    sku: 'MAS-OCC-1',
    name: 'Mascherina notte in seta',
    category: 'care',
    priceEur: 3.5,
    supplier: 'amazon',
    tags: ['sleep', 'premium_feel'],
    description: 'Per dormire anche con luce esterna.',
  },

  // Kids
  {
    sku: 'KID-BIS-200',
    name: 'Biscotti bio per bambini 200g',
    category: 'kids',
    priceEur: 3.5,
    supplier: 'amazon',
    tags: ['family', 'organic', 'no_palm_oil'],
    description: 'Biscotti senza zuccheri aggiunti.',
  },
  {
    sku: 'KID-GIO-1',
    name: 'Piccolo gioco cartoline Napoli',
    category: 'kids',
    priceEur: 3.0,
    supplier: 'partner',
    tags: ['family', 'local'],
    description: 'Cartoline illustrate dei monumenti napoletani, gioco memory.',
  },
];

// ===== INPUT/OUTPUT =====

export type KitComposerInput = {
  dna: {
    archetype: string;
    archetypeDescription: string;
    signals: DnaSignals;
    risks: DnaRisk[];
  };
  booking: {
    numAdults: number;
    numChildren: number;
    nights: number;
  };
  budgetEur: number;
  property: {
    city: string;
  };
  catalog?: CatalogItem[]; // default: DEFAULT_CATALOG
};

export type KitComposerOutput = {
  items: KitItem[];
  itemsTotalEur: number;
  cardMessage: string;
  reasoning: string;
  costUsd: number;
  model: string;
};

// ===== TOOL =====

const kitSchema = z.object({
  selectedSkus: z
    .array(z.object({ sku: z.string(), qty: z.number().int().min(1).max(4) }))
    .min(1)
    .max(6),
  cardMessage: z.string().min(20).max(300),
  reasoning: z.string().max(500),
});

const KIT_TOOL: Anthropic.Tool = {
  name: 'emit_kit_selection',
  description: 'Return the selected SKUs and the handwritten card message.',
  input_schema: {
    type: 'object' as const,
    properties: {
      selectedSkus: {
        type: 'array',
        description: 'SKUs chosen from the catalog with quantities.',
        items: {
          type: 'object',
          properties: {
            sku: { type: 'string' },
            qty: { type: 'integer', minimum: 1, maximum: 4 },
          },
          required: ['sku', 'qty'],
        },
        minItems: 1,
        maxItems: 6,
      },
      cardMessage: {
        type: 'string',
        description:
          'Testo del biglietto scritto a mano in italiano (o lingua dell\'ospite se diversa). 2-3 righe, calorose, personalizzate.',
      },
      reasoning: {
        type: 'string',
        description: 'Spiegazione di max 500 caratteri sulle scelte fatte.',
      },
    },
    required: ['selectedSkus', 'cardMessage', 'reasoning'],
  },
};

// ===== SYSTEM PROMPT =====

const SYSTEM_PROMPT = `Sei l'agente Kit Composer di GiftTube.

Dato un Guest DNA e un budget, scegli gli item dal catalogo e scrivi il messaggio del biglietto.

REGOLE DURE

1. La somma (prezzo × quantità) DEVE stare dentro il budget. Non sforare mai.
2. Scegli 2-4 item per il kit tipico. Mai più di 6.
3. Ogni item deve avere una ragione collegata al DNA. Se non c'è collegamento, non metterlo.
4. Se l'ospite ha bambini, almeno un item deve essere family/kids friendly.
5. Se il DNA ha un rischio "noise" alto, includi EAR-PLU-2 (tappi per orecchie).
6. Evita alcol se ci sono bambini come unici altri ospiti (coppie con bambini grandi sono OK).
7. Per stay di 1 notte: kit minimale (2 item). Per stay 5+ notti: kit più generoso.
8. Specialità locali quando possibile (il cesto ha prodotti campani, usali se la struttura è a Napoli).

MESSAGGIO DEL BIGLIETTO

- 2-3 righe, max 300 caratteri
- Lingua: italiano di default, lingua dell'ospite se signals.languagePrimary è specificato
- Tono: adattato a signals.tone (formal_warm, casual_warm, direct, playful)
- Mai troppo zuccheroso. Autenticità napoletana, calore vero.
- Firma generica: "Benvenuti!" o equivalente, NON firmare con nome specifico (lo farà lo studente calligrafo)
- NO emoji nel testo del biglietto scritto a mano

OUTPUT

Chiama SEMPRE \`emit_kit_selection\`. Testo libero vietato.`;

// ===== MAIN =====

export async function composeKit(input: KitComposerInput): Promise<KitComposerOutput> {
  const catalog = input.catalog ?? DEFAULT_CATALOG;
  const userMessage = buildKitPrompt(input, catalog);

  const result = await runClaude({
    model: 'opus',
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
    tools: [KIT_TOOL],
    maxTokens: 1000,
    temperature: 0.5,
  });

  const toolCall = result.toolUses.find((t) => t.name === 'emit_kit_selection');
  if (!toolCall) throw new Error('Kit composer did not emit selection');

  const parsed = kitSchema.parse(toolCall.input);

  // Resolve SKUs against catalog
  const items: KitItem[] = [];
  let itemsTotalEur = 0;
  for (const sel of parsed.selectedSkus) {
    const cat = catalog.find((c) => c.sku === sel.sku);
    if (!cat) throw new Error(`Agent selected unknown SKU: ${sel.sku}`);
    items.push({
      sku: cat.sku,
      name: cat.name,
      category: cat.category,
      priceEur: cat.priceEur,
      qty: sel.qty,
      supplier: cat.supplier,
    });
    itemsTotalEur += cat.priceEur * sel.qty;
  }

  // Enforce budget hard limit as a safety net (prompt should prevent this).
  if (itemsTotalEur > input.budgetEur + 0.01) {
    throw new Error(
      `Kit exceeds budget: ${itemsTotalEur.toFixed(2)} > ${input.budgetEur.toFixed(2)}`,
    );
  }

  return {
    items,
    itemsTotalEur: Math.round(itemsTotalEur * 100) / 100,
    cardMessage: parsed.cardMessage,
    reasoning: parsed.reasoning,
    costUsd: result.costUsd,
    model: result.model,
  };
}

// ===== HELPERS =====

function buildKitPrompt(input: KitComposerInput, catalog: CatalogItem[]): string {
  const { dna, booking, budgetEur, property } = input;

  const catalogLines = catalog.map(
    (c) =>
      `- ${c.sku} | ${c.name} | €${c.priceEur.toFixed(2)} | ${c.category} | [${c.tags.join(', ')}] | ${c.description}`,
  );

  return [
    '# Guest DNA',
    `Archetipo: ${dna.archetype}`,
    `Descrizione: ${dna.archetypeDescription}`,
    `Signals: ${JSON.stringify(dna.signals, null, 2)}`,
    `Risks:`,
    ...dna.risks.map((r) => `- [${r.level}] ${r.code}: ${r.title} → ${r.mitigation}`),
    '',
    '# Contesto prenotazione',
    `Adulti: ${booking.numAdults}, Bambini: ${booking.numChildren}, Notti: ${booking.nights}`,
    `Città: ${property.city}`,
    `Budget: €${budgetEur.toFixed(2)}`,
    '',
    '# Catalogo disponibile',
    ...catalogLines,
    '',
    '# Task',
    'Componi il kit ottimale e scrivi il messaggio del biglietto.',
  ].join('\n');
}
