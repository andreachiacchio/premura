// Classifier deterministico per email Booking.com (M2a.3 Fase 3).
//
// Strategia: zero AI, zero fuzzy. Le email Booking sono intenzionalmente
// data-poor (subject + link extranet, niente dati strutturati nel body)
// quindi non c'è niente da estrarre con Claude. Le usiamo solo come EVENT
// TRIGGERS, cross-referenziandole con bookings creati via iCal usando
// `booking_external_code`.
//
// Pattern subject (italiano — englishization rimandata a M3):
//   - "Booking.com - Hai una nuova prenotazione! (NNNNN, ...)"        → new_booking
//   - "Booking.com - Nuova prenotazione last minute (NNNNN, ...)"     → new_booking
//   - "Booking.com - Prenotazione cancellata! (NNNNN, ...)"           → cancellation
//   - "Booking.com - Prenotazione modificata! (NNNNN, ...)"           → modification
//   - tutto il resto                                                  → noise
//
// Il numero Booking è un intero estratto da `(NNNNN[,)]`.

export type BookingEmailEventType =
  | 'new_booking'
  | 'cancellation'
  | 'modification'
  | 'noise';

export type ClassifiedBookingEmail = {
  eventType: BookingEmailEventType;
  bookingExternalCode: string | null;
  /** Data di check-in dal subject, 'YYYY-MM-DD' (Blocco 3, 03/08).
   *  Le email reali hanno "(codice, sabato 18 aprile 2026)": il secondo
   *  campo e' la data di check-in in italiano — e' la chiave che
   *  permette il match con le fasce iCal (gli UID Booking sono hash
   *  opachi, il codice prenotazione non ci arriva mai dall'iCal). */
  checkinDateIso: string | null;
  rawSubject: string;
};

// Mesi italiani → numero. Il giorno della settimana viene ignorato.
const ITALIAN_MONTHS: Record<string, number> = {
  gennaio: 1,
  febbraio: 2,
  marzo: 3,
  aprile: 4,
  maggio: 5,
  giugno: 6,
  luglio: 7,
  agosto: 8,
  settembre: 9,
  ottobre: 10,
  novembre: 11,
  dicembre: 12,
};

const ITALIAN_DATE_RE = /(\d{1,2})\s+([a-zà-ù]+)\s+(\d{4})/i;

/** "sabato 18 aprile 2026" → '2026-04-18'. Null se il testo non e' una
 *  data italiana riconoscibile (es. vecchi subject col nome struttura):
 *  la classificazione resta valida, solo il match per data si spegne. */
export function parseItalianDate(text: string): string | null {
  const m = ITALIAN_DATE_RE.exec(text.trim().toLowerCase());
  if (!m) return null;
  const day = Number(m[1]);
  const month = ITALIAN_MONTHS[m[2]!];
  const year = Number(m[3]);
  if (!month || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// Prefix comune. Caso-insensitive sul match: alcuni client email lasciano
// minuscola, altri capitalizzano "Booking.com".
const BOOKING_PREFIX = /^Booking\.com\s*-\s*/i;

// Estrae il primo numero dentro le parentesi e la coda dopo la virgola:
// "(123456, sabato 18 aprile 2026)" → code "123456", tail "sabato 18...".
const CODE_RE = /\((\d+)(?:,\s*([^)]*))?\)/;

// Pattern subject → event type. L'ordine non conta (sono mutually exclusive),
// usiamo regex distinte per evitare ambiguità future.
const NEW_BOOKING_RE =
  /Hai una nuova prenotazione!|Nuova prenotazione last minute/i;
const CANCELLATION_RE = /Prenotazione cancellata!/i;
const MODIFICATION_RE = /Prenotazione modificata!/i;

export function classifyBookingEmail(subject: string): ClassifiedBookingEmail {
  const rawSubject = subject ?? '';

  // Se il subject non inizia col prefix "Booking.com - " è rumore certo
  // (newsletter, marketing, customer service usano altri prefix).
  if (!BOOKING_PREFIX.test(rawSubject)) {
    return { eventType: 'noise', bookingExternalCode: null, checkinDateIso: null, rawSubject };
  }

  // Restante senza il prefix per matchare la parte significativa.
  const remainder = rawSubject.replace(BOOKING_PREFIX, '');

  let eventType: BookingEmailEventType = 'noise';
  if (NEW_BOOKING_RE.test(remainder)) {
    eventType = 'new_booking';
  } else if (CANCELLATION_RE.test(remainder)) {
    eventType = 'cancellation';
  } else if (MODIFICATION_RE.test(remainder)) {
    eventType = 'modification';
  }

  if (eventType === 'noise') {
    return { eventType, bookingExternalCode: null, checkinDateIso: null, rawSubject };
  }

  // Per eventi riconosciuti il code è atteso. Se manca → eventType resta
  // ma il code è null (l'ingestor reagisce con unmatched).
  const m = CODE_RE.exec(remainder);
  const bookingExternalCode = m ? m[1]! : null;
  const checkinDateIso = m?.[2] ? parseItalianDate(m[2]) : null;

  return { eventType, bookingExternalCode, checkinDateIso, rawSubject };
}
