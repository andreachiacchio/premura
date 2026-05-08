import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

// ─────────────────────────────────────────────────────────────
// Slice B — Survey conductor agent (pre-arrival).
//
// Conduce conversazione 3-domande WhatsApp con guest pre-check-in:
//  1. Occasione speciale? (anniversary/birthday/honeymoon/business/family/other/none)
//  2. Allergie / preferenze alimentari?
//  3. Cosa farebbe piacere trovare in casa? (free text)
//
// Stato survey gestito dal caller (apps/web survey-pipeline.ts):
//  - Conversation history passata come input
//  - Agent ritorna NEXT MESSAGE + extracted fields aggiornati + flag completed
//  - Caller persiste in guest_quizzes (responses + conversation_messages)
//
// Modello: Sonnet 4.6 con tool_use forzato (output strutturato).
// Cost stimato: ~€0.004 per turn (system + history ~1500 token, output ~200).
// ─────────────────────────────────────────────────────────────

const MODEL = process.env.CLAUDE_MODEL_PRIMARY ?? 'claude-sonnet-4-6';

const SPECIAL_OCCASION_VALUES = [
  'anniversary',
  'birthday',
  'honeymoon',
  'business',
  'family',
  'other',
  'none',
] as const;
export type SpecialOccasion = (typeof SPECIAL_OCCASION_VALUES)[number];

const surveyResponseSchema = z.object({
  message: z
    .string()
    .min(1)
    .max(800)
    .describe('Prossimo messaggio da inviare al guest. Lingua = lingua input.'),
  extracted: z
    .object({
      specialOccasion: z.enum(SPECIAL_OCCASION_VALUES).optional(),
      foodAllergies: z.string().max(500).optional(),
      preferences: z.string().max(500).optional(),
    })
    .describe(
      'Fields estratti dalla risposta del guest. Includi solo i campi appena raccolti in questo turn (merge con stato precedente lo fa il caller).',
    ),
  completed: z
    .boolean()
    .describe(
      "true SOLO se hai raccolto tutte e 3 le info (specialOccasion + foodAllergies + preferences) e hai detto al guest che la survey e' finita.",
    ),
  declined: z
    .boolean()
    .describe(
      "true SOLO se il guest ha esplicitamente rifiutato di rispondere ('non voglio', 'non interessa', 'stop'). Non set true per silenzio o evasivita'.",
    ),
});

export type SurveyTurn = {
  role: 'guest' | 'premura';
  content: string;
};

export type SurveyAgentInput = {
  language: 'it' | 'en';
  guestFirstName: string;
  hostName: string;
  propertyName: string;
  conversation: SurveyTurn[]; // turn-by-turn cronologico
  // Stato extracted progressivo: gia' raccolti in turni precedenti.
  alreadyExtracted: {
    specialOccasion?: SpecialOccasion;
    foodAllergies?: string;
    preferences?: string;
  };
};

export type SurveyAgentOutput = {
  message: string;
  extracted: {
    specialOccasion?: SpecialOccasion;
    foodAllergies?: string;
    preferences?: string;
  };
  completed: boolean;
  declined: boolean;
};

const SYSTEM_PROMPT_IT = `Sei Premura, assistente AI per host hospitality italiani. Stai conducendo una survey pre-arrivo via WhatsApp con un guest in arrivo a {propertyName} (host: {hostName}).

Devi raccogliere 3 informazioni:
1. specialOccasion: e' un'occasione speciale? Mappa la risposta in: anniversary | birthday | honeymoon | business | family | other | none.
2. foodAllergies: ci sono allergie o preferenze alimentari?
3. preferences: cosa farebbe piacere trovare in casa? (caffe', te', dolci, vino, frutta, niente, altro — testo libero)

Conversa in italiano naturale. UNA domanda per volta. Riformula in base alla risposta. Se il guest divaga, riportalo gentilmente alla domanda. Massimo 1-2 emoji nel messaggio finale di chiusura — niente nel resto.

Tono: caldo, professionale, italiano hospitality. NIENTE sales talk. NIENTE link. NIENTE call-to-action su altri servizi. La survey e' un piacere, non un obbligo.

IMPORTANTE:
- Ogni turn devi solo emettere il prossimo messaggio per il guest, NON multi-turn nello stesso output.
- Set completed=true SOLO quando hai raccolto tutte e 3 le info E hai gia' ringraziato il guest.
- Set declined=true SOLO se il guest dice esplicitamente "non voglio rispondere" / "non interessa" / "stop".
- Lingua output: italiano (sei in IT-prompt).

Stato gia' raccolto:
{alreadyExtracted}

Cronologia conversazione:
{conversation}

Genera il prossimo messaggio + i fields estratti dall'ultimo turno guest (se presente).`;

const SYSTEM_PROMPT_EN = `You are Premura, an AI assistant for Italian short-rental hosts. You are conducting a pre-arrival survey over WhatsApp with a guest arriving at {propertyName} (host: {hostName}).

You need to collect 3 things:
1. specialOccasion: is it a special occasion? Map answer to: anniversary | birthday | honeymoon | business | family | other | none.
2. foodAllergies: any food allergies or dietary preferences?
3. preferences: anything they would love to find at the apartment? (coffee, tea, sweets, wine, fruit, nothing, other — free text)

Converse naturally in English (translate Italian hospitality warmth, don't translate words literally). ONE question per turn. Rephrase based on the answer. If guest digresses, gently steer back. Maximum 1-2 emoji in the closing message — none elsewhere.

Tone: warm, professional, Italian hospitality. NO sales talk. NO links. NO calls-to-action on other services. The survey is a pleasure, not an obligation.

IMPORTANT:
- Each turn output only the next message for the guest, NOT multi-turn in the same output.
- Set completed=true ONLY when you have collected all 3 fields AND already thanked the guest.
- Set declined=true ONLY if the guest explicitly says "I don't want to" / "not interested" / "stop".
- Output language: English (you are in EN-prompt).

Already collected:
{alreadyExtracted}

Conversation history:
{conversation}

Generate the next message + fields extracted from the last guest turn (if present).`;

export async function conductSurveyTurn(input: SurveyAgentInput): Promise<SurveyAgentOutput> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }
  const client = new Anthropic({ apiKey });

  const promptTpl = input.language === 'en' ? SYSTEM_PROMPT_EN : SYSTEM_PROMPT_IT;
  const conversationStr = input.conversation.map((t) => `[${t.role}] ${t.content}`).join('\n');
  const alreadyStr = JSON.stringify(input.alreadyExtracted, null, 2);
  const systemPrompt = promptTpl
    .replace('{propertyName}', input.propertyName)
    .replace('{hostName}', input.hostName)
    .replace('{conversation}', conversationStr || '(none yet)')
    .replace('{alreadyExtracted}', alreadyStr);

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 600,
    system: [
      {
        type: 'text',
        text: systemPrompt,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: 'Genera il prossimo turn (message + extracted + completed + declined).',
      },
    ],
    tools: [
      {
        name: 'emit_survey_turn',
        description:
          'Emette il prossimo messaggio della survey + extracted fields + flag completed/declined.',
        input_schema: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            extracted: {
              type: 'object',
              properties: {
                specialOccasion: {
                  type: 'string',
                  enum: SPECIAL_OCCASION_VALUES as unknown as string[],
                },
                foodAllergies: { type: 'string' },
                preferences: { type: 'string' },
              },
            },
            completed: { type: 'boolean' },
            declined: { type: 'boolean' },
          },
          required: ['message', 'extracted', 'completed', 'declined'],
        },
      },
    ],
    tool_choice: { type: 'tool', name: 'emit_survey_turn' },
  });

  const toolUse = response.content.find((c) => c.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new Error('survey-conductor: no tool_use in response');
  }
  const parsed = surveyResponseSchema.parse(toolUse.input);
  return parsed;
}

// Helper: determina se la survey e' completa data una mappa di responses
// gia' estratte. Usato dal caller post-merge per decidere se cerare il
// completion event o continuare il turn.
export function isSurveyComplete(extracted: SurveyAgentInput['alreadyExtracted']): boolean {
  return (
    extracted.specialOccasion !== undefined &&
    extracted.foodAllergies !== undefined &&
    extracted.preferences !== undefined
  );
}
