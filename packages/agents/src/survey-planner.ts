import Anthropic from '@anthropic-ai/sdk';
import type { QuestionPlan } from '@premura/db';
import { z } from 'zod';

// ─────────────────────────────────────────────────────────────
// Slice B — Survey planner agent (adaptive questions).
//
// Input: context booking + property + host. Output: array di 2-4
// QuestionPlan adapted to context. Sonnet 4.6 con tool_use forzato.
//
// Logica adaptive (ground rules nel system prompt):
//  - 2 questions per soggiorni 1-2 notti
//  - 3 questions per soggiorni 3-5 notti
//  - 4 questions per soggiorni 6+ notti
//  - Skip "morning preference" se 1 notte
//  - Skip "occasion" se booking.guestNote suggerisce gia' (anniversary, etc)
//  - Aggiungi "interests" per soggiorni 6+
//  - Famiglia (children > 0): include "kids ages"
//  - Business solo: skip allergies, aggiungi "early checkout"
// ─────────────────────────────────────────────────────────────

const MODEL = process.env.CLAUDE_MODEL_PRIMARY ?? 'claude-sonnet-4-6';

const optionSchema = z.object({
  value: z.string().min(1).max(40),
  emoji: z.string().min(1).max(8),
  label_it: z.string().min(1).max(60),
  label_en: z.string().min(1).max(60),
  allow_text: z.boolean().optional(),
});

const questionSchema = z.object({
  id: z.string().min(1).max(40),
  prompt_it: z.string().min(1).max(140),
  prompt_en: z.string().min(1).max(140),
  type: z.enum(['single_choice', 'multi_choice']),
  required: z.boolean(),
  options: z.array(optionSchema).min(2).max(8),
});

const planSchema = z.object({
  questions: z.array(questionSchema).min(2).max(4),
});

export type SurveyPlannerContext = {
  booking: {
    id: string;
    guestFirstName: string | null;
    guestFullName: string;
    guestCountryCode: string | null;
    guestLanguage: string | null;
    numAdults: number;
    numChildren: number;
    nights: number;
    guestMessageOriginal: string | null;
  };
  property: {
    name: string;
    city: string;
  };
  host: {
    fullName: string | null;
  };
};

const SYSTEM_PROMPT = `Sei il survey-planner di Premura: progetti la survey pre-arrivo (3-4 domande tap-based) per un guest in arrivo a una struttura hospitality italiana.

OUTPUT: array di 2-4 domande in formato QuestionPlan, ognuna con prompt_it + prompt_en + 4-7 options con emoji + label IT/EN.

REGOLE NUMERO DOMANDE:
- 1-2 notti soggiorno: 2 domande
- 3-5 notti: 3 domande
- 6+ notti: 4 domande

DOMANDE BASE (sempre considerare):
1. occasion — "E' un'occasione speciale?" (single_choice)
   options: travel, anniversary, birthday, honeymoon, family, business
2. allergies — "Allergie alimentari?" (multi_choice)
   options: none, gluten, lactose, nuts, vegan, other (allow_text)
3. morning — "Cosa preferisci la mattina?" (single_choice)
   options: coffee, tea, sweet, savory, surprise

DOMANDA OPZIONALE PER SOGGIORNI 6+:
4. interests — "Cosa ti interessa di piu'?" (multi_choice, max 2 selezioni)
   options: food, culture, relax, adventure, nightlife

REGOLE ADAPTIVE:
- Se nights == 1: SKIP morning preference (irrilevante per 1 notte).
- Se booking.guestMessage menziona "anniversario", "luna di miele", "compleanno", "honeymoon", "anniversary", "birthday": SKIP occasion (gia' noto).
- Se numChildren > 0: aggiungi domanda "kids_ages" come 3a (multi_choice: under_2, 2_to_6, 7_to_12, 13_to_17).
- Se solo 1 adulto + 0 children + soggiorno 1-3 notti + non e' occasione speciale (guestMessage neutro) → probabilmente business: SKIP allergies, aggiungi "early_checkout" (single_choice: yes_morning, yes_afternoon, no, flexible).

OUTPUT LANGUAGE: emetti il plan completo in tool_use. Lingua del prompt e' sempre IT/EN paralleli — il frontend sceglie quale mostrare. Tone: caldo, professionale, hospitality. Niente formalita' eccessiva.

CONTEXT:
{context}

Genera il QuestionPlan ottimale.`;

export type SurveyPlanResult = {
  questions: QuestionPlan[];
};

export async function planSurvey(input: SurveyPlannerContext): Promise<SurveyPlanResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }
  const client = new Anthropic({ apiKey });

  const ctxStr = JSON.stringify(input, null, 2);
  const systemPrompt = SYSTEM_PROMPT.replace('{context}', ctxStr);

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
    messages: [{ role: 'user', content: 'Genera il QuestionPlan per questo guest.' }],
    tools: [
      {
        name: 'emit_survey_plan',
        description: 'Emette il piano di 2-4 domande adaptive per il guest.',
        input_schema: {
          type: 'object',
          properties: {
            questions: {
              type: 'array',
              minItems: 2,
              maxItems: 4,
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  prompt_it: { type: 'string' },
                  prompt_en: { type: 'string' },
                  type: { type: 'string', enum: ['single_choice', 'multi_choice'] },
                  required: { type: 'boolean' },
                  options: {
                    type: 'array',
                    minItems: 2,
                    maxItems: 8,
                    items: {
                      type: 'object',
                      properties: {
                        value: { type: 'string' },
                        emoji: { type: 'string' },
                        label_it: { type: 'string' },
                        label_en: { type: 'string' },
                        allow_text: { type: 'boolean' },
                      },
                      required: ['value', 'emoji', 'label_it', 'label_en'],
                    },
                  },
                },
                required: ['id', 'prompt_it', 'prompt_en', 'type', 'required', 'options'],
              },
            },
          },
          required: ['questions'],
        },
      },
    ],
    tool_choice: { type: 'tool', name: 'emit_survey_plan' },
  });

  const toolUse = response.content.find((c) => c.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new Error('survey-planner: no tool_use in response');
  }
  const parsed = planSchema.parse(toolUse.input);
  return { questions: parsed.questions };
}

// Fallback deterministico: usato se Sonnet fallisce o per testing.
// Risponde alle regole base senza adaptive smarts.
export function fallbackPlan(input: SurveyPlannerContext): SurveyPlanResult {
  const nights = input.booking.nights;
  const numQuestions = nights >= 6 ? 4 : nights >= 3 ? 3 : 2;
  const all: QuestionPlan[] = [
    {
      id: 'occasion',
      prompt_it: "E' un'occasione speciale?",
      prompt_en: 'Special occasion?',
      type: 'single_choice',
      required: true,
      options: [
        { value: 'travel', emoji: '✈️', label_it: 'Solo viaggio', label_en: 'Just travel' },
        { value: 'anniversary', emoji: '💕', label_it: 'Anniversario', label_en: 'Anniversary' },
        { value: 'birthday', emoji: '🎂', label_it: 'Compleanno', label_en: 'Birthday' },
        { value: 'honeymoon', emoji: '💍', label_it: 'Luna di miele', label_en: 'Honeymoon' },
        { value: 'family', emoji: '👨‍👩‍👧', label_it: 'Famiglia', label_en: 'Family time' },
        { value: 'business', emoji: '💼', label_it: 'Lavoro', label_en: 'Business' },
      ],
    },
    {
      id: 'allergies',
      prompt_it: 'Allergie alimentari?',
      prompt_en: 'Food allergies?',
      type: 'multi_choice',
      required: true,
      options: [
        { value: 'none', emoji: '✅', label_it: 'Nessuna', label_en: 'None' },
        { value: 'gluten', emoji: '🌾', label_it: 'Glutine', label_en: 'Gluten' },
        { value: 'lactose', emoji: '🥛', label_it: 'Lattosio', label_en: 'Lactose' },
        { value: 'nuts', emoji: '🥜', label_it: 'Frutta secca', label_en: 'Nuts' },
        { value: 'vegan', emoji: '🌱', label_it: 'Vegano', label_en: 'Vegan' },
        {
          value: 'other',
          emoji: '✏️',
          label_it: 'Altro (scrivi)',
          label_en: 'Other (type)',
          allow_text: true,
        },
      ],
    },
    {
      id: 'morning',
      prompt_it: 'Cosa preferisci la mattina?',
      prompt_en: 'Morning preference?',
      type: 'single_choice',
      required: false,
      options: [
        { value: 'coffee', emoji: '☕', label_it: 'Caffè', label_en: 'Coffee' },
        { value: 'tea', emoji: '🍵', label_it: 'Tè', label_en: 'Tea' },
        { value: 'sweet', emoji: '🥐', label_it: 'Dolce', label_en: 'Sweet pastry' },
        { value: 'savory', emoji: '🍳', label_it: 'Salato', label_en: 'Savory' },
        { value: 'surprise', emoji: '🎁', label_it: 'Sorprendetemi', label_en: 'Surprise me' },
      ],
    },
    {
      id: 'interests',
      prompt_it: 'Cosa ti interessa di piu?',
      prompt_en: 'What interests you most?',
      type: 'multi_choice',
      required: false,
      options: [
        { value: 'food', emoji: '🍝', label_it: 'Cibo', label_en: 'Food' },
        { value: 'culture', emoji: '🏛️', label_it: 'Cultura', label_en: 'Culture' },
        { value: 'relax', emoji: '🌅', label_it: 'Relax', label_en: 'Relax' },
        { value: 'adventure', emoji: '🥾', label_it: 'Avventura', label_en: 'Adventure' },
        { value: 'nightlife', emoji: '🎶', label_it: 'Vita notturna', label_en: 'Nightlife' },
      ],
    },
  ];
  return { questions: all.slice(0, numQuestions) };
}
