import { createHmac, timingSafeEqual } from 'node:crypto';

// Token ospite per le pagine pubbliche non-survey (catalogo servizi,
// gestione consenso).
//
// Formato identico a survey-token.ts, con una differenza sostanziale:
// il payload porta un campo `pur` (purpose). Un token emesso per il
// catalogo non deve poter aprire il survey e viceversa — senza il
// purpose, la stessa firma varrebbe ovunque e un link condiviso
// darebbe accesso a superfici non previste.
//
// Secret: GUEST_TOKEN_SECRET (min 32 byte), distinta da
// SURVEY_TOKEN_SECRET: la compromissione di una non compromette l'altra.

export type GuestTokenPurpose = 'services' | 'consent';

export type GuestTokenPayload = {
  bid: string; // bookingId
  pur: GuestTokenPurpose;
  exp: number; // unix seconds
  iat: number; // unix seconds
};

const HEADER = { alg: 'HS256', typ: 'JWT' };
const HEADER_B64 = base64UrlEncode(JSON.stringify(HEADER));

function getSecret(): Buffer {
  const s = process.env.GUEST_TOKEN_SECRET;
  if (!s || s.length < 32) {
    throw new Error('GUEST_TOKEN_SECRET non configurato (min 32 char)');
  }
  return Buffer.from(s, 'utf8');
}

export function signGuestToken(
  bookingId: string,
  purpose: GuestTokenPurpose,
  expiresAtMs: number,
): string {
  const payload: GuestTokenPayload = {
    bid: bookingId,
    pur: purpose,
    exp: Math.floor(expiresAtMs / 1000),
    iat: Math.floor(Date.now() / 1000),
  };
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const data = `${HEADER_B64}.${payloadB64}`;
  const sig = createHmac('sha256', getSecret()).update(data).digest();
  return `${data}.${base64UrlEncodeBuf(sig)}`;
}

export type VerifyGuestTokenResult =
  | { ok: true; payload: GuestTokenPayload }
  | {
      ok: false;
      reason: 'invalid_format' | 'invalid_signature' | 'expired' | 'invalid_payload' | 'wrong_purpose';
    };

/**
 * @param expectedPurpose scopo atteso dalla pagina chiamante. Un token
 *        valido ma emesso per un altro scopo viene rifiutato.
 */
export function verifyGuestToken(
  token: string,
  expectedPurpose: GuestTokenPurpose,
): VerifyGuestTokenResult {
  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'invalid_format' };
  const [headerB64, payloadB64, sigB64] = parts;
  if (!headerB64 || !payloadB64 || !sigB64) return { ok: false, reason: 'invalid_format' };
  if (headerB64 !== HEADER_B64) return { ok: false, reason: 'invalid_format' };

  const data = `${headerB64}.${payloadB64}`;
  const expected = createHmac('sha256', getSecret()).update(data).digest();
  const provided = base64UrlDecodeBuf(sigB64);
  if (!provided || provided.length !== expected.length) {
    return { ok: false, reason: 'invalid_signature' };
  }
  if (!timingSafeEqual(expected, provided)) return { ok: false, reason: 'invalid_signature' };

  let payload: GuestTokenPayload;
  try {
    const decoded = base64UrlDecodeStr(payloadB64);
    if (!decoded) return { ok: false, reason: 'invalid_payload' };
    payload = JSON.parse(decoded);
  } catch {
    return { ok: false, reason: 'invalid_payload' };
  }

  if (typeof payload.bid !== 'string' || typeof payload.exp !== 'number') {
    return { ok: false, reason: 'invalid_payload' };
  }
  // Purpose verificato PRIMA della scadenza: un token per lo scopo
  // sbagliato è sbagliato a prescindere da quando è stato emesso.
  if (payload.pur !== expectedPurpose) return { ok: false, reason: 'wrong_purpose' };
  if (Math.floor(Date.now() / 1000) > payload.exp) return { ok: false, reason: 'expired' };

  return { ok: true, payload };
}

function base64UrlEncode(s: string): string {
  return base64UrlEncodeBuf(Buffer.from(s, 'utf8'));
}

function base64UrlEncodeBuf(b: Buffer): string {
  return b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecodeStr(s: string): string | null {
  const buf = base64UrlDecodeBuf(s);
  return buf ? buf.toString('utf8') : null;
}

function base64UrlDecodeBuf(s: string): Buffer | null {
  try {
    const padded = s.replace(/-/g, '+').replace(/_/g, '/');
    const padding = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
    return Buffer.from(padded + padding, 'base64');
  } catch {
    return null;
  }
}
