import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

// ─────────────────────────────────────────────────────────────
// Parser email Airbnb con Claude Sonnet 4.6 + structured output via tool_use.
//
// Modello scelto: claude-sonnet-4-6 (~4× più economico di Opus, qualità
// più che sufficiente per estrazione di campi strutturati). Default
// ottimizzato per costo: thinking disabilitato + prompt caching sul
// system prompt (~70% risparmio cross-email perché il prompt è identico).
//
// Approccio structured output: tool_use forzato. Definiamo un tool
// "extract_airbnb_email" con JSON schema; Claude DEVE chiamarlo
// (tool_choice). Il tool input è validato con Zod lato nostro. Più
// stabile di output_config.format con zod 3.25 (incompat con
// discriminated unions).
//
// 5 tipologie email_type:
//   - confirmation, cancellation, modification, pre_approval, other.
// Costo stimato ~$0.016 per email, ~€3 per 200 email.
// ─────────────────────────────────────────────────────────────

export class AirbnbParserError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'AirbnbParserError';
  }
}

// ─────────────────────────────────────────────────────────────
// Zod schema (validazione runtime). NON usato per generare il JSON
// schema del tool — quello è hardcoded sotto per compat con la SDK.
// ─────────────────────────────────────────────────────────────

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

const confirmationSchema = z.object({
  email_type: z.literal('confirmation'),
  guest_full_name: z.string(),
  guest_first_name: z.string(),
  guest_country_code: z.string().length(2).nullable(),
  guest_language: z.string().min(2).max(8).nullable(),
  guest_count: z.number().int().min(1),
  guest_message_original: z.string().nullable(),
  guest_message_lang: z.string().min(2).max(8).nullable(),
  host_payout_amount: z.number().nullable(),
  host_payout_currency: z.string().length(3).nullable(),
  check_in_date: z.string().regex(dateRegex),
  check_out_date: z.string().regex(dateRegex),
  nights: z.number().int().min(1),
  booking_external_code: z.string().nullable(),
  property_name: z.string().nullable(),
  airbnb_listing_url: z.string().nullable(),
});

const cancellationSchema = z.object({
  email_type: z.literal('cancellation'),
  guest_full_name: z.string().nullable(),
  booking_external_code: z.string().nullable(),
  property_name: z.string().nullable(),
  airbnb_listing_url: z.string().nullable(),
});

const modificationSchema = z.object({
  email_type: z.literal('modification'),
  guest_full_name: z.string().nullable(),
  guest_first_name: z.string().nullable(),
  check_in_date: z.string().regex(dateRegex).nullable(),
  check_out_date: z.string().regex(dateRegex).nullable(),
  nights: z.number().int().nullable(),
  guest_count: z.number().int().nullable(),
  booking_external_code: z.string().nullable(),
  property_name: z.string().nullable(),
  airbnb_listing_url: z.string().nullable(),
});

const preApprovalSchema = z.object({
  email_type: z.literal('pre_approval'),
  booking_external_code: z.string().nullable(),
  property_name: z.string().nullable(),
  airbnb_listing_url: z.string().nullable(),
});

const otherSchema = z.object({
  email_type: z.literal('other'),
  booking_external_code: z.string().nullable(),
  property_name: z.string().nullable(),
  airbnb_listing_url: z.string().nullable(),
});

export const ParsedAirbnbEmailSchema = z.discriminatedUnion('email_type', [
  confirmationSchema,
  cancellationSchema,
  modificationSchema,
  preApprovalSchema,
  otherSchema,
]);

export type ParsedAirbnbEmail = z.infer<typeof ParsedAirbnbEmailSchema>;
export type ParsedAirbnbConfirmation = Extract<ParsedAirbnbEmail, { email_type: 'confirmation' }>;

// ─────────────────────────────────────────────────────────────
// JSON schema del tool (hardcoded). Formato anyOf con discriminator
// implicito sul valore di email_type.
// ─────────────────────────────────────────────────────────────

const TOOL_INPUT_SCHEMA = {
  type: 'object' as const,
  properties: {
    email_type: {
      type: 'string',
      enum: ['confirmation', 'cancellation', 'modification', 'pre_approval', 'other'],
      description: 'Tipologia email Airbnb. Vedi system prompt per regole di classificazione.',
    },
    // Campi popolati su confirmation, modification (parzialmente),
    // cancellation (solo guest_full_name e booking_external_code).
    guest_full_name: { type: ['string', 'null'] },
    guest_first_name: { type: ['string', 'null'] },
    guest_country_code: { type: ['string', 'null'], description: 'ISO 3166-1 alpha-2 (2 lettere). Null se non deducibile.' },
    guest_language: { type: ['string', 'null'], description: 'ISO 639-1 (en, it, fr, es, de). Null se non deducibile.' },
    guest_count: { type: ['integer', 'null'], minimum: 1 },
    guest_message_original: {
      type: ['string', 'null'],
      description: 'Messaggio dell\'ospite NELLA LINGUA ORIGINALE (NON la traduzione automatica italiana). Null se assente.',
    },
    guest_message_lang: { type: ['string', 'null'] },
    host_payout_amount: { type: ['number', 'null'], description: 'Compenso netto host (NON l\'importo pagato dall\'ospite).' },
    host_payout_currency: { type: ['string', 'null'], description: 'ISO 4217 (EUR, USD, GBP).' },
    check_in_date: { type: ['string', 'null'], pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
    check_out_date: { type: ['string', 'null'], pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
    nights: { type: ['integer', 'null'], minimum: 1 },
    booking_external_code: { type: ['string', 'null'], description: 'Codice prenotazione user-facing (Airbnb: 10 caratteri alfanumerici tipo HM4XDFHECP).' },
    property_name: { type: ['string', 'null'] },
    airbnb_listing_url: { type: ['string', 'null'] },
  },
  required: [
    'email_type',
    'guest_full_name',
    'guest_first_name',
    'guest_country_code',
    'guest_language',
    'guest_count',
    'guest_message_original',
    'guest_message_lang',
    'host_payout_amount',
    'host_payout_currency',
    'check_in_date',
    'check_out_date',
    'nights',
    'booking_external_code',
    'property_name',
    'airbnb_listing_url',
  ],
  additionalProperties: false,
};

// ─────────────────────────────────────────────────────────────
// System prompt (cached).
// ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Sei un parser di email Airbnb. Estrai dati strutturati dalle email che l'host (proprietario Airbnb) riceve, per capire la prenotazione.

DEVI sempre chiamare il tool "extract_airbnb_email" con i campi del JSON schema. Mai rispondere in prosa.

# Tipi di email da riconoscere

1. "confirmation" — "Nuova prenotazione confermata!" / "New booking confirmed". L'ospite ha prenotato e l'host deve essere notificato. Email principale, contiene tutti i dati.

2. "cancellation" — "Prenotazione cancellata" / "Booking canceled". L'ospite o l'host ha cancellato. Estrai solo guest_full_name e booking_external_code; gli altri campi possono essere null.

3. "modification" — "Modifica prenotazione" / "Booking modified". Cambio date/ospiti. Estrai i nuovi dati.

4. "pre_approval" — "Pre-approvazione richiesta" / "Pre-approval". L'ospite ha solo richiesto, non ancora confermato.

5. "other" — Qualsiasi altra email Airbnb (newsletter, payout, recensione, etc.). Compila solo i campi base con null.

# Regole di estrazione

- guest_full_name: nome completo come appare nell'email (es. "Stephen Smith"). Mai inventare.
- guest_first_name: solo il primo nome (es. "Stephen").
- guest_country_code: ISO 3166-1 alpha-2 (US, GB, IT, FR, DE, ES…). Solo se deducibile esplicitamente. Altrimenti null.
- guest_language: lingua del messaggio originale dell'ospite. ISO 639-1 (en, it, fr, es, de). Se l'ospite non ha scritto messaggio, null.
- guest_message_original: il messaggio dell'ospite NELLA LINGUA ORIGINALE, NON la traduzione italiana. Le email Airbnb spesso mostrano la traduzione italiana seguita da "Tradotto automaticamente. Segue il messaggio originale:" + testo originale. Estrai SEMPRE quel testo originale (post-quel-marker), MAI la traduzione italiana che lo precede.
- guest_count: numero totale ospiti (adulti + bambini). "2 adulti" → 2.
- check_in_date / check_out_date: formato ISO YYYY-MM-DD. Email italiane mostrano "mer 23 set 14:00" → 23 settembre dell'anno dedotto dal date header dell'email. MAI inventare l'anno: usa la data dell'email per disambiguare.
- nights: numero notti (differenza date).
- booking_external_code: codice prenotazione (es. "HM4XDFHECP"). Su Airbnb è 10 caratteri alfanumerici, etichettato "Codice di conferma" / "Confirmation code".
- property_name: nome struttura come appare in email (es. "[Jacuzzi - Centro Storico] La goccia di S.Gennaro").
- airbnb_listing_url: URL della struttura (https://www.airbnb.com/rooms/...). Se non presente, null.
- host_payout_amount: compenso netto host come numero. "Tu guadagni 110,62 €" → 110.62. NOTA: "L'ospite ha pagato 144,92 €" è importo lordo, NON il payout host.
- host_payout_currency: ISO 4217 (EUR, USD, GBP).

# Cosa NON fare

- Non inventare campi non presenti. Usa null.
- Non tradurre il messaggio dell'ospite. Mantienilo nella lingua originale.
- Non confondere importo pagato dall'ospite con compenso host. Sempre quest'ultimo.
- Non confondere check-in con check-out.

Per email_type "other"/"pre_approval"/"cancellation": campi non rilevanti → null.`;

// ─────────────────────────────────────────────────────────────
// parseAirbnbEmail
// ─────────────────────────────────────────────────────────────

export type AirbnbEmailInput = {
  // Body migliore disponibile (preferisci textBody, fallback htmlBody).
  htmlBody: string;
  textBody: string;
  date: Date | null;
  // Subject opzionale: aiuta a classificare email_type.
  subject?: string;
};

export type ParserOptions = {
  // Override Anthropic client per test (mock).
  client?: Anthropic;
  // Override modello (default claude-sonnet-4-6).
  model?: string;
};

const DEFAULT_MODEL = 'claude-sonnet-4-6';
const TOOL_NAME = 'extract_airbnb_email';

export async function parseAirbnbEmail(
  email: AirbnbEmailInput,
  options: ParserOptions = {},
): Promise<ParsedAirbnbEmail> {
  if (!email.htmlBody && !email.textBody) {
    throw new AirbnbParserError('Email senza htmlBody né textBody — niente da parsare');
  }

  const client =
    options.client ??
    new Anthropic({ apiKey: requireEnv('ANTHROPIC_API_KEY') });
  const model = options.model ?? process.env.CLAUDE_MODEL_EMAIL_PARSER ?? DEFAULT_MODEL;

  // Limita body a 12K char (template Airbnb molto al di sotto).
  const text = (email.textBody || '').slice(0, 12000);
  const html = (email.htmlBody || '').slice(0, 12000);
  const userMessage = buildUserMessage({ text, html, date: email.date, subject: email.subject });

  let response;
  try {
    response = await client.messages.create({
      model,
      max_tokens: 1024,
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
          // Prompt caching: identico per ogni email del sync (~70% saving).
          cache_control: { type: 'ephemeral' },
        },
      ],
      tools: [
        {
          name: TOOL_NAME,
          description: 'Estrae i dati strutturati dall\'email Airbnb',
          input_schema: TOOL_INPUT_SCHEMA,
        },
      ],
      tool_choice: { type: 'tool', name: TOOL_NAME },
      messages: [{ role: 'user', content: userMessage }],
    });
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      throw new AirbnbParserError(`Anthropic API error ${err.status}: ${err.message}`, err);
    }
    throw new AirbnbParserError(`Errore inatteso parser: ${(err as Error).message}`, err);
  }

  // Estrai il blocco tool_use.
  const toolUse = response.content.find(
    (b): b is Extract<typeof response.content[number], { type: 'tool_use' }> => b.type === 'tool_use',
  );
  if (!toolUse) {
    throw new AirbnbParserError(
      `Claude non ha chiamato il tool (stop_reason=${response.stop_reason ?? '?'})`,
    );
  }
  if (toolUse.name !== TOOL_NAME) {
    throw new AirbnbParserError(`Claude ha chiamato un tool inatteso: ${toolUse.name}`);
  }

  const validation = ParsedAirbnbEmailSchema.safeParse(toolUse.input);
  if (!validation.success) {
    throw new AirbnbParserError(
      `Output Claude non valido contro lo schema Zod: ${validation.error.message}`,
      validation.error,
    );
  }
  return validation.data;
}

function buildUserMessage(args: {
  text: string;
  html: string;
  date: Date | null;
  subject?: string;
}): string {
  const lines = ['Parsifica questa email Airbnb. Chiama il tool extract_airbnb_email.', ''];
  if (args.subject) lines.push(`Subject: ${args.subject}`);
  if (args.date) lines.push(`Email date: ${args.date.toISOString()}`);
  lines.push('');
  if (args.text) {
    lines.push('# Text body');
    lines.push(args.text);
  }
  if (args.html && !args.text) {
    lines.push('# HTML body (no text/plain disponibile)');
    lines.push(args.html);
  }
  return lines.join('\n');
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === '') {
    throw new AirbnbParserError(`env ${name} mancante`);
  }
  return v;
}

export const _internals = {
  SYSTEM_PROMPT,
  TOOL_INPUT_SCHEMA,
  TOOL_NAME,
  buildUserMessage,
  DEFAULT_MODEL,
};
