import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

// ─────────────────────────────────────────────────────────────
// Slice 11 — Conversation Agent draft generator.
//
// Cuore Premura: data una conversazione + voice profile host + guest
// DNA + property knowledge, genera draft di risposta personalizzata.
// Output JSON Zod-validated. Modello: Claude Sonnet 4.6.
//
// Cost stimato: ~€0.008/draft (input ~3000 token con context completo,
// output ~250 token).
// ─────────────────────────────────────────────────────────────

export class DraftGeneratorError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'DraftGeneratorError';
  }
}

export const CLASSIFICATION_VALUES = [
  'info_request', // domanda info pratica (wifi, parcheggio, check-in)
  'complaint', // lamentela / problema serio
  'small_talk', // chiacchiere amichevoli, no-action
  'emergency', // urgenza vera (perdita acqua, blocco, incidente)
  'booking_question', // modifica prenotazione, sconto, extra
  'other', // catch-all
] as const;
export type DraftClassification = (typeof CLASSIFICATION_VALUES)[number];

export const SUGGESTED_ACTIONS = ['auto_send', 'notify_host', 'escalate'] as const;
export type SuggestedAction = (typeof SUGGESTED_ACTIONS)[number];

const draftSchema = z.object({
  draft_body: z
    .string()
    .min(2)
    .max(2000)
    .describe('Testo del draft di risposta. Lingua = lingua ospite.'),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe("Confidenza dell'agente sul draft [0-1]. Threshold auto-send: > 0.85."),
  reasoning: z
    .string()
    .max(500)
    .describe("Ragionamento sintetico in italiano: perche' questo draft, su quali fatti si basa."),
  classification: z.enum(CLASSIFICATION_VALUES),
  suggested_action: z.enum(SUGGESTED_ACTIONS),
});

export type DraftOutput = z.infer<typeof draftSchema>;

const TOOL_INPUT_SCHEMA = {
  type: 'object' as const,
  properties: {
    draft_body: {
      type: 'string',
      minLength: 2,
      maxLength: 2000,
      description:
        'Testo del draft di risposta. Lingua = lingua ospite. Tono = voice profile host. Firma = nome struttura (vedi system prompt).',
    },
    confidence: {
      type: 'number',
      minimum: 0,
      maximum: 1,
      description:
        'Confidenza [0-1]. >0.85 = draft pronto per auto-send. 0.6-0.85 = draft buono ma serve approval. <0.6 = host deve riscrivere.',
    },
    reasoning: {
      type: 'string',
      maxLength: 500,
      description: "Perche' questo draft. Sintetico, italiano, max 500 char.",
    },
    classification: {
      type: 'string',
      enum: CLASSIFICATION_VALUES as unknown as string[],
    },
    suggested_action: {
      type: 'string',
      enum: SUGGESTED_ACTIONS as unknown as string[],
      description:
        'auto_send se confidence>0.85 + classification info_request|small_talk. notify_host se confidence<0.85 OR complaint|booking_question. escalate se emergency.',
    },
  },
  required: ['draft_body', 'confidence', 'reasoning', 'classification', 'suggested_action'],
  additionalProperties: false,
};

const SYSTEM_PROMPT = `Sei l'agente conversazionale di Premura. Generi risposte ai messaggi degli ospiti per conto dell'host di affitti brevi.

# Regole assolute

1. **Firma sempre col nome della struttura**, MAI col tuo nome ne' "Premura". L'ospite deve pensare di parlare con l'host umano.
2. **Lingua = lingua ultimo messaggio ospite**. Se l'ospite scrive in inglese, rispondi in inglese. Se misto, scegli la prevalente.
3. **Tono = voice profile host**. Usa avg_sentence_length, formality_score, common_phrases, greeting_patterns, closing_patterns dell'host. Se voice profile manca o ha confidence bassa (<0.3), usa tono "neutro caldo italiano".
4. **Fatti dalla property knowledge**. Mai inventare codici keybox, password WiFi, regole. Se l'info non c'e' nella knowledge, scrivi "Ti rispondo entro qualche minuto" e classification=other (suggested_action=notify_host).
5. **Niente link a domini terzi**. Numero WhatsApp dell'host ok. NO survey link, NO landing page Premura.
6. **MAI rivelare contatti dei fornitori** (skipper, chef, NCC, massaggi, degustazioni): niente numero, niente cognome, niente contatto di alcun tipo. Sei TU il coordinatore: se l'ospite chiede il contatto ("can I have the boat guy's number?"), rispondi che organizzi tu e chiedi data e numero di persone. Il flusso e': ospite chiede -> tu scrivi al fornitore -> il fornitore risponde -> tu riporti all'ospite -> conferma. Le due parti non si parlano mai direttamente. Nei messaggi all'ospite chiama il fornitore col RUOLO ("il nostro skipper", "our chef"), mai col nome proprio. I contatti in property knowledge (referente in loco, meeting point) invece SONO condivisibili: sono lato host.

# Classification

- **info_request**: domanda pratica con risposta nella property knowledge (wifi, parking, check-in, regole). Confidence alta se info presente.
- **complaint**: lamentela / problema (rumore, qualcosa rotto, ospite scontento). Confidence MAI > 0.7. suggested_action=notify_host.
- **small_talk**: chiacchiere ("come va", "buon weekend", "grazie!"). Confidence alta, suggested_action=auto_send.
- **emergency**: urgenza fisica (perdita acqua, blocco fuori casa, incidente). suggested_action=escalate. Draft conciso che rassicura + dice "chiamo subito qualcuno".
- **booking_question**: modifica date, sconto, extra services. suggested_action=notify_host. MAI promettere sconti / cambi date senza host.
- **other**: catch-all (info non in knowledge, situazione ambigua). suggested_action=notify_host.

# Confidence guidelines

- 0.9-1.0: info pratica con dati certi nella knowledge + voice profile robusto. Auto-send safe.
- 0.7-0.9: tono ok, info dedotta da context, draft buono ma serve occhio host.
- 0.4-0.7: ambiguita', dati parziali, draft come point-of-departure.
- <0.4: meglio non rispondere, host deve fare lui.

# Output

DEVI sempre chiamare il tool "generate_reply_draft". Mai prosa.`;

export type GenerateDraftInput = {
  // Ultimi N messaggi del thread, ordine cronologico crescente.
  // L'ultimo elemento e' il messaggio inbound da rispondere.
  conversation: Array<{
    direction: 'inbound' | 'outbound';
    fromEntity: 'guest' | 'host' | 'premura';
    body: string;
    sentAt?: Date | null;
  }>;
  // Voice profile host (slice 8.4). Null se non ancora popolato.
  voiceProfile: {
    avgSentenceLength?: number | null;
    formalityScore?: number | null;
    emojiUsageRate?: number | null;
    commonPhrases?: Array<{ phrase: string; count: number }>;
    greetingPatterns?: string[];
    closingPatterns?: string[];
    voiceConfidence?: number;
  } | null;
  // Insights guest DNA (slice 8.1). Null se non ancora popolato.
  guestInsights: {
    preferredLanguage?: string;
    communicationStyle?: { score: number; label: string };
    topicsMentioned?: string[];
    sentimentAvg?: number;
  } | null;
  // Property knowledge (slice 12). Null se host non l'ha compilata.
  propertyKnowledge: {
    keybox?: { code?: string; instructions?: string } | null;
    wifi?: { ssid?: string; password?: string; notes?: string } | null;
    parking?: { type?: string; instructions?: string } | null;
    houseRules?: {
      quietHoursStart?: string;
      quietHoursEnd?: string;
      smokingAllowed?: boolean;
      petsAllowed?: boolean;
      additionalNotes?: string;
    } | null;
    additionalInfo?: string | null;
  } | null;
  // Nome struttura per la firma del draft.
  propertyName: string;
  // Nome ospite per il greeting (best-effort, optional).
  guestFirstName?: string;
};

export async function generateReplyDraft(
  input: GenerateDraftInput,
  options: { client?: Anthropic; model?: string } = {},
): Promise<DraftOutput> {
  if (input.conversation.length === 0) {
    throw new DraftGeneratorError('No conversation provided');
  }
  const client = options.client ?? new Anthropic();
  const model = options.model ?? process.env.CLAUDE_MODEL_PRIMARY ?? 'claude-sonnet-4-6';

  const userContent = buildUserContent(input);

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
          name: 'generate_reply_draft',
          description: 'Genera draft risposta + classificazione + confidence',
          input_schema: TOOL_INPUT_SCHEMA,
        },
      ],
      tool_choice: { type: 'tool', name: 'generate_reply_draft' },
      messages: [{ role: 'user', content: userContent }],
    });
  } catch (err) {
    throw new DraftGeneratorError('Anthropic API call failed', err);
  }

  const toolUse = response.content.find((c) => c.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new DraftGeneratorError('Claude did not produce a tool_use response');
  }

  const parsed = draftSchema.safeParse(toolUse.input);
  if (!parsed.success) {
    throw new DraftGeneratorError(
      `Tool input validation failed: ${parsed.error.message}`,
      toolUse.input,
    );
  }
  return parsed.data;
}

// User content builder esposto per test (verifica che il prompt
// includa tutti i context).
export function buildUserContent(input: GenerateDraftInput): string {
  const parts: string[] = [];

  parts.push(`STRUTTURA: ${input.propertyName}`);
  if (input.guestFirstName) {
    parts.push(`OSPITE: ${input.guestFirstName}`);
  }
  parts.push('');

  // Voice profile
  if (input.voiceProfile && (input.voiceProfile.voiceConfidence ?? 0) > 0.1) {
    parts.push("VOICE PROFILE HOST (estratto da messaggi reali dell'host):");
    if (
      input.voiceProfile.formalityScore !== null &&
      input.voiceProfile.formalityScore !== undefined
    ) {
      const lab =
        input.voiceProfile.formalityScore <= 2
          ? 'molto formale'
          : input.voiceProfile.formalityScore >= 4
            ? 'casual'
            : 'neutro/cordiale';
      parts.push(`- formality_score: ${input.voiceProfile.formalityScore.toFixed(2)} (${lab})`);
    }
    if (input.voiceProfile.avgSentenceLength) {
      parts.push(
        `- avg_sentence_length: ${input.voiceProfile.avgSentenceLength.toFixed(1)} parole`,
      );
    }
    if (
      input.voiceProfile.emojiUsageRate !== null &&
      input.voiceProfile.emojiUsageRate !== undefined
    ) {
      parts.push(`- emoji_usage_rate: ${(input.voiceProfile.emojiUsageRate * 100).toFixed(0)}%`);
    }
    if (input.voiceProfile.commonPhrases && input.voiceProfile.commonPhrases.length > 0) {
      const top = input.voiceProfile.commonPhrases
        .slice(0, 6)
        .map((p) => `"${p.phrase}"`)
        .join(', ');
      parts.push(`- frasi tipiche dell'host: ${top}`);
    }
    if (input.voiceProfile.greetingPatterns && input.voiceProfile.greetingPatterns.length > 0) {
      parts.push(`- aperture: ${input.voiceProfile.greetingPatterns.join(' | ')}`);
    }
    if (input.voiceProfile.closingPatterns && input.voiceProfile.closingPatterns.length > 0) {
      parts.push(`- chiusure: ${input.voiceProfile.closingPatterns.join(' | ')}`);
    }
    parts.push('');
  } else {
    parts.push('VOICE PROFILE HOST: non ancora estratto. Usa tono neutro caldo italiano.');
    parts.push('');
  }

  // Guest DNA
  if (input.guestInsights) {
    parts.push('GUEST DNA (estratto da messaggi ospite):');
    if (input.guestInsights.preferredLanguage) {
      parts.push(`- preferred_language: ${input.guestInsights.preferredLanguage}`);
    }
    if (input.guestInsights.communicationStyle) {
      parts.push(
        `- communication_style: ${input.guestInsights.communicationStyle.label} (${input.guestInsights.communicationStyle.score}/5)`,
      );
    }
    if (input.guestInsights.topicsMentioned && input.guestInsights.topicsMentioned.length > 0) {
      parts.push(`- topics ricorrenti: ${input.guestInsights.topicsMentioned.join(', ')}`);
    }
    if (input.guestInsights.sentimentAvg !== undefined) {
      parts.push(`- sentiment_avg: ${input.guestInsights.sentimentAvg.toFixed(2)}`);
    }
    parts.push('');
  }

  // Property knowledge
  parts.push('PROPERTY KNOWLEDGE:');
  if (!input.propertyKnowledge) {
    parts.push(
      '- non ancora compilata. Se la domanda richiede dati specifici, classification=other + suggested_action=notify_host.',
    );
  } else {
    const k = input.propertyKnowledge;
    if (k.keybox?.code || k.keybox?.instructions) {
      parts.push(
        `- keybox: code="${k.keybox.code ?? '?'}", istruzioni="${k.keybox.instructions ?? '?'}"`,
      );
    }
    if (k.wifi?.ssid || k.wifi?.password) {
      parts.push(
        `- wifi: ssid="${k.wifi.ssid ?? '?'}", password="${k.wifi.password ?? '?'}"${k.wifi.notes ? `, note: ${k.wifi.notes}` : ''}`,
      );
    }
    if (k.parking?.type) {
      parts.push(`- parcheggio: tipo=${k.parking.type}, ${k.parking.instructions ?? ''}`);
    }
    if (k.houseRules) {
      const r = k.houseRules;
      const ruleParts: string[] = [];
      if (r.quietHoursStart && r.quietHoursEnd) {
        ruleParts.push(`silenzio ${r.quietHoursStart}-${r.quietHoursEnd}`);
      }
      if (r.smokingAllowed === false) ruleParts.push('vietato fumare');
      if (r.smokingAllowed === true) ruleParts.push("si puo' fumare");
      if (r.petsAllowed === false) ruleParts.push('vietati animali');
      if (r.petsAllowed === true) ruleParts.push('animali ok');
      if (r.additionalNotes) ruleParts.push(r.additionalNotes);
      if (ruleParts.length > 0) parts.push(`- regole casa: ${ruleParts.join(', ')}`);
    }
    if (k.additionalInfo) {
      parts.push(`- note libere: ${k.additionalInfo}`);
    }
  }
  parts.push('');

  // Conversazione
  parts.push('CONVERSAZIONE (ordine cronologico, ultimo = messaggio da rispondere):');
  for (const m of input.conversation) {
    const who =
      m.fromEntity === 'guest'
        ? `Ospite${input.guestFirstName ? ` (${input.guestFirstName})` : ''}`
        : m.fromEntity === 'host'
          ? 'Host'
          : 'Premura';
    parts.push(`[${who}] ${m.body.slice(0, 1500)}`);
  }

  return parts.join('\n');
}

// Smart routing: dato il draft + suggested_action dell'agente,
// decide se auto-send o notify-host. Hardcoded thresholds tunable.
export function decideRouting(
  output: DraftOutput,
  options: { waChannelLive?: boolean } = {},
): 'auto_send' | 'notify_host' | 'escalate' {
  if (output.classification === 'emergency') return 'escalate';
  if (
    output.confidence > 0.85 &&
    (output.classification === 'info_request' || output.classification === 'small_talk') &&
    options.waChannelLive
  ) {
    return 'auto_send';
  }
  return 'notify_host';
}
