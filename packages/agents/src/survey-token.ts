import { createHmac, timingSafeEqual } from 'node:crypto';

// Slice B — Survey token signed compatto (HS256-style).
//
// Formato: base64url(header).base64url(payload).base64url(hmac)
// Payload: { bid, exp, iat }
//   bid = bookingId (uuid)
//   exp = unix seconds epoch (token scaduto se now > exp)
//   iat = unix seconds epoch (issued at, audit)
//
// Secret: SURVEY_TOKEN_SECRET env var. Min 32 byte.
//
// Niente jose / jsonwebtoken: implementazione minimal con Node crypto
// per ridurre dependencies (~15 KB di code-budget per la mini web
// app). Verifica timing-safe.

export type SurveyTokenPayload = {
  bid: string; // bookingId
  exp: number; // unix seconds
  iat: number; // unix seconds
};

const HEADER = { alg: 'HS256', typ: 'JWT' };
const HEADER_B64 = base64UrlEncode(JSON.stringify(HEADER));

function getSecret(): Buffer {
  const s = process.env.SURVEY_TOKEN_SECRET;
  if (!s || s.length < 32) {
    throw new Error('SURVEY_TOKEN_SECRET non configurato (min 32 char)');
  }
  return Buffer.from(s, 'utf8');
}

export function signSurveyToken(bookingId: string, expiresAtMs: number): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: SurveyTokenPayload = {
    bid: bookingId,
    exp: Math.floor(expiresAtMs / 1000),
    iat: now,
  };
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const data = `${HEADER_B64}.${payloadB64}`;
  const sig = createHmac('sha256', getSecret()).update(data).digest();
  return `${data}.${base64UrlEncodeBuf(sig)}`;
}

export type VerifyResult =
  | { ok: true; payload: SurveyTokenPayload }
  | { ok: false; reason: 'invalid_format' | 'invalid_signature' | 'expired' | 'invalid_payload' };

export function verifySurveyToken(token: string): VerifyResult {
  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'invalid_format' };
  const [headerB64, payloadB64, sigB64] = parts;
  if (!headerB64 || !payloadB64 || !sigB64) {
    return { ok: false, reason: 'invalid_format' };
  }
  // Header check non strict (alg/typ): accettiamo solo se matcha esattamente.
  if (headerB64 !== HEADER_B64) return { ok: false, reason: 'invalid_format' };

  const data = `${headerB64}.${payloadB64}`;
  const expected = createHmac('sha256', getSecret()).update(data).digest();
  const provided = base64UrlDecodeBuf(sigB64);
  if (!provided || provided.length !== expected.length) {
    return { ok: false, reason: 'invalid_signature' };
  }
  if (!timingSafeEqual(expected, provided)) {
    return { ok: false, reason: 'invalid_signature' };
  }

  let payload: SurveyTokenPayload;
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

  const now = Math.floor(Date.now() / 1000);
  if (now > payload.exp) return { ok: false, reason: 'expired' };

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
  if (!buf) return null;
  return buf.toString('utf8');
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
