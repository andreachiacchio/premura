import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

// ─────────────────────────────────────────────────────────────
// Slice 8.4 — Host voice profiler.
//
// Estrae feature stilistiche da una sliding window di N messaggi
// outbound dell'host. Output JSON strutturato Zod-validated.
// Modello: Claude Sonnet 4.6. Cost stimato: ~€0.005 per analisi
// (20 messaggi medi -> ~3000 input + ~400 output token).
//
// Principio: l'host non fa NIENTE. Tutto il profilo si auto-alimenta
// in background dai messaggi che gia' fluiscono.
// ─────────────────────────────────────────────────────────────

export class VoiceProfilerError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'VoiceProfilerError';
  }
}

const phraseSchema = z.object({
  phrase: z.string().min(2).max(80),
  count: z.number().int().min(1),
});

const analysisSchema = z.object({
  avg_sentence_length: z
    .number()
    .min(0)
    .max(200)
    .describe('Parole medie per frase (non per messaggio).'),
  formality_score: z
    .number()
    .min(1)
    .max(5)
    .describe('1=molto formale (Lei), 5=molto casual (tu, slang).'),
  emoji_usage_rate: z
    .number()
    .min(0)
    .max(1)
    .describe('Frazione di messaggi che contengono almeno una emoji.'),
  common_phrases: z
    .array(phraseSchema)
    .max(20)
    .describe('Top 20 frasi/espressioni ricorrenti con count.'),
  greeting_patterns: z
    .array(z.string().min(1).max(80))
    .max(8)
    .describe('Aperture tipiche dei messaggi (es. "Ciao!", "Buongiorno,").'),
  closing_patterns: z
    .array(z.string().min(1).max(120))
    .max(8)
    .describe('Chiusure tipiche (es. "— Andrea", "Buona giornata!").'),
  language_distribution: z
    .record(z.number().int().min(0))
    .describe('ISO 639-1 -> count messaggi nella lingua.'),
});

export type VoiceAnalysis = z.infer<typeof analysisSchema>;

const TOOL_INPUT_SCHEMA = {
  type: 'object' as const,
  properties: {
    avg_sentence_length: {
      type: 'number',
      minimum: 0,
      maximum: 200,
      description: 'Parole medie per frase (non per messaggio). Tokenizza per spazi.',
    },
    formality_score: {
      type: 'number',
      minimum: 1,
      maximum: 5,
      description:
        '1=molto formale (Lei, voi, no contrazioni), 5=molto casual (tu, slang, abbreviazioni).',
    },
    emoji_usage_rate: {
      type: 'number',
      minimum: 0,
      maximum: 1,
      description: 'Frazione [0-1] di messaggi che contengono almeno una emoji.',
    },
    common_phrases: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          phrase: { type: 'string', minLength: 2, maxLength: 80 },
          count: { type: 'integer', minimum: 1 },
        },
        required: ['phrase', 'count'],
        additionalProperties: false,
      },
      maxItems: 20,
      description:
        'Top 20 frasi/espressioni ricorrenti con count. Frase deve essere distintiva (NO "ciao" generico). Esempi: "fammi sapere", "a presto", "qualunque cosa scrivi".',
    },
    greeting_patterns: {
      type: 'array',
      items: { type: 'string', minLength: 1, maxLength: 80 },
      maxItems: 8,
      description: 'Aperture tipiche dei messaggi (es. ["Ciao!", "Buongiorno,", "Hey"]).',
    },
    closing_patterns: {
      type: 'array',
      items: { type: 'string', minLength: 1, maxLength: 120 },
      maxItems: 8,
      description: 'Chiusure tipiche (es. ["— Andrea", "Buona giornata!", "A presto, La Goccia"]).',
    },
    language_distribution: {
      type: 'object',
      additionalProperties: { type: 'integer', minimum: 0 },
      description: 'ISO 639-1 -> count messaggi nella lingua. Es. {"it": 18, "en": 2}.',
    },
  },
  required: [
    'avg_sentence_length',
    'formality_score',
    'emoji_usage_rate',
    'common_phrases',
    'greeting_patterns',
    'closing_patterns',
    'language_distribution',
  ],
  additionalProperties: false,
};

const SYSTEM_PROMPT = `Sei un analizzatore di stile linguistico per host di affitti brevi italiani.

Ricevi N messaggi outbound che l'host ha mandato a ospiti diversi. Estrai feature stilistiche aggregate.

DEVI sempre chiamare il tool "extract_voice_profile" con i campi del JSON schema. Mai rispondere in prosa.

# Linee guida

- avg_sentence_length: media parole per frase. Tokenizza per spazi. Se messaggio multi-frase, considera ogni frase.
- formality_score:
  1 = molto formale ("Lei", "voi", "Egregio", forme cortesia complete, no contrazioni).
  2 = formale ma cordiale.
  3 = neutro/cordiale standard.
  4 = casual ("tu", emoji occasionali, contrazioni).
  5 = molto casual (slang, abbreviazioni, emoji frequenti).
- emoji_usage_rate: frazione [0-1] di messaggi che contengono almeno una emoji. Se 18 su 20 hanno emoji -> 0.9.
- common_phrases: top 20 frasi DISTINTIVE ricorrenti con count. NO frasi generiche ("ciao", "grazie"). SI frasi caratteristiche di QUESTO host: "fammi sapere", "qualunque cosa", "a presto", "buona vacanza", "siamo qui".
- greeting_patterns: aperture tipiche distinte. Max 8.
- closing_patterns: chiusure tipiche distinte (firma + saluto). Max 8.
- language_distribution: count per lingua ISO 639-1. Esempio: {"it": 18, "en": 2}.

# Cosa NON fare

- Non inventare frasi non presenti nei messaggi reali.
- Non normalizzare lo stile: se l'host scrive "ke" invece di "che", lasciare come e'.
- Non confondere apertura con prima frase: greeting_patterns sono saluti veri ("Ciao!", "Buongiorno"), NON il primo paragrafo.
- Non includere il nome dell'ospite nei common_phrases (privacy).`;

export type ExtractVoiceInput = {
  messages: string[];
};

export async function extractVoiceProfile(
  input: ExtractVoiceInput,
  options: { client?: Anthropic; model?: string } = {},
): Promise<VoiceAnalysis> {
  if (input.messages.length === 0) {
    throw new VoiceProfilerError('No messages provided');
  }

  const client = options.client ?? new Anthropic();
  const model = options.model ?? process.env.CLAUDE_MODEL_EMAIL_PARSER ?? 'claude-sonnet-4-6';

  // Trim per cap costo: max 30 messaggi, max 400 char ognuno.
  const truncated = input.messages.slice(0, 30).map((m) => m.slice(0, 400));
  const userContent = [
    `MESSAGGI OUTBOUND DELL'HOST (${truncated.length}):`,
    '',
    ...truncated.map((m, i) => `[${i + 1}] ${m}`),
  ].join('\n');

  let response: Awaited<ReturnType<typeof client.messages.create>>;
  try {
    response = await client.messages.create({
      model,
      max_tokens: 1024,
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      tools: [
        {
          name: 'extract_voice_profile',
          description: "Estrai feature stilistiche dai messaggi outbound dell'host",
          input_schema: TOOL_INPUT_SCHEMA,
        },
      ],
      tool_choice: { type: 'tool', name: 'extract_voice_profile' },
      messages: [{ role: 'user', content: userContent }],
    });
  } catch (err) {
    throw new VoiceProfilerError('Anthropic API call failed', err);
  }

  const toolUse = response.content.find((c) => c.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new VoiceProfilerError('Claude did not produce a tool_use response');
  }

  const parsed = analysisSchema.safeParse(toolUse.input);
  if (!parsed.success) {
    throw new VoiceProfilerError(
      `Tool input validation failed: ${parsed.error.message}`,
      toolUse.input,
    );
  }
  return parsed.data;
}

// Skip extraction se messaggio body troppo corto. Stessi criteri di
// dna-extractor (signal-only / placeholder / < 10 char).
export function shouldSkipVoiceUpdate(body: string): boolean {
  const trimmed = body.trim();
  if (trimmed.length < 10) return true;
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) return true;
  return false;
}
