import Anthropic from '@anthropic-ai/sdk';
import type { KitItem } from '@premura/db';
import { z } from 'zod';
import { ITEMS_TAXONOMY, type TaxonomyKey } from './items-taxonomy';

// ─────────────────────────────────────────────────────────────
// Slice C — Kit generator agent (Sonnet 4.6).
//
// Input: booking + survey responses + property + host + budget target.
// Output: proposta kit con theme + storytelling IT/EN + items[] +
// card_message IT/EN + rationale.
// Cost expected: ~€0.05-0.08 per kit (4K input + 1K output).
// ─────────────────────────────────────────────────────────────

const MODEL = process.env.CLAUDE_MODEL_PRIMARY ?? 'claude-sonnet-4-6';
export const KIT_GENERATOR_VERSION = '2026-05-09-v2';

const TAXONOMY_KEYS = Object.keys(ITEMS_TAXONOMY) as TaxonomyKey[];

const itemSchema = z.object({
  taxonomyKey: z.enum(TAXONOMY_KEYS as [string, ...string[]]),
  specificDescription: z.string().min(2).max(200),
  quantity: z.number().int().min(1).max(20),
  estimatedPriceEur: z.number().min(0).max(100),
  fonte: z.enum(['amazon', 'glovo', 'manual_print', 'manual_write']),
  leadTime: z.enum(['same_day', '1_day', '2_days', '1_hour']),
  amazonSearchHint: z.string().max(200).optional(),
  glovoSearchHint: z.string().max(200).optional(),
  reasoning: z.string().min(2).max(500),
});

const proposalSchema = z.object({
  theme: z.string().min(2).max(200),
  storytelling_it: z.string().min(10).max(800),
  storytelling_en: z.string().min(10).max(800),
  items: z.array(itemSchema).min(1).max(8),
  cardMessage_it: z.string().min(2).max(300),
  cardMessage_en: z.string().min(2).max(300),
  totalEstimatedEur: z.number().min(0).max(200),
  rationale: z.string().min(10).max(800),
});

export type KitGeneratorInput = {
  booking: {
    nights: number;
    numAdults: number;
    numChildren: number;
    guestCountryCode: string | null;
    checkinAt: Date;
    checkoutAt: Date;
    hostPayoutEur: number;
    guestFirstName: string | null;
    guestFullName: string;
    language: 'it' | 'en';
  };
  survey: {
    specialOccasion?: string;
    foodAllergies?: string;
    preferences?: string;
    raw: Record<string, string | string[]>;
  };
  property: { name: string; city: string };
  host: { fullName: string | null };
  budgetTargetEur: number;
};

export type KitGeneratorOutput = {
  theme: string;
  storytellingIt: string;
  storytellingEn: string;
  items: KitItem[];
  cardMessageIt: string;
  cardMessageEn: string;
  totalEstimatedEur: number;
  rationale: string;
  withinBudget: boolean;
  costUsd: number;
  agentVersion: string;
};

const SYSTEM_PROMPT = `Sei il Kit Composer di Premura, agente AI per host hospitality italiani.

Devi generare una proposta omaggio personalizzato per un guest in arrivo a una struttura napoletana. L'omaggio sara' allestito in casa al check-in dal cleaner: foto inviata al guest la mattina come "wow moment".

VINCOLI ECONOMICI (CRITICI):
- Budget target: {budgetTargetEur}€ — l'estimated total degli item NON deve eccedere questo numero.
- Premura ZERO markup: prezzo guest = costo + €3.75 fees fissi (service + cleaner + biglietto).
- Item devono giustificare il costo. Quality > quantity.

VINCOLI OPERATIVI:
- Founder Andrea ordina manualmente: Amazon Business (2-3gg lead) + Glovo same-day + manuale.
- Mix consigliato: 1-2 fresh Glovo (icona giorno check-in) + 1-2 packaged Amazon (dura nei giorni) + 1 manual personale (biglietto / mappa) = 3-5 item totali.
- Preferenza prodotti napoletani autentici (pilot in Napoli).

VINCOLI TASSONOMIA:
- Usa SOLO taxonomyKey nella lista ammessa (vedi {taxonomyKeys}).
- specificDescription deve essere concreto: nome marca + formato + quantita' (es. "Falanghina Feudi San Gregorio 750ml x1", non "vino").
- amazonSearchHint per item Amazon: keyword breve da incollare nella search bar Amazon.
- glovoSearchHint per item Glovo: keyword + zona consegna.

ADAPTIVE LOGIC:
- Survey "occasion=anniversary" -> aggiungi vino o cioccolato premium, biglietto piu' personale.
- "occasion=birthday" -> mini dolce festivo (cup cake, cannolo decorato).
- "occasion=honeymoon" -> fiori + vino + biglietto romantico.
- "occasion=family" + numChildren > 0 -> aggiungi prodotto kids, biscotti bambini.
- "occasion=business" -> kit minimal, no fiori, focus caffe' + acqua + cioccolato.
- "allergies" valorizzato -> ESCLUDI categorie incompatibili (gluten -> no biscotti glutine, lactose -> no cioccolato latte, vegan -> tutto plant-based).
- "preferences" valorizzato -> 1 item che matcha (coffee -> caffe' premium, tea -> te', sweet -> dolce, savory -> taralli/friselle).
- numAdults coppia 2 + nights >=3 -> consigliato 4-5 item (kit medio).
- 1 adulto solo + nights 1-2 -> 3 item minimi, no fiori.
- Famiglia 3+ -> dose item per coppia + 1 item kids.

LINGUA:
- storytelling_it / cardMessage_it sempre in italiano caldo.
- storytelling_en / cardMessage_en sempre in inglese (traduci concetti, no parole).

TONO STORYTELLING:
- Caldo, italiano-mediterraneo (anche in inglese), umano. NO marketing-speak.
  NO "experience" / "journey" / "amazing" / "unforgettable" inflate.
- Pensa: come scriverebbe il padrone di casa che ha aperto la propria casa
  a uno sconosciuto e vuole farlo sentire benvenuto.
- Storytelling 2-3 frasi MAX, niente paragrafi. Niente CTA, niente firma.

CARD MESSAGE (vincoli stretti):
- Massimo 15 parole TOTALI (non caratteri, parole).
- Sempre firmato con "— {hostFullName}" (em-dash + nome host).
- NIENTE emoji, niente icone, niente caratteri speciali.
- Includi nome guest se conosciuto (firstName).
- Italiano + inglese paralleli, stesso registro.
- Esempi accettabili:
  IT: "Lena, benvenuta a La Goccia. Buon soggiorno a Napoli. — Andrea"
  EN: "Mark, welcome. Enjoy your stay in Naples. — Andrea"
- Esempi RIFIUTATI (NON fare cosi'):
  ❌ "Lena, hope you have an amazing experience in Naples..." (marketing)
  ❌ "Welcome to your Naples adventure! 🌟" (emoji + marketing)
  ❌ "We are so happy to host you for your unforgettable journey..." (inflate)

CONTEXT GUEST:
{context}

OUTPUT: emit_kit_proposal con theme + storytelling IT/EN + items[] (1-8) + cardMessage IT/EN + totalEstimatedEur + rationale.`;

export async function generateKitProposal(input: KitGeneratorInput): Promise<KitGeneratorOutput> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');
  const client = new Anthropic({ apiKey });

  const ctxStr = JSON.stringify(input, null, 2);
  const taxonomyKeysStr = TAXONOMY_KEYS.join(', ');
  const systemPrompt = SYSTEM_PROMPT.replace('{context}', ctxStr)
    .replace('{taxonomyKeys}', taxonomyKeysStr)
    .replace('{budgetTargetEur}', input.budgetTargetEur.toFixed(2));

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1500,
    system: [
      {
        type: 'text',
        text: systemPrompt,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      { role: 'user', content: 'Genera la proposta kit per questo guest.' },
    ],
    tools: [
      {
        name: 'emit_kit_proposal',
        description:
          'Emette la proposta kit completa con theme + storytelling IT/EN + items + cardMessage IT/EN + totalEstimatedEur + rationale.',
        input_schema: {
          type: 'object',
          properties: {
            theme: { type: 'string' },
            storytelling_it: { type: 'string' },
            storytelling_en: { type: 'string' },
            items: {
              type: 'array',
              minItems: 1,
              maxItems: 8,
              items: {
                type: 'object',
                properties: {
                  taxonomyKey: { type: 'string' },
                  specificDescription: { type: 'string' },
                  quantity: { type: 'number' },
                  estimatedPriceEur: { type: 'number' },
                  fonte: {
                    type: 'string',
                    enum: ['amazon', 'glovo', 'manual_print', 'manual_write'],
                  },
                  leadTime: {
                    type: 'string',
                    enum: ['same_day', '1_day', '2_days', '1_hour'],
                  },
                  amazonSearchHint: { type: 'string' },
                  glovoSearchHint: { type: 'string' },
                  reasoning: { type: 'string' },
                },
                required: [
                  'taxonomyKey',
                  'specificDescription',
                  'quantity',
                  'estimatedPriceEur',
                  'fonte',
                  'leadTime',
                  'reasoning',
                ],
              },
            },
            cardMessage_it: { type: 'string' },
            cardMessage_en: { type: 'string' },
            totalEstimatedEur: { type: 'number' },
            rationale: { type: 'string' },
          },
          required: [
            'theme',
            'storytelling_it',
            'storytelling_en',
            'items',
            'cardMessage_it',
            'cardMessage_en',
            'totalEstimatedEur',
            'rationale',
          ],
        },
      },
    ],
    tool_choice: { type: 'tool', name: 'emit_kit_proposal' },
  });

  const toolUse = response.content.find((c) => c.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new Error('kit-generator: no tool_use in response');
  }
  const parsed = proposalSchema.parse(toolUse.input);

  // Sonnet 4.6 cost: input 3 USD/Mtok, output 15 USD/Mtok. Cache read 0.3 USD/Mtok.
  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;
  const cacheReadTokens = response.usage.cache_read_input_tokens ?? 0;
  const cacheWriteTokens = response.usage.cache_creation_input_tokens ?? 0;
  const costUsd =
    (inputTokens * 3) / 1_000_000 +
    (outputTokens * 15) / 1_000_000 +
    (cacheWriteTokens * 3.75) / 1_000_000 +
    (cacheReadTokens * 0.3) / 1_000_000;

  const items: KitItem[] = parsed.items.map((it) => ({
    taxonomyKey: it.taxonomyKey,
    specificDescription: it.specificDescription,
    quantity: it.quantity,
    estimatedPriceEur: it.estimatedPriceEur,
    fonte: it.fonte,
    leadTime: it.leadTime,
    amazonSearchHint: it.amazonSearchHint,
    glovoSearchHint: it.glovoSearchHint,
    reasoning: it.reasoning,
    executedAt: null,
  }));

  return {
    theme: parsed.theme,
    storytellingIt: parsed.storytelling_it,
    storytellingEn: parsed.storytelling_en,
    items,
    cardMessageIt: parsed.cardMessage_it,
    cardMessageEn: parsed.cardMessage_en,
    totalEstimatedEur: parsed.totalEstimatedEur,
    rationale: parsed.rationale,
    withinBudget: parsed.totalEstimatedEur <= input.budgetTargetEur,
    costUsd: Math.round(costUsd * 1_000_000) / 1_000_000,
    agentVersion: KIT_GENERATOR_VERSION,
  };
}
