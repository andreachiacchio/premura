import { z } from 'zod';
import type { Anthropic } from '@anthropic-ai/sdk';
import { runClaude } from '@/utils/claude.js';
import type { DnaSignals, DnaRisk } from '@/db/schema.js';

// ===== INPUT =====

export type GuestDnaInput = {
  guest: {
    fullName: string;
    countryCode?: string;
    ageApprox?: number;
    email?: string;
  };
  booking: {
    platform: 'booking' | 'airbnb';
    checkinAt: Date;
    checkoutAt: Date;
    nights: number;
    numAdults: number;
    numChildren: number;
    totalPriceEur?: number;
    guestNote?: string;
  };
  property: {
    name: string;
    city: string;
    agentNotes?: string;
  };
  enrichment?: {
    // Data pulled by OSINT module before this call
    publicReviewsLeftElsewhere?: Array<{
      text: string;
      scoreOutOf10: number;
      mentions?: string[]; // e.g. ["cleanliness complaint", "liked view"]
    }>;
    professionGuess?: string;
    socialFlags?: string[]; // e.g. ["family_photos", "foodie_account"]
  };
};

// ===== OUTPUT =====

export type GuestDnaOutput = {
  archetype: string;
  archetypeDescription: string;
  signals: DnaSignals;
  risks: DnaRisk[];
  confidence: number; // 0..1
  reasoning: string;
  costUsd: number;
  model: string;
};

// ===== TOOL DEFINITION =====
// We force Claude to emit structured output via a tool call.

const dnaSchema = z.object({
  archetype: z.string().min(3).max(120),
  archetypeDescription: z.string().min(20).max(400),
  signals: z.object({
    profession: z.string().optional(),
    tone: z.enum(['formal_warm', 'casual_warm', 'direct', 'playful']).optional(),
    foodPrefs: z.array(z.string()).optional(),
    pace: z.enum(['early_riser', 'night_owl', 'flexible']).optional(),
    travelPurpose: z.enum(['leisure', 'business', 'romantic', 'family', 'solo']).optional(),
    firstTimeInCity: z.boolean().optional(),
    specialOccasion: z.string().optional(),
    languagePrimary: z.string().optional(),
  }),
  risks: z
    .array(
      z.object({
        code: z.string(),
        title: z.string().max(80),
        level: z.enum(['low', 'medium', 'high']),
        mitigation: z.string().max(200),
      }),
    )
    .min(1)
    .max(5),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().max(800),
});

const DNA_TOOL: Anthropic.Tool = {
  name: 'emit_guest_dna',
  description: 'Return the structured Guest DNA profile for this booking.',
  input_schema: {
    type: 'object' as const,
    properties: {
      archetype: {
        type: 'string',
        description:
          'Short archetype label in Italian, e.g. "Coppia romantica prima volta a Napoli"',
      },
      archetypeDescription: {
        type: 'string',
        description: 'Two to three sentence description in Italian.',
      },
      signals: {
        type: 'object',
        properties: {
          profession: { type: 'string' },
          tone: { type: 'string', enum: ['formal_warm', 'casual_warm', 'direct', 'playful'] },
          foodPrefs: { type: 'array', items: { type: 'string' } },
          pace: { type: 'string', enum: ['early_riser', 'night_owl', 'flexible'] },
          travelPurpose: {
            type: 'string',
            enum: ['leisure', 'business', 'romantic', 'family', 'solo'],
          },
          firstTimeInCity: { type: 'boolean' },
          specialOccasion: { type: 'string' },
          languagePrimary: { type: 'string' },
        },
      },
      risks: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            code: { type: 'string', description: 'Stable machine code, e.g. "noise_sensitivity"' },
            title: { type: 'string', description: 'Short human title in Italian' },
            level: { type: 'string', enum: ['low', 'medium', 'high'] },
            mitigation: {
              type: 'string',
              description: 'Concrete mitigation the agent should execute',
            },
          },
          required: ['code', 'title', 'level', 'mitigation'],
        },
        minItems: 1,
        maxItems: 5,
      },
      confidence: {
        type: 'number',
        description: 'How confident is the DNA given available signals (0-1). <0.7 triggers quiz.',
      },
      reasoning: {
        type: 'string',
        description: 'Short explanation of the inference chain. Used for debugging.',
      },
    },
    required: ['archetype', 'archetypeDescription', 'signals', 'risks', 'confidence', 'reasoning'],
  },
};

// ===== SYSTEM PROMPT =====
// This is the most critical piece of "code" in the system. Modify with care.

const SYSTEM_PROMPT = `Sei l'agente Guest DNA di GiftTube, un concierge AI per host di affitti brevi italiani.

Il tuo compito: dato un ospite in arrivo, produrre un profilo conciso e AZIONABILE che aiuti altri agenti a:
1. Scegliere un kit di benvenuto personalizzato
2. Scrivere messaggi nel tono giusto
3. Anticipare i 3 rischi specifici di recensione bassa

PRINCIPI

- Usa SOLO segnali presenti nei dati forniti. Non inventare. Se manca info, abbassa la confidenza.
- Pattern di nazionalità sono indizi deboli ma validi: olandesi e tedeschi tendono severi su pulizia e rumore; americani apprezzano dettagli di benvenuto caldi; giapponesi vogliono istruzioni iper-precise; francesi valutano rapporto qualità/prezzo.
- Recensioni lasciate altrove sono ORO: se menzionano "rumore" o "pulizia" come lamentele, è rischio alto per questa prenotazione.
- Booking business (1 adulto, 1-2 notti, Lun-Gio, prezzo medio-alto) → archetipo "Business traveler", tono formale, kit essenziale.
- Coppie senza bambini, weekend, alta spesa → potenziale "romantico", controlla se è occasione speciale nel messaggio di prenotazione.
- Famiglie con bambini → priorità kit family-friendly, istruzioni dettagliate.
- Solo backpacker, prezzo basso, 1-2 notti → kit minimale, tono casual, risparmio.

CONFIDENZA

- 0.9+ = dati molto ricchi (recensioni passate, profilo professionale chiaro)
- 0.7-0.89 = pattern solidi da nazionalità + contesto prenotazione
- <0.7 = troppo poco. Triggera il quiz pre-arrivo.

RISCHI

Devi restituire 1-5 rischi. Ogni rischio deve avere:
- code: codice stabile (es. "noise_sensitivity", "cleanliness_strict", "early_arrival_confusion")
- title: in italiano, max 80 caratteri
- level: low|medium|high
- mitigation: AZIONE CONCRETA che un altro agente può eseguire (es. "Lasciare tappi per orecchie e messaggio pre-arrivo su suoni del quartiere")

OUTPUT

Chiama SEMPRE il tool \`emit_guest_dna\`. Non rispondere mai in testo libero.`;

// ===== MAIN FUNCTION =====

export async function generateGuestDna(input: GuestDnaInput): Promise<GuestDnaOutput> {
  const userMessage = buildUserMessage(input);

  const result = await runClaude({
    model: 'opus',
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
    tools: [DNA_TOOL],
    maxTokens: 1500,
    temperature: 0.3,
  });

  const toolCall = result.toolUses.find((t) => t.name === 'emit_guest_dna');
  if (!toolCall) {
    throw new Error('Guest DNA agent did not emit structured output');
  }

  const parsed = dnaSchema.parse(toolCall.input);

  return {
    archetype: parsed.archetype,
    archetypeDescription: parsed.archetypeDescription,
    signals: parsed.signals,
    risks: parsed.risks,
    confidence: parsed.confidence,
    reasoning: parsed.reasoning,
    costUsd: result.costUsd,
    model: result.model,
  };
}

// ===== HELPERS =====

function buildUserMessage(input: GuestDnaInput): string {
  const { guest, booking, property, enrichment } = input;

  const lines: string[] = [
    '# Ospite in arrivo',
    `Nome: ${guest.fullName}`,
    guest.countryCode ? `Paese: ${guest.countryCode}` : null,
    guest.ageApprox ? `Età stimata: ${guest.ageApprox}` : null,
    '',
    '# Prenotazione',
    `Piattaforma: ${booking.platform}`,
    `Check-in: ${booking.checkinAt.toISOString()}`,
    `Check-out: ${booking.checkoutAt.toISOString()}`,
    `Notti: ${booking.nights}`,
    `Adulti: ${booking.numAdults}, Bambini: ${booking.numChildren}`,
    booking.totalPriceEur ? `Prezzo totale: €${booking.totalPriceEur}` : null,
    booking.guestNote ? `Note ospite: "${booking.guestNote}"` : null,
    '',
    '# Struttura',
    `Nome: ${property.name}`,
    `Città: ${property.city}`,
    property.agentNotes ? `Note host: ${property.agentNotes}` : null,
  ].filter((l): l is string => l !== null);

  if (enrichment) {
    lines.push('', '# Arricchimento (OSINT leggero)');
    if (enrichment.professionGuess) {
      lines.push(`Professione probabile: ${enrichment.professionGuess}`);
    }
    if (enrichment.socialFlags?.length) {
      lines.push(`Flag social: ${enrichment.socialFlags.join(', ')}`);
    }
    if (enrichment.publicReviewsLeftElsewhere?.length) {
      lines.push('Recensioni lasciate altrove:');
      for (const r of enrichment.publicReviewsLeftElsewhere) {
        lines.push(`- Score ${r.scoreOutOf10}/10: "${r.text.slice(0, 200)}"`);
        if (r.mentions?.length) {
          lines.push(`  Menzioni chiave: ${r.mentions.join(', ')}`);
        }
      }
    }
  } else {
    lines.push('', '# Arricchimento', 'Nessun dato pubblico trovato. Confidenza ridotta.');
  }

  return lines.join('\n');
}
