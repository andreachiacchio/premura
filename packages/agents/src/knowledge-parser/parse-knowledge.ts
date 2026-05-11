import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

// Slice G — AI parser knowledge property.
//
// Input: testo libero (manuale ospiti, email guest, qualsiasi cosa).
// Output: PropertyKnowledgePatch parziale (solo quello che si estrae).
//
// Model: claude-haiku-4-5-20251001 (estrazione strutturata, non creativa).
// Cost expected: ~€0.005 per parse (~3K input, ~600 output tokens).
// Cache control ephemeral su system prompt.

const MODEL = process.env.CLAUDE_MODEL_FAST ?? 'claude-haiku-4-5-20251001';
export const KNOWLEDGE_PARSER_VERSION = '2026-05-09-v1';

// Schema output del tool — tutti campi opzionali, l'agente emette
// solo quello che riesce a estrarre con confidenza.
const localTipSchema = z.object({
  category: z.enum([
    'pasticceria',
    'ristorante',
    'bar',
    'panorama',
    'shopping',
    'farmacia',
    'altro',
  ]),
  name: z.string().min(1).max(100),
  description: z.string().max(280).optional(),
  address: z.string().max(200).optional(),
  distanceMin: z.number().int().min(0).max(120).optional(),
});

const parsedSchema = z.object({
  wifi_ssid: z.string().min(1).max(80).optional(),
  wifi_password: z.string().min(1).max(80).optional(),
  wifi_notes: z.string().max(280).optional(),
  keybox_code: z.string().min(1).max(40).optional(),
  keybox_instructions: z.string().max(1000).optional(),
  parking_available: z.boolean().optional(),
  parking_type: z.enum(['street', 'garage', 'private', 'paid', 'none']).optional(),
  parking_instructions: z.string().max(500).optional(),
  check_in_instructions: z.string().max(2000).optional(),
  check_out_instructions: z.string().max(2000).optional(),
  emergency_contacts: z
    .array(
      z.object({
        name: z.string().min(1).max(100),
        phone: z.string().min(3).max(40),
        role: z.string().min(1).max(80),
      }),
    )
    .max(10)
    .optional(),
  local_tips: z.array(localTipSchema).max(20).optional(),
  language_default: z.enum(['it', 'en']).optional(),
  additional_info: z.string().max(1000).optional(),
});

export type KnowledgeParserOutput = {
  parsed: {
    wifi?: { ssid?: string; password?: string; notes?: string };
    keybox?: { code?: string; instructions?: string };
    parking?: {
      available?: boolean;
      type?: 'street' | 'garage' | 'private' | 'paid' | 'none';
      instructions?: string;
    };
    checkInInstructions?: string;
    checkOutInstructions?: string;
    emergencyContacts?: Array<{ name: string; phone: string; role: string }>;
    localTipsCuratedHost?: Array<{
      category:
        | 'pasticceria'
        | 'ristorante'
        | 'bar'
        | 'panorama'
        | 'shopping'
        | 'farmacia'
        | 'altro';
      name: string;
      description?: string;
      address?: string;
      distanceMin?: number;
    }>;
    languageDefault?: 'it' | 'en';
    additionalInfo?: string;
  };
  costUsd: number;
  agentVersion: string;
};

const SYSTEM_PROMPT = `Sei l'assistente di Premura specializzato in estrazione strutturata di conoscenza property da testo libero.

L'utente (host di una struttura ricettiva) ti incolla testo non strutturato:
- Manuale ospiti esistente
- Email che invia ai guest pre-arrival
- Note libere su check-in / wifi / posti vicini
- Qualsiasi documento utile

Tuo compito: ESTRARRE i campi strutturati ammessi. NON inventare. NON dedurre. Se un campo non è chiaramente espresso nel testo, NON emetterlo (l'output è parziale per design).

CAMPI ammessi (vedi tool emit_knowledge_extraction):
- wifi_ssid, wifi_password, wifi_notes
- keybox_code, keybox_instructions
- parking_available (bool), parking_type, parking_instructions
- check_in_instructions, check_out_instructions
- emergency_contacts: [{name, phone, role}]
- local_tips: [{category, name, description, address, distanceMin}]
- language_default ('it' | 'en'): inferiscila SOLO dalla lingua predominante del testo
- additional_info: testo libero residuo che non rientra nei campi sopra

CATEGORIE local_tips ammesse: pasticceria | ristorante | bar | panorama | shopping | farmacia | altro

REGOLE:
1. Tipici pattern italiani: "wifi: NomeRete password 12345" → wifi_ssid="NomeRete", wifi_password="12345".
2. Keybox: cerca "keybox", "lockbox", "cassetta", "codice"+digit. Se trovi codice + digit, mettilo in keybox_code. Se trovi descrizione del posizionamento (es. "vicino alla porta a sinistra"), mettila in keybox_instructions.
3. Posti consigliati: solo se il testo ne menziona ESPLICITAMENTE almeno il nome. Non inventare ristoranti dal contesto della città.
4. Telefoni emergenza: solo persone con numero E ruolo (idraulico, vicino, manager). Non includere 112/118/Vigili (sono globali, non utili).
5. Se trovi sezioni miste (testo libero + contatti + posti), separa puliti.
6. NIENTE testo creativo. Se non sai, omitti.

OUTPUT: chiama il tool emit_knowledge_extraction con SOLO i campi estraibili. Tutti opzionali.`;

export async function parseKnowledgeFromText(input: {
  text: string;
}): Promise<KnowledgeParserOutput> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');
  const client = new Anthropic({ apiKey });

  // Limite input per costo + safety: ~12K char, ~3K token.
  const truncated =
    input.text.length > 12000 ? `${input.text.slice(0, 12000)}\n[...truncated]` : input.text;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1500,
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: `Estrai dal seguente testo i campi knowledge property:\n\n---\n${truncated}\n---`,
      },
    ],
    tools: [
      {
        name: 'emit_knowledge_extraction',
        description:
          'Emette i campi knowledge property estratti dal testo libero. Tutti i campi sono opzionali — emetti solo quelli effettivamente presenti nel testo.',
        input_schema: {
          type: 'object',
          properties: {
            wifi_ssid: { type: 'string' },
            wifi_password: { type: 'string' },
            wifi_notes: { type: 'string' },
            keybox_code: { type: 'string' },
            keybox_instructions: { type: 'string' },
            parking_available: { type: 'boolean' },
            parking_type: {
              type: 'string',
              enum: ['street', 'garage', 'private', 'paid', 'none'],
            },
            parking_instructions: { type: 'string' },
            check_in_instructions: { type: 'string' },
            check_out_instructions: { type: 'string' },
            emergency_contacts: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  phone: { type: 'string' },
                  role: { type: 'string' },
                },
                required: ['name', 'phone', 'role'],
              },
            },
            local_tips: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  category: {
                    type: 'string',
                    enum: [
                      'pasticceria',
                      'ristorante',
                      'bar',
                      'panorama',
                      'shopping',
                      'farmacia',
                      'altro',
                    ],
                  },
                  name: { type: 'string' },
                  description: { type: 'string' },
                  address: { type: 'string' },
                  distanceMin: { type: 'number' },
                },
                required: ['category', 'name'],
              },
            },
            language_default: { type: 'string', enum: ['it', 'en'] },
            additional_info: { type: 'string' },
          },
        },
      },
    ],
    tool_choice: { type: 'tool', name: 'emit_knowledge_extraction' },
  });

  const toolUse = response.content.find((c) => c.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new Error('parseKnowledgeFromText: no tool_use in response');
  }

  const parsed = parsedSchema.parse(toolUse.input);

  // Haiku 4.5 cost: input 0.80 USD/Mtok, output 4 USD/Mtok.
  // Cache write 1 USD/Mtok, cache read 0.08 USD/Mtok.
  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;
  const cacheReadTokens = response.usage.cache_read_input_tokens ?? 0;
  const cacheWriteTokens = response.usage.cache_creation_input_tokens ?? 0;
  const costUsd =
    (inputTokens * 0.8) / 1_000_000 +
    (outputTokens * 4) / 1_000_000 +
    (cacheWriteTokens * 1) / 1_000_000 +
    (cacheReadTokens * 0.08) / 1_000_000;

  const wifi =
    parsed.wifi_ssid || parsed.wifi_password || parsed.wifi_notes
      ? {
          ssid: parsed.wifi_ssid,
          password: parsed.wifi_password,
          notes: parsed.wifi_notes,
        }
      : undefined;

  const keybox =
    parsed.keybox_code || parsed.keybox_instructions
      ? { code: parsed.keybox_code, instructions: parsed.keybox_instructions }
      : undefined;

  const parking =
    parsed.parking_available !== undefined || parsed.parking_type || parsed.parking_instructions
      ? {
          available: parsed.parking_available,
          type: parsed.parking_type,
          instructions: parsed.parking_instructions,
        }
      : undefined;

  return {
    parsed: {
      wifi,
      keybox,
      parking,
      checkInInstructions: parsed.check_in_instructions,
      checkOutInstructions: parsed.check_out_instructions,
      emergencyContacts: parsed.emergency_contacts,
      localTipsCuratedHost: parsed.local_tips,
      languageDefault: parsed.language_default,
      additionalInfo: parsed.additional_info,
    },
    costUsd: Math.round(costUsd * 1_000_000) / 1_000_000,
    agentVersion: KNOWLEDGE_PARSER_VERSION,
  };
}
