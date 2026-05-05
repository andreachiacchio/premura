import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

// ─────────────────────────────────────────────────────────────
// Slice 8.1 — Guest DNA extractor da messaggi inbound (Pipeline 2).
//
// Estrae feature comunicative da un singolo messaggio ospite + ultimi
// 5 messaggi del thread come contesto. Output JSON strutturato
// validato Zod, accumulato incrementalmente sul guest_profile.
//
// Modello: Claude Sonnet 4.6 (lo stesso usato per parser email).
// Cost stimato: ~€0.001/message (input ~500 token, output ~150 token).
//
// Vocabolario topics chiuso (20 valori): standardizzato per query
// dashboard. Aggiunge "other" per casi non classificabili.
// ─────────────────────────────────────────────────────────────

export const MESSAGE_TOPICS = [
  'keybox',
  'check_in',
  'check_out',
  'late_check_in',
  'early_check_in',
  'parking',
  'wifi',
  'breakfast',
  'restaurant',
  'transport',
  'noise',
  'cleaning',
  'amenities',
  'temperature',
  'electricity',
  'water',
  'recommendation',
  'complaint',
  'small_talk',
  'other',
] as const;

export type MessageTopic = (typeof MESSAGE_TOPICS)[number];

export class DnaExtractorError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'DnaExtractorError';
  }
}

const insightSchema = z.object({
  preferred_language: z.string().min(2).max(8).describe('ISO 639-1 della lingua del messaggio'),
  communication_style_score: z.number().int().min(1).max(5).describe('1=formale, 5=casual'),
  communication_style_label: z.enum(['formal', 'casual', 'mixed']),
  topics_mentioned: z
    .array(z.enum(MESSAGE_TOPICS))
    .max(10)
    .describe('Topics nel messaggio (max 10), unique, vocabolario chiuso'),
  urgency_signals: z.boolean(),
  sentiment: z.number().min(-1).max(1).describe('Sentiment del messaggio [-1, 1]'),
});

export type SingleMessageInsight = z.infer<typeof insightSchema>;

const TOOL_INPUT_SCHEMA = {
  type: 'object' as const,
  properties: {
    preferred_language: {
      type: 'string',
      description: 'ISO 639-1 della lingua del messaggio (en, it, fr, es, de).',
    },
    communication_style_score: {
      type: 'integer',
      minimum: 1,
      maximum: 5,
      description:
        '1 = molto formale (Lei, voi, no contrazioni), 5 = molto casual (tu, slang, abbreviazioni).',
    },
    communication_style_label: {
      type: 'string',
      enum: ['formal', 'casual', 'mixed'],
    },
    topics_mentioned: {
      type: 'array',
      items: { type: 'string', enum: MESSAGE_TOPICS as unknown as string[] },
      maxItems: 10,
      description:
        'Lista topics presenti nel messaggio. Vocabolario CHIUSO. Se non identificabile, usare "other". Unique.',
    },
    urgency_signals: {
      type: 'boolean',
      description:
        'true se il messaggio contiene segnali di urgenza ("urgente", "subito", "non funziona", "aiuto", "adesso").',
    },
    sentiment: {
      type: 'number',
      minimum: -1,
      maximum: 1,
      description:
        'Sentiment del messaggio: -1 molto negativo (lamentela seria), 0 neutro/informativo, +1 molto positivo (entusiasmo, ringraziamento).',
    },
  },
  required: [
    'preferred_language',
    'communication_style_score',
    'communication_style_label',
    'topics_mentioned',
    'urgency_signals',
    'sentiment',
  ],
  additionalProperties: false,
};

const SYSTEM_PROMPT = `Sei un analizzatore di messaggi ospite per un host di affitti brevi.

Analizzi UN messaggio inbound (dell'ospite verso l'host) e ne estrai feature strutturate. Hai accesso anche agli ultimi 5 messaggi del thread come contesto, ma il focus dell'analisi e' SOLO il messaggio target.

DEVI sempre chiamare il tool "extract_message_insights" con i campi del JSON schema. Mai rispondere in prosa.

# Linee guida

- preferred_language: ISO 639-1 della lingua dominante del messaggio. Se misto, scegli la prevalente.
- communication_style_score: scala 1-5.
  1 = molto formale: "Lei", "voi", forme di cortesia complete, no abbreviazioni.
  3 = neutro: cordiale ma diretto.
  5 = molto casual: "tu", emoji, slang, abbreviazioni ("xche", "ke").
- communication_style_label: 'formal' (1-2), 'mixed' (3), 'casual' (4-5).
- topics_mentioned: scegli SOLO dal vocabolario chiuso (vedi enum). Se nessun topic specifico riconoscibile, ['other']. Massimo 10 unique.
- urgency_signals: true se "urgente", "subito", "non funziona", "aiuto", "adesso", "non riesco", "emergenza", "rotto", o tono di stress evidente.
- sentiment: numero in [-1, 1].
  -1 = lamentela seria, problema grosso, frustrazione.
  -0.5 = preoccupato, infastidito.
  0 = neutro/informativo (es. "a che ora il check-in?").
  +0.5 = positivo, soddisfatto.
  +1 = entusiasta, ringrazia, complimenti.

# Cosa NON fare

- Non inventare topics fuori dal vocabolario chiuso.
- Non confondere urgenza con messaggio negativo: un ospite puo' essere urgente ma cordiale ("scusa il disturbo, mi e' caduta la chiave!").
- Non normalizzare la lingua: se l'ospite scrive in inglese, preferred_language='en' anche se i messaggi precedenti erano in italiano.`;

export type ExtractDnaInput = {
  // Il messaggio da analizzare.
  body: string;
  // Ultimi 5 messaggi (in ordine cronologico crescente, INCLUSO il
  // messaggio target come ultimo elemento). Usato come context.
  context?: string[];
};

export async function extractMessageInsights(
  input: ExtractDnaInput,
  options: { client?: Anthropic; model?: string } = {},
): Promise<SingleMessageInsight> {
  const client = options.client ?? new Anthropic();
  const model = options.model ?? process.env.CLAUDE_MODEL_EMAIL_PARSER ?? 'claude-sonnet-4-6';

  const contextLines =
    input.context && input.context.length > 0
      ? input.context.map((c, i) => `[${i + 1}] ${c.slice(0, 1000)}`).join('\n')
      : '(nessun contesto precedente)';

  const userContent = [
    'CONTESTO ULTIMI MESSAGGI:',
    contextLines,
    '',
    'MESSAGGIO DA ANALIZZARE (ultimo del thread):',
    input.body.slice(0, 4000),
  ].join('\n');

  let response: Awaited<ReturnType<typeof client.messages.create>>;
  try {
    response = await client.messages.create({
      model,
      max_tokens: 512,
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      tools: [
        {
          name: 'extract_message_insights',
          description: 'Estrai feature comunicative dal messaggio ospite',
          input_schema: TOOL_INPUT_SCHEMA,
        },
      ],
      tool_choice: { type: 'tool', name: 'extract_message_insights' },
      messages: [{ role: 'user', content: userContent }],
    });
  } catch (err) {
    throw new DnaExtractorError('Anthropic API call failed', err);
  }

  const toolUse = response.content.find((c) => c.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new DnaExtractorError('Claude did not produce a tool_use response');
  }

  const parsed = insightSchema.safeParse(toolUse.input);
  if (!parsed.success) {
    throw new DnaExtractorError(
      `Tool input validation failed: ${parsed.error.message}`,
      toolUse.input,
    );
  }

  // De-dup topics (Zod non lo fa, schema ha .max ma non .unique).
  const uniqueTopics = Array.from(new Set(parsed.data.topics_mentioned));
  return { ...parsed.data, topics_mentioned: uniqueTopics };
}

// Skip extraction se body e' troppo corto. Booking signal-only spesso
// e' un placeholder tipo "[Booking message — apri Extranet]" con piu' di
// 10 char ma niente content reale: filtro anche per quel pattern.
export function shouldSkipExtraction(body: string): boolean {
  const trimmed = body.trim();
  if (trimmed.length < 10) return true;
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) return true;
  return false;
}
