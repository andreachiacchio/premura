// Classifier deterministico per email Airbnb tipo "messaggio ospite"
// (slice 7a.2). Pre-step prima del parser AI Sonnet 4.6.
//
// A differenza di Booking, Airbnb manda il body messaggio INCLUSO nel template
// HTML della notifica (per consentire reply diretta). Il classifier qui
// si limita a riconoscere subject pattern; l'estrazione del body avviene poi
// in airbnb-message-parser.ts (Claude AI).
//
// Pattern subject Airbnb message (italiano + inglese):
//   - "Nuovo messaggio da [NomeOspite]"
//   - "Hai un nuovo messaggio da [NomeOspite]"
//   - "[NomeOspite] ti ha inviato un messaggio"
//   - "New message from [GuestName]"
//   - "[GuestName] sent you a message"
//   - "You have a new message from [GuestName]"
//
// Note importante: Airbnb manda anche email di tipo "richiesta prenotazione",
// "promemoria recensione", "saldo da pagare" che NON sono messaggi ospite.
// Il classifier qui filtra solo i messaggi guest -> host genuini.

export type AirbnbMessageClassification =
  | {
      type: 'message';
      senderName: string;
      rawSubject: string;
    }
  | {
      type: 'not_message';
      rawSubject: string;
    };

// Pattern subject (case-insensitive). Multi-shape: il nome puo' apparire
// dopo "da/from" oppure prima di "ti ha inviato/sent you".
const PATTERN_AFTER = [
  /^(?:Nuovo|Hai\s+un\s+nuovo)\s+messaggio\s+da\s+(.+?)(?:\s*(?:su|on|via)\s+Airbnb)?$/i,
  /^(?:You\s+have\s+a\s+new|New)\s+message\s+from\s+(.+?)(?:\s+\(.+\))?$/i,
];

const PATTERN_BEFORE = [
  /^(.+?)\s+ti\s+ha\s+(?:inviato|scritto)\s+un\s+messaggio/i,
  /^(.+?)\s+sent\s+you\s+a\s+message/i,
];

export function classifyAirbnbMessage(subject: string): AirbnbMessageClassification {
  const rawSubject = (subject ?? '').trim();
  if (rawSubject.length === 0) {
    return { type: 'not_message', rawSubject };
  }

  for (const re of PATTERN_AFTER) {
    const m = re.exec(rawSubject);
    if (m?.[1]) {
      const name = m[1].trim();
      if (name.length > 0 && !looksLikeBoilerplate(name)) {
        return { type: 'message', senderName: name, rawSubject };
      }
    }
  }

  for (const re of PATTERN_BEFORE) {
    const m = re.exec(rawSubject);
    if (m?.[1]) {
      const name = m[1].trim();
      if (name.length > 0 && !looksLikeBoilerplate(name)) {
        return { type: 'message', senderName: name, rawSubject };
      }
    }
  }

  return { type: 'not_message', rawSubject };
}

function looksLikeBoilerplate(name: string): boolean {
  // Filtra falsi positivi tipo "Airbnb", "Update da Airbnb", "L'ospite"
  // che non sono veri nomi.
  const lower = name.toLowerCase();
  return (
    lower === 'airbnb' ||
    lower.includes('update') ||
    lower.includes('reminder') ||
    lower.includes('promemoria') ||
    lower === "l'ospite" ||
    lower === 'guest' ||
    lower.length < 2
  );
}
