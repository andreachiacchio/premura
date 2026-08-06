import { runClaude } from '@premura/shared';
import type { DnaSignals, DnaRisk, KitItem } from '@premura/db';

export type MessageStage =
  | 'pre_arrival' // 24-48h prima, tono caldo, anticipa info chiave e sorpresa
  | 'welcome_day' // mattina del check-in, dettagli pratici
  | 'day2_checkin' // sera del giorno 2, check-in emotivo
  | 'post_stay_recovery' // 24h dopo checkout, private feedback request
  | 'cleaner_brief'; // per la donna delle pulizie, NON per l'ospite

export type MessageInput = {
  stage: MessageStage;
  dna: {
    archetype: string;
    signals: DnaSignals;
    risks: DnaRisk[];
  };
  booking: {
    guestFirstName: string;
    checkinAt: Date;
    checkoutAt: Date;
    nights: number;
  };
  property: {
    name: string;
    city: string;
  };
  kit?: {
    items: KitItem[];
    cardMessage: string;
  };
  extra?: Record<string, string>; // e.g. cleanerName, wifiPassword, accessCode
};

export type MessageOutput = {
  body: string;
  reasoning: string;
  costUsd: number;
  model: string;
};

// ===== STAGE-SPECIFIC PROMPTS =====
// Each stage has its own system prompt. Keep them surgically focused.

const STAGE_PROMPTS: Record<MessageStage, string> = {
  pre_arrival: `Sei l'agente Message Writer di Premura, stage: PRE-ARRIVO (24-48h prima del check-in).

Scrivi UN messaggio breve (3-5 frasi, max 400 caratteri) per l'ospite.

OBIETTIVI

1. Far sentire l'ospite atteso e speciale
2. Anticipare UN rischio specifico dal DNA (quello più alto), disinnescandolo con framing positivo
3. Accennare a una sorpresa in arrivo SENZA svelare il kit
4. Zero istruzioni logistiche (codici, wifi, etc.) - quelli vengono dopo

STILE

- Lingua: quella in signals.languagePrimary se presente, altrimenti italiano
- Tono: secondo signals.tone
- Firma: "Il team di [nome struttura]" o equivalente caldo
- Zero emoji eccessive (max 1)
- Autentico, mai markettese

ESEMPIO per ospite olandese con rischio "rumore":
"Ciao Anna, non vediamo l'ora di accoglierti domani a La goccia di S.Gennaro. Il centro storico di Napoli ha un'anima viva che a volte si sente anche di notte — abbiamo pensato a un piccolo dettaglio per farti dormire sereno. A domani, il team di La goccia."`,

  welcome_day: `Sei l'agente Message Writer stage: WELCOME (mattina del check-in, 2-3h prima dell'ora prevista).

Scrivi UN messaggio molto breve (max 300 caratteri) con:

1. Conferma che tutto è pronto
2. Ora check-in confermata
3. UN dettaglio pratico critico (codice porta / indirizzo preciso / parking)
4. Invito a chiedere tutto quello che serve

Niente filosofia. Funzionale, caldo, breve.`,

  day2_checkin: `Sei l'agente Message Writer stage: DAY 2 CHECK-IN (sera del giorno 2 del soggiorno).

Scrivi UN messaggio molto breve (max 200 caratteri) per chiedere come va, in modo naturale.

REGOLE

- NON sembrare un bot di customer service
- Usa il nome dell'ospite
- Domanda aperta ma leggera (es. "Come sta andando?")
- Riferimento specifico a qualcosa (il quartiere, il tempo, la cena consigliata) basato su signals
- Invito a scrivere se serve qualsiasi cosa
- Nessuna vendita, nessun upsell`,

  post_stay_recovery: `Sei l'agente Message Writer stage: POST-STAY RECOVERY (24h dopo checkout, PRIMA della recensione pubblica).

Scrivi UN messaggio per chiedere feedback PRIVATO.

OBIETTIVI

1. Ringraziare per il soggiorno
2. Invitare a condividere feedback onesto (privatamente, non recensione)
3. Aprire la porta a problemi mai menzionati
4. Se feedback positivo → nudge gentile verso recensione pubblica
5. Se tono del soggiorno sembra positivo, si può accennare a sconto per ritorno

STILE

- Max 500 caratteri
- Tono grato, umile, genuino
- Link placeholder: "[LINK_FEEDBACK]" (l'app sostituirà)`,

  cleaner_brief: `Sei l'agente Message Writer stage: CLEANER BRIEF.

Scrivi UN messaggio WhatsApp per la donna delle pulizie della struttura.

CONTENUTO

1. Quando arriva il prossimo ospite (data + ora)
2. Composizione gruppo (es. "coppia olandese, 3 notti")
3. UNA attenzione specifica dal DNA (es. "è molto attenta alla pulizia del bagno")
4. Dettagli del kit che arriverà a casa sua e come sistemarlo
5. Conferma del compenso per questo kit

STILE

- Italiano semplice e diretto
- Max 600 caratteri
- Tono collega, non corporate. La cleaner è parte del team.
- Nessun emoji di troppo
- Chiedi conferma con "Mi confermi con un OK?"`,
};

// ===== MAIN =====

export async function writeMessage(input: MessageInput): Promise<MessageOutput> {
  const system = STAGE_PROMPTS[input.stage];
  const userMessage = buildMessageContext(input);

  // Fast model is enough for message writing; Opus for day2+recovery (nuance matters)
  const model = input.stage === 'day2_checkin' || input.stage === 'post_stay_recovery'
    ? 'opus' as const
    : 'fast' as const;

  const result = await runClaude({
    model,
    system,
    messages: [{ role: 'user', content: userMessage }],
    maxTokens: 500,
    temperature: 0.7,
  });

  return {
    body: result.text.trim(),
    reasoning: `Model ${model}, stage ${input.stage}`,
    costUsd: result.costUsd,
    model: result.model,
  };
}

function buildMessageContext(input: MessageInput): string {
  const { stage, dna, booking, property, kit, extra } = input;

  const lines: string[] = [
    `# Stage: ${stage}`,
    '',
    '# Guest',
    `Nome: ${booking.guestFirstName}`,
    `Archetipo: ${dna.archetype}`,
    `Signals: ${JSON.stringify(dna.signals)}`,
    `Rischi: ${dna.risks.map((r) => `${r.title} [${r.level}]`).join('; ')}`,
    '',
    '# Booking',
    `Check-in: ${booking.checkinAt.toISOString()}`,
    `Check-out: ${booking.checkoutAt.toISOString()}`,
    `Notti: ${booking.nights}`,
    '',
    '# Property',
    `Nome: ${property.name}`,
    `Città: ${property.city}`,
  ];

  if (kit) {
    lines.push('', '# Kit che sta per arrivare');
    for (const item of kit.items) {
      lines.push(`- ${item.qty}× ${item.name}`);
    }
    lines.push(`Biglietto: "${kit.cardMessage}"`);
  }

  if (extra) {
    lines.push('', '# Extra context');
    for (const [k, v] of Object.entries(extra)) {
      lines.push(`${k}: ${v}`);
    }
  }

  lines.push('', '# Task', 'Scrivi il messaggio finale. Rispondi SOLO con il testo del messaggio, senza virgolette e senza preamble.');
  return lines.join('\n');
}
