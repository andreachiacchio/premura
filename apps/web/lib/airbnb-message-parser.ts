import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

// ─────────────────────────────────────────────────────────────
// Parser email Airbnb tipo "messaggio ospite" (slice 7a.2).
// Variant del parser email confirmation/cancellation: estrae SOLO il body
// del messaggio + lingua + thread id, no dati prenotazione.
//
// Modello: claude-sonnet-4-6 (stesso della pipeline confirmation, prompt
// caching cross-email per identico system prompt). Costo stimato:
// ~$0.012 per email messaggio.
// ─────────────────────────────────────────────────────────────

export class AirbnbMessageParserError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'AirbnbMessageParserError';
  }
}

const messageSchema = z.object({
  guest_message_original: z
    .string()
    .nullable()
    .describe('Body completo messaggio ospite. Null se non estraibile.'),
  guest_message_lang: z.string().min(2).max(8).nullable(),
  // L'host puo' essere taggato in thread con piu' partecipanti. In quel
  // caso il parser distingue il messaggio dell'ospite dai messaggi
  // automatici Airbnb. Per slice 7a.2 lavoriamo solo guest -> host.
  airbnb_thread_id: z
    .string()
    .nullable()
    .describe(
      'ID del thread sul lato Airbnb (URL link "Rispondi" contiene' +
        ' /messaging/<thread_id>/). Null se non estraibile.',
    ),
  booking_external_code: z.string().nullable(),
  property_name: z.string().nullable(),
});

export type ParsedAirbnbMessage = z.infer<typeof messageSchema>;

const TOOL_INPUT_SCHEMA = {
  type: 'object' as const,
  properties: {
    guest_message_original: {
      type: ['string', 'null'],
      description:
        "Body completo del messaggio dell'ospite, NELLA LINGUA ORIGINALE. " +
        'Le email Airbnb spesso mostrano la traduzione italiana seguita ' +
        'da "Tradotto automaticamente. Segue il messaggio originale:" + ' +
        'testo originale. Estrai SEMPRE quel testo originale (post-marker), ' +
        "MAI la traduzione italiana che lo precede. Null se l'email non " +
        'contiene un messaggio leggibile (caso borderline: notifiche di ' +
        'sistema travestite da messaggio).',
    },
    guest_message_lang: {
      type: ['string', 'null'],
      description: 'ISO 639-1 (en, it, fr, es, de). Lingua del messaggio originale.',
    },
    airbnb_thread_id: {
      type: ['string', 'null'],
      description:
        'ID del thread Airbnb estratto dal link "Rispondi" / "Reply" ' +
        '(URL contiene /messaging/<thread_id>/). Null se non presente.',
    },
    booking_external_code: {
      type: ['string', 'null'],
      description:
        'Codice prenotazione (10 char alfanumerici Airbnb tipo HM4XDFHECP) se presente nel template.',
    },
    property_name: {
      type: ['string', 'null'],
      description: 'Nome struttura come appare nel template email.',
    },
  },
  required: [
    'guest_message_original',
    'guest_message_lang',
    'airbnb_thread_id',
    'booking_external_code',
    'property_name',
  ],
  additionalProperties: false,
};

const SYSTEM_PROMPT = `Sei un parser di email Airbnb di tipo "messaggio ospite".

L'host (proprietario Airbnb) ha ricevuto una notifica email perche' un ospite gli ha scritto sul thread Airbnb. Tu devi estrarre SOLO il body del messaggio + metadata, mai dati prenotazione (date, prezzo, etc.).

DEVI sempre chiamare il tool "extract_airbnb_message" con i campi del JSON schema. Mai rispondere in prosa.

# Cosa estrarre

- guest_message_original: il body completo del messaggio NELLA LINGUA ORIGINALE.
  Le email Airbnb mostrano traduzione italiana seguita da "Tradotto automaticamente. Segue il messaggio originale:" + testo originale.
  Estrai SEMPRE il testo originale (post-marker), MAI la traduzione che lo precede.
  Se l'email non contiene un messaggio reale (notifica di sistema, promemoria, etc.) -> null.
- guest_message_lang: ISO 639-1 della lingua originale (en, it, fr, es, de). Null se non deducibile.
- airbnb_thread_id: estratto dal link "Rispondi" / "Reply" presente nell'email. URL pattern tipico:
  https://www.airbnb.com/messaging/qt_for_reservation/<RESERVATION>?...
  oppure
  https://www.airbnb.com/messaging/<thread_id>?...
  Estrai l'ID stringa (slug). Null se nessun link reply.
- booking_external_code: 10 char alfanumerici tipo HM4XDFHECP. Null se non visibile.
- property_name: nome struttura come appare. Null se non visibile.

# Cosa NON fare

- Non confondere il messaggio dell'ospite con messaggi automatici Airbnb (notifiche di pagamento, suggerimenti, etc.).
- Non tradurre il messaggio.
- Non inventare il thread_id se non e' nell'HTML.
- Non lasciare guest_message_original vuoto se c'e' un messaggio: estrailo intero, anche se lungo.
`;

const SchemaParsed = messageSchema;

export type AirbnbMessageInput = {
  htmlBody: string;
  textBody: string;
  date: Date | null;
  subject: string;
};

export async function parseAirbnbMessage(
  input: AirbnbMessageInput,
  options: { client?: Anthropic; model?: string } = {},
): Promise<ParsedAirbnbMessage> {
  const client = options.client ?? new Anthropic();
  const model = options.model ?? process.env.CLAUDE_MODEL_EMAIL_PARSER ?? 'claude-sonnet-4-6';

  // Concatena entrambi (HTML + text) per dare contesto al modello: HTML
  // contiene markup ma anche i link reply/thread, text e' piu' pulito ma
  // perde i link.
  const userContent = [
    `Subject: ${input.subject}`,
    `Date: ${input.date?.toISOString() ?? 'unknown'}`,
    '',
    '--- HTML BODY ---',
    input.htmlBody.slice(0, 30_000),
    '',
    '--- TEXT BODY ---',
    input.textBody.slice(0, 10_000),
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
          name: 'extract_airbnb_message',
          description: 'Estrai body messaggio ospite + metadata Airbnb',
          input_schema: TOOL_INPUT_SCHEMA,
        },
      ],
      tool_choice: { type: 'tool', name: 'extract_airbnb_message' },
      messages: [{ role: 'user', content: userContent }],
    });
  } catch (err) {
    throw new AirbnbMessageParserError('Anthropic API call failed', err);
  }

  const toolUse = response.content.find((c) => c.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new AirbnbMessageParserError('Claude did not produce a tool_use response');
  }

  const parsed = SchemaParsed.safeParse(toolUse.input);
  if (!parsed.success) {
    throw new AirbnbMessageParserError(
      `Tool input validation failed: ${parsed.error.message}`,
      toolUse.input,
    );
  }

  return parsed.data;
}
