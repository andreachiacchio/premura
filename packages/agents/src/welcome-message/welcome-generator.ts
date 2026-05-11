import Anthropic from '@anthropic-ai/sdk';
import type { WelcomeMessageCandidate } from './welcome-finder';

// Slice E — Welcome message generator.
//
// Due path:
//  1. Voice-aware (Sonnet 4.6): se host_voice_profile ha confidence > 0.6
//     componiamo il prompt con voice hints estratti dal profilo (formality,
//     emoji, tone keywords, esempi greeting/closing). Output personalizzato
//     col tono dell'host.
//  2. Template fallback (deterministico): IT/EN ben curato a mano.
//     Variabili: firstName, propertyName, hostFullName, keyboxCode, cardMessage.
//
// CONTEXT.md §5: firma = nome host (o struttura).
// L'ospite deve pensare di parlare con l'host umano. NO "via Premura".
// NO disclaimer AI assistant.

const VOICE_CONFIDENCE_THRESHOLD = 0.6;
const MODEL = process.env.CLAUDE_MODEL_PRIMARY ?? 'claude-sonnet-4-6';

export type VoiceProfileHints = {
  confidence: number;
  formality: 'tu' | 'lei' | 'misto';
  emojiUsage: 'never' | 'sparse' | 'frequent';
  emojiExamples: string[];
  toneKeywords: string[];
  signatureStyle: string | null;
  exampleGreetings: string[];
  exampleClosings: string[];
  avgMessageLength: 'short' | 'medium' | 'long';
};

export type WelcomeMessageInput = WelcomeMessageCandidate & {
  voiceProfile?: VoiceProfileHints | null;
};

export type WelcomeMessageOutput = {
  text: string;
  language: 'it' | 'en';
  hasKeybox: boolean;
  source: 'template' | 'voice_aware_sonnet';
  modelUsed: string | null;
  costUsd: number;
  inputTokens: number | null;
  outputTokens: number | null;
};

export async function generateWelcomeMessage(
  input: WelcomeMessageInput,
): Promise<WelcomeMessageOutput> {
  const language: 'it' | 'en' = input.guestLanguage === 'en' ? 'en' : 'it';
  const firstName = (input.guestFirstName ?? input.guestFullName.split(' ')[0] ?? '').trim();
  const hostName = (input.hostFullName ?? '').trim() || 'il tuo host';
  const propertyName = input.propertyName;
  const cardMessage =
    language === 'en'
      ? (input.cardMessageEn ?? input.cardMessage ?? '')
      : (input.cardMessage ?? '');
  const keyboxCode = input.keyboxCode ?? null;
  const vars: Vars = { firstName, hostName, propertyName, keyboxCode, cardMessage };

  const useVoice =
    !!input.voiceProfile &&
    Number(input.voiceProfile.confidence) > VOICE_CONFIDENCE_THRESHOLD &&
    !!process.env.ANTHROPIC_API_KEY;

  if (useVoice && input.voiceProfile) {
    try {
      const result = await generateWithVoice({
        vars,
        language,
        voice: input.voiceProfile,
      });
      return {
        text: result.text,
        language,
        hasKeybox: !!keyboxCode,
        source: 'voice_aware_sonnet',
        modelUsed: result.model,
        costUsd: result.costUsd,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      };
    } catch {
      // Fallback silent al template (no throw: il messaggio deve partire).
    }
  }

  return {
    text: language === 'en' ? buildEnglish(vars) : buildItalian(vars),
    language,
    hasKeybox: !!keyboxCode,
    source: 'template',
    modelUsed: null,
    costUsd: 0,
    inputTokens: null,
    outputTokens: null,
  };
}

type Vars = {
  firstName: string;
  hostName: string;
  propertyName: string;
  keyboxCode: string | null;
  cardMessage: string;
};

// ─── Template fallback (deterministico) ─────────────────────────────

function buildItalian(v: Vars): string {
  const lines: string[] = [];
  lines.push(v.firstName ? `Buongiorno ${v.firstName} ☀️` : 'Buongiorno ☀️');
  lines.push('');
  lines.push(
    `${v.propertyName} ti aspetta. ${v.hostName} ha preparato un piccolo benvenuto — lo trovi sul tavolo all'arrivo.`,
  );
  if (v.keyboxCode) {
    lines.push('');
    lines.push(`Il codice della keybox è ${v.keyboxCode}.`);
  }
  if (v.cardMessage) {
    lines.push('');
    lines.push(`«${v.cardMessage}»`);
  }
  lines.push('');
  lines.push('Per qualsiasi cosa, scrivi qui. Buon soggiorno.');
  lines.push(`— ${v.hostName}`);
  return lines.join('\n');
}

function buildEnglish(v: Vars): string {
  const lines: string[] = [];
  lines.push(v.firstName ? `Good morning ${v.firstName} ☀️` : 'Good morning ☀️');
  lines.push('');
  lines.push(
    `${v.propertyName} is ready for you. ${v.hostName} prepared a small welcome — you'll find it on the table when you arrive.`,
  );
  if (v.keyboxCode) {
    lines.push('');
    lines.push(`The keybox code is ${v.keyboxCode}.`);
  }
  if (v.cardMessage) {
    lines.push('');
    lines.push(`«${v.cardMessage}»`);
  }
  lines.push('');
  lines.push('For anything at all, just message here. Have a wonderful stay.');
  lines.push(`— ${v.hostName}`);
  return lines.join('\n');
}

// ─── Voice-aware path (Sonnet 4.6) ──────────────────────────────────

async function generateWithVoice(input: {
  vars: Vars;
  language: 'it' | 'en';
  voice: VoiceProfileHints;
}): Promise<{
  text: string;
  model: string;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
}> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');
  const client = new Anthropic({ apiKey });

  const systemPrompt = buildVoiceSystemPrompt(input.language);
  const userMessage = buildVoiceUserMessage({
    vars: input.vars,
    language: input.language,
    voice: input.voice,
  });

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 600,
    temperature: 0.7,
    system: [
      {
        type: 'text',
        text: systemPrompt,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: userMessage }],
  });

  const text = response.content
    .filter((c): c is Anthropic.TextBlock => c.type === 'text')
    .map((c) => c.text)
    .join('\n')
    .trim();

  if (!text) throw new Error('welcome-generator: empty response');

  // Cost calc inline (Sonnet 4.6 pricing: $3/MTok in, $15/MTok out).
  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;
  const costUsd = (inputTokens * 3 + outputTokens * 15) / 1_000_000;

  return { text, model: MODEL, costUsd, inputTokens, outputTokens };
}

function buildVoiceSystemPrompt(language: 'it' | 'en'): string {
  const langInstr =
    language === 'en' ? 'Lingua del messaggio: ENGLISH.' : 'Lingua del messaggio: ITALIANO.';
  return `Sei l'host stesso che scrive un messaggio WhatsApp al guest la mattina del check-in.

NON sei un AI assistant. NON menzionare Premura. NON dire "io sono". Sei l'host.
Il guest deve credere di parlare con l'host umano (CONTEXT.md §5: anti-disintermediazione).

OBIETTIVO
Comporre UN messaggio WhatsApp caldo, breve (max 600 caratteri), mattina del check-in.

CONTENUTO OBBLIGATORIO
1. Greeting con nome guest
2. Conferma che la struttura è pronta + accenno al piccolo benvenuto preparato
3. Codice keybox (se fornito) — esattamente come dato
4. Messaggio del biglietto (se fornito) — citato come scritto
5. Invito ad aprire conversazione "scrivi qui per qualsiasi cosa"
6. Firma con nome host (esattamente come fornito)

REGOLE TONO
- ${langInstr}
- Rispettare il voice profile dell'host (formality, emoji, tone keywords, esempi).
- Naturale, mai markettese. Niente "noi del team", niente "il nostro staff".
- L'host parla in prima persona singolare se formality=tu, plurale di cortesia se lei.
- Emoji: max 1-2, solo se voice.emojiUsage != "never".
- Lunghezza adattata a voice.avgMessageLength (short=2-3 frasi, medium=4-5, long=fino a 7).

OUTPUT
Solo il testo del messaggio finale. Niente preamble, niente virgolette esterne, niente note.`;
}

function buildVoiceUserMessage(input: {
  vars: Vars;
  language: 'it' | 'en';
  voice: VoiceProfileHints;
}): string {
  const { vars, voice } = input;
  const parts: string[] = [];
  parts.push('# Variabili');
  parts.push(`firstName: ${vars.firstName || '(non disponibile)'}`);
  parts.push(`hostFullName: ${vars.hostName}`);
  parts.push(`propertyName: ${vars.propertyName}`);
  if (vars.keyboxCode) parts.push(`keyboxCode: ${vars.keyboxCode}`);
  if (vars.cardMessage) parts.push(`cardMessage: "${vars.cardMessage}"`);

  parts.push('');
  parts.push('# Voice profile host');
  parts.push(`confidence: ${voice.confidence}`);
  parts.push(`formality: ${voice.formality}`);
  parts.push(`emojiUsage: ${voice.emojiUsage}`);
  if (voice.emojiExamples.length) {
    parts.push(`emojiExamples: ${voice.emojiExamples.join(' ')}`);
  }
  if (voice.toneKeywords.length) {
    parts.push(`toneKeywords: ${voice.toneKeywords.join(', ')}`);
  }
  if (voice.signatureStyle) {
    parts.push(`signatureStyle: ${voice.signatureStyle}`);
  }
  parts.push(`avgMessageLength: ${voice.avgMessageLength}`);
  if (voice.exampleGreetings.length) {
    parts.push(`exampleGreetings: ${voice.exampleGreetings.map((g) => `"${g}"`).join(', ')}`);
  }
  if (voice.exampleClosings.length) {
    parts.push(`exampleClosings: ${voice.exampleClosings.map((c) => `"${c}"`).join(', ')}`);
  }

  parts.push('');
  parts.push('# Task');
  parts.push("Scrivi il messaggio WhatsApp finale al guest, nel tono dell'host. Solo il testo.");
  return parts.join('\n');
}
