// Classifier deterministico per email Booking.com tipo "messaggio ospite"
// (slice 7a.2).
//
// Strategia: zero AI. Le email Booking di tipo messaggio sono ancora piu'
// data-poor delle email di prenotazione (vedi docs/booking-strategy.md
// §1.3). Il subject contiene tipicamente:
//   - "Booking.com - Hai un nuovo messaggio da [NomeOspite]" (it)
//   - "Booking.com - Hai ricevuto un messaggio da [NomeOspite]" (it variant)
//   - "Booking.com - You have a new message from [GuestName]" (en)
//   - "Booking.com - New message from [GuestName] (NNNNN, ...)" (en variant)
//
// Body NON contiene il testo del messaggio nel ~70-80% dei casi (solo
// trigger "Open extranet to read"). Nel restante ~20-30% c'e' una preview
// 200-400 char. La preview non e' garantita, va estratta opportunisticamente.
//
// Reply-To = `noreply@booking.com`: bidirezionalita' email impossibile.
//
// Output: BookingMessageClassification con:
//   - type: 'message' | 'not_message'
//   - senderName: nome ospite estratto dal subject
//   - bookingExternalCode: se presente nel subject (alcuni template lo
//     includono come "(NNNNN, ...)", altri no)

export type BookingMessageClassification =
  | {
      type: 'message';
      senderName: string;
      bookingExternalCode: string | null;
      rawSubject: string;
    }
  | {
      type: 'not_message';
      rawSubject: string;
    };

// Pattern subject Booking message. Case-insensitive.
// Italiano:  "Booking.com - Hai un nuovo messaggio da Mario Rossi"
//            "Booking.com - Hai ricevuto un messaggio da Mario Rossi"
// Inglese:   "Booking.com - You have a new message from Mario Rossi"
//            "Booking.com - New message from Mario Rossi (1234567, abc)"
//
// Strategia: 1 regex anchored sul prefix "Booking.com - " + token
// "messaggio|message" + estrazione NomeOspite con capture group.
const BOOKING_MESSAGE_RE =
  /^Booking\.com\s*-\s*(?:Hai\s+(?:un\s+nuovo|ricevuto\s+un)\s+messaggio\s+da|You\s+have\s+a\s+new\s+message\s+from|New\s+message\s+from)\s+([^\s].*?)(?:\s*\(\d+|\s*$)/i;

const CODE_RE = /\((\d+)[,)]/;

export function classifyBookingMessage(subject: string): BookingMessageClassification {
  const rawSubject = subject ?? '';
  const m = BOOKING_MESSAGE_RE.exec(rawSubject);
  if (!m) {
    return { type: 'not_message', rawSubject };
  }
  const senderName = (m[1] ?? '').trim();
  if (!senderName) {
    // Match strutturale ma senza nome estratto: trattiamo come not_message
    // per evitare di persistere row anonime.
    return { type: 'not_message', rawSubject };
  }
  const codeMatch = CODE_RE.exec(rawSubject);
  return {
    type: 'message',
    senderName,
    bookingExternalCode: codeMatch?.[1] ?? null,
    rawSubject,
  };
}

// Best-effort body extraction. Booking notifiche tipicamente hanno una
// struttura HTML rigida con un blockquote o paragraph contenente il
// preview. Strategie tentate in ordine:
//   1. Regex blockquote: <blockquote>...</blockquote>
//   2. Regex preview-text: dato che Booking usa un container <td class="...">
//      con il body. Pattern generico: cerca <p> dopo "messaggio" / "message"
//      nell'HTML.
//   3. Fallback su textBody se l'HTML non e' parsabile.
//
// Truncation: l'output e' max 800 char (preview Gmail snippet sono ~200,
// blockquote completi possono essere fino a ~500). Oltre, troncamento con
// suffisso "...". Se non si estrae nulla, restituisce null.

export type BookingMessagePreviewExtraction = {
  preview: string | null;
  truncated: boolean;
  signalOnly: boolean;
};

const MAX_PREVIEW_CHARS = 800;

export function extractBookingMessagePreview(
  htmlBody: string,
  textBody: string,
  snippet: string,
): BookingMessagePreviewExtraction {
  // Strategia 1: blockquote nel HTML.
  const bq = /<blockquote[^>]*>([\s\S]*?)<\/blockquote>/i.exec(htmlBody);
  if (bq?.[1]) {
    const cleaned = stripHtml(bq[1]).trim();
    if (cleaned.length > 20) {
      return formatPreview(cleaned);
    }
  }

  // Strategia 2: text body se contiene piu' di 50 char di "vero" testo
  // (escluso boilerplate Booking). Heuristic: la prima riga lunga >= 50
  // char dopo "Messaggio" / "Message" intestazione.
  const textLines = textBody
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const headerIdx = textLines.findIndex((l) =>
    /^(messaggio|message|messaggio dell'ospite|guest message)\b/i.test(l),
  );
  if (headerIdx >= 0) {
    // Concatena le righe successive fino a un separator (linea vuota
    // virtuale gia' filtrata dal filter(Boolean) sopra) o boilerplate.
    const after = textLines.slice(headerIdx + 1).filter((l) => !isBookingBoilerplate(l));
    const joined = after.join(' ').trim();
    if (joined.length >= 30) {
      return formatPreview(joined);
    }
  }

  // Strategia 3: snippet Gmail come fallback. E' sempre presente, ma
  // puo' contenere boilerplate. Se contiene "Apri extranet" / "Open
  // extranet" lo classifichiamo signal-only.
  if (snippet) {
    if (isSignalOnlySnippet(snippet)) {
      return { preview: null, truncated: false, signalOnly: true };
    }
    return formatPreview(snippet);
  }

  return { preview: null, truncated: false, signalOnly: true };
}

function formatPreview(text: string): BookingMessagePreviewExtraction {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  if (collapsed.length === 0) {
    return { preview: null, truncated: false, signalOnly: true };
  }
  if (collapsed.length <= MAX_PREVIEW_CHARS) {
    return { preview: collapsed, truncated: false, signalOnly: false };
  }
  return {
    preview: `${collapsed.slice(0, MAX_PREVIEW_CHARS)}...`,
    truncated: true,
    signalOnly: false,
  };
}

const SIGNAL_ONLY_RE =
  /(apri\s+extranet|apri\s+pulse|open\s+extranet|read\s+(in|on)\s+extranet|reply\s+(in|on)\s+extranet|leggilo\s+su\s+extranet)/i;

function isSignalOnlySnippet(snippet: string): boolean {
  return SIGNAL_ONLY_RE.test(snippet);
}

const BOILERPLATE_PATTERNS = [
  /^Booking\.com/i,
  /^For your safety/i,
  /^Per la tua sicurezza/i,
  /^This message was sent/i,
  /^Apri extranet/i,
  /^Open Extranet/i,
  /^Per rispondere/i,
  /^To reply/i,
  /^Risposta:/i,
];

function isBookingBoilerplate(line: string): boolean {
  return BOILERPLATE_PATTERNS.some((re) => re.test(line));
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}
