import { isValidPhoneNumber, parsePhoneNumberFromString } from 'libphonenumber-js';

// Slice A — Normalizzazione numeri telefono in E.164.
//
// Input flessibile dall'host: "+39 333 1234567", "0033 612345678",
// "+393331234567", "338 39 63307" (locale italiano implicito).
// Output: stringa E.164 con '+' iniziale, senza spazi.
//
// Default country: 'IT' (host pilot italiano). Quando il numero non
// inizia con '+' ne con prefisso internazionale (00...), libphonenumber
// assume IT e prepende +39.
//
// Validazione: usa isValidPhoneNumber dopo il parse. Numeri che non
// passano il check (lunghezza errata, prefisso inesistente) ritornano
// null.

const DEFAULT_COUNTRY = 'IT';

export type PhoneNormalizeResult =
  | { ok: true; e164: string }
  | { ok: false; reason: 'empty' | 'invalid_format' | 'invalid_number' };

export function normalizePhone(raw: string): PhoneNormalizeResult {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { ok: false, reason: 'empty' };
  }
  // Scarta input troppo corti pre-parsing per evitare crash su edge case.
  // Numeri E.164 sono 8-15 cifre.
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) {
    return { ok: false, reason: 'invalid_format' };
  }
  const parsed = parsePhoneNumberFromString(trimmed, DEFAULT_COUNTRY);
  if (!parsed) {
    return { ok: false, reason: 'invalid_format' };
  }
  if (!isValidPhoneNumber(parsed.number, parsed.country)) {
    return { ok: false, reason: 'invalid_number' };
  }
  return { ok: true, e164: parsed.number };
}

// Helper formato visuale: "+39 333 123 4567" per output card.
// Non per persistenza (DB ha sempre E.164).
export function formatPhoneDisplay(e164: string): string {
  const parsed = parsePhoneNumberFromString(e164);
  return parsed?.formatInternational() ?? e164;
}
