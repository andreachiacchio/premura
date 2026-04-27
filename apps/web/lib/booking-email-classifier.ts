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
  rawSubject: string;
};

// Prefix comune. Caso-insensitive sul match: alcuni client email lasciano
// minuscola, altri capitalizzano "Booking.com".
const BOOKING_PREFIX = /^Booking\.com\s*-\s*/i;

// Estrae il primo numero dentro le parentesi: "(123456, abc)" → "123456".
// Accetta numero seguito da virgola o parentesi chiusa.
const CODE_RE = /\((\d+)[,)]/;

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
    return { eventType: 'noise', bookingExternalCode: null, rawSubject };
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
    return { eventType, bookingExternalCode: null, rawSubject };
  }

  // Per eventi riconosciuti il code è atteso. Se manca → eventType resta
  // ma il code è null (l'ingestor reagisce con unmatched).
  const m = CODE_RE.exec(remainder);
  const bookingExternalCode = m ? m[1]! : null;

  return { eventType, bookingExternalCode, rawSubject };
}
