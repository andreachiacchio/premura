import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';

// Slice 6.5.2: JWT validation Fastify per chiamate dirette ad apps/api.
//
// Senza questo middleware, qualunque attaccante che conosca l'URL di un
// endpoint tipo POST /api/bookings/:id/complete-manual puo' fare la
// chiamata bypassando la dashboard Next.js (dove le server action gia'
// fanno pre-check ownership).
//
// Strategia HS256: Supabase firma i JWT degli utenti loggati col
// SUPABASE_JWT_SECRET (visibile in Settings > API > JWT Secret).
// Stesso secret va settato qui come env. Verifica HMAC SHA-256 +
// claim exp.
//
// Esclusioni di default: /health, /health/jobs, /webhooks/* (gia'
// signature-verified). Tutto il resto richiede Bearer JWT.
//
// Decora req.user con { hostId, email } estratto dal claim sub /
// user_metadata. Le route possono usare requireUser(req) per garantire
// la presenza.

export type AuthUser = {
  hostId: string;
  email: string | null;
};

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUser;
  }
}

export type JwtAuthOptions = {
  // Path patterns da escludere dalla auth. Default: /health, /webhooks/*.
  // Match prefix-based.
  excludePaths?: string[];
};

const DEFAULT_EXCLUDE = ['/health', '/webhooks/'];

// Attacca l'hook JWT sull'app passata. NON e' un plugin Fastify
// (encapsulated): vogliamo che l'hook si applichi a TUTTE le route
// registrate sull'app, anche quelle aggiunte dopo. Il chiamante invoca
// attachJwtAuth(app) prima di registrare le route protette.
export function attachJwtAuth(app: FastifyInstance, opts: JwtAuthOptions = {}): void {
  const exclude = opts.excludePaths ?? DEFAULT_EXCLUDE;

  app.addHook('onRequest', async (req, reply) => {
    const url = req.url.split('?')[0] ?? '';
    if (exclude.some((p) => url === p || url.startsWith(p))) {
      return;
    }

    const secret = process.env.SUPABASE_JWT_SECRET;
    if (!secret) {
      req.log.error({ event: 'jwt.unconfigured' }, 'SUPABASE_JWT_SECRET not configured');
      reply.code(500).send({ error: 'auth_not_configured' });
      return;
    }

    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
      req.log.warn({ event: 'jwt.missing', url }, 'missing Bearer token');
      reply.code(401).send({ error: 'unauthorized' });
      return;
    }

    const token = auth.slice('Bearer '.length).trim();
    const verified = verifyHs256(token, secret);
    if (!verified.ok) {
      req.log.warn({ event: 'jwt.invalid', reason: verified.reason, url }, 'JWT invalid');
      reply.code(401).send({ error: 'unauthorized' });
      return;
    }

    const claims = verified.claims;
    // Supabase mette user.id in `sub`. Per Premura host_id == user.id
    // Supabase (vedi seed-goccia-user.ts).
    const sub = typeof claims.sub === 'string' ? claims.sub : null;
    if (!sub) {
      req.log.warn({ event: 'jwt.no_sub', url }, 'JWT missing sub claim');
      reply.code(401).send({ error: 'unauthorized' });
      return;
    }
    const email = typeof claims.email === 'string' ? claims.email : null;
    req.user = { hostId: sub, email };
  });
}

// Helper per route handler che richiedono utente autenticato. Throw 401
// se assente. Il chiamante non deve catchare: Fastify converte l'errore.
export function requireUser(req: FastifyRequest): AuthUser {
  if (!req.user) {
    const err = new Error('unauthorized') as Error & { statusCode: number };
    err.statusCode = 401;
    throw err;
  }
  return req.user;
}

// ─────────────────────────────────────────────────────────────
// HS256 verifier interno (no dipendenze esterne).
// ─────────────────────────────────────────────────────────────

type VerifyResult = { ok: true; claims: Record<string, unknown> } | { ok: false; reason: string };

export function verifyHs256(token: string, secret: string): VerifyResult {
  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'malformed_token' };
  const [headerB64, payloadB64, sigB64] = parts as [string, string, string];

  let header: Record<string, unknown>;
  try {
    header = JSON.parse(base64UrlDecode(headerB64).toString('utf8'));
  } catch {
    return { ok: false, reason: 'invalid_header_b64' };
  }
  if (header.alg !== 'HS256') {
    return { ok: false, reason: 'unsupported_alg' };
  }
  if (header.typ && header.typ !== 'JWT') {
    return { ok: false, reason: 'invalid_typ' };
  }

  const data = `${headerB64}.${payloadB64}`;
  const expected = createHmac('sha256', secret).update(data).digest();
  let actual: Buffer;
  try {
    actual = base64UrlDecode(sigB64);
  } catch {
    return { ok: false, reason: 'invalid_sig_b64' };
  }
  if (expected.length !== actual.length) {
    return { ok: false, reason: 'invalid_signature' };
  }
  if (!timingSafeEqual(expected, actual)) {
    return { ok: false, reason: 'invalid_signature' };
  }

  let claims: Record<string, unknown>;
  try {
    claims = JSON.parse(base64UrlDecode(payloadB64).toString('utf8'));
  } catch {
    return { ok: false, reason: 'invalid_payload_b64' };
  }

  const exp = typeof claims.exp === 'number' ? claims.exp : null;
  if (exp !== null) {
    const nowSec = Math.floor(Date.now() / 1000);
    if (nowSec >= exp) return { ok: false, reason: 'token_expired' };
  }

  return { ok: true, claims };
}

function base64UrlDecode(input: string): Buffer {
  // base64url -> base64 standard, poi pad
  let s = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = s.length % 4;
  if (pad === 2) s += '==';
  else if (pad === 3) s += '=';
  else if (pad === 1) throw new Error('invalid base64url length');
  return Buffer.from(s, 'base64');
}
