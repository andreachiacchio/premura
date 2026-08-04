import { createHmac, timingSafeEqual } from 'node:crypto';
import { hosts } from '@premura/db';
import type { Database } from '@premura/db';
import { eq } from 'drizzle-orm';
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
  // Parte A (04/08): resolver auth.users.id -> hosts.id. Obbligatorio
  // in produzione (index.ts passa il db); i test possono iniettarne
  // uno finto. Se assente, il vecchio comportamento (hostId = sub)
  // resta come fallback SOLO per non rompere i test legacy.
  resolveHostId?: (authUserId: string) => Promise<string | null>;
};

const DEFAULT_EXCLUDE = ['/health', '/webhooks/'];

// Mini-cache sub -> hostId: il mapping e' immutabile una volta creato
// (auth_user_id unique), il TTL serve solo a non tenere per sempre
// mapping di utenti cancellati.
const HOST_CACHE_TTL_MS = 5 * 60_000;
const hostCache = new Map<string, { hostId: string; expiresAt: number }>();

export function makeDbHostResolver(db: Database): (authUserId: string) => Promise<string | null> {
  return async (authUserId: string) => {
    const cached = hostCache.get(authUserId);
    if (cached && cached.expiresAt > Date.now()) return cached.hostId;
    const rows = await db
      .select({ id: hosts.id })
      .from(hosts)
      .where(eq(hosts.authUserId, authUserId))
      .limit(1);
    const hostId = rows[0]?.id ?? null;
    if (hostId) {
      hostCache.set(authUserId, { hostId, expiresAt: Date.now() + HOST_CACHE_TTL_MS });
    }
    return hostId;
  };
}

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
    // Supabase mette user.id in `sub`. Parte A (04/08): hosts.id e'
    // chiave propria, quindi il sub va risolto via hosts.auth_user_id.
    const sub = typeof claims.sub === 'string' ? claims.sub : null;
    if (!sub) {
      req.log.warn({ event: 'jwt.no_sub', url }, 'JWT missing sub claim');
      reply.code(401).send({ error: 'unauthorized' });
      return;
    }
    const email = typeof claims.email === 'string' ? claims.email : null;

    if (opts.resolveHostId) {
      const hostId = await opts.resolveHostId(sub);
      if (!hostId) {
        // Utente auth valido ma senza riga hosts collegata: per l'API
        // e' un forbidden (la riga nasce dal flusso web, non da qui).
        req.log.warn({ event: 'jwt.no_host', url }, 'auth user senza host collegato');
        reply.code(403).send({ error: 'no_host' });
        return;
      }
      req.user = { hostId, email };
      return;
    }

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
