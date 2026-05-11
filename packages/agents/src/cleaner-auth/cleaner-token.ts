import { createHmac, timingSafeEqual } from 'node:crypto';

// Slice D — Cleaner token signed (HS256-style, riusa pattern survey-token).
//
// Formato: base64url(header).base64url(payload).base64url(hmac)
// Payload: { cid, exp, iat }
//   cid = cleanerId (uuid)
//   exp = unix seconds epoch
//   iat = unix seconds epoch
//
// Secret: CLEANER_TOKEN_SECRET env var. Min 32 byte.
// TTL default: 30 giorni (configurable per call).

export type CleanerTokenPayload = {
  cid: string;
  exp: number;
  iat: number;
};

const HEADER = { alg: 'HS256', typ: 'JWT' };
const HEADER_B64 = base64UrlEncode(JSON.stringify(HEADER));

const DEFAULT_TTL_DAYS = 30;

function getSecret(): Buffer {
  const s = process.env.CLEANER_TOKEN_SECRET;
  if (!s || s.length < 32) {
    throw new Error('CLEANER_TOKEN_SECRET non configurato (min 32 char)');
  }
  return Buffer.from(s, 'utf8');
}

export function signCleanerToken(cleanerId: string, ttlDays: number = DEFAULT_TTL_DAYS): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: CleanerTokenPayload = {
    cid: cleanerId,
    exp: now + ttlDays * 24 * 3600,
    iat: now,
  };
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const data = `${HEADER_B64}.${payloadB64}`;
  const sig = createHmac('sha256', getSecret()).update(data).digest();
  return `${data}.${base64UrlEncodeBuf(sig)}`;
}

export type VerifyCleanerTokenResult =
  | { ok: true; payload: CleanerTokenPayload }
  | { ok: false; reason: 'invalid_format' | 'invalid_signature' | 'expired' | 'invalid_payload' };

export function verifyCleanerToken(token: string): VerifyCleanerTokenResult {
  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'invalid_format' };
  const [headerB64, payloadB64, sigB64] = parts;
  if (!headerB64 || !payloadB64 || !sigB64) {
    return { ok: false, reason: 'invalid_format' };
  }
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

  let payload: CleanerTokenPayload;
  try {
    const decoded = base64UrlDecodeStr(payloadB64);
    if (!decoded) return { ok: false, reason: 'invalid_payload' };
    payload = JSON.parse(decoded);
  } catch {
    return { ok: false, reason: 'invalid_payload' };
  }
  if (typeof payload.cid !== 'string' || typeof payload.exp !== 'number') {
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
