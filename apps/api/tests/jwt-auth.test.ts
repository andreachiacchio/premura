import { createHmac } from 'node:crypto';
import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { attachJwtAuth, verifyHs256 } from '../src/plugins/jwt-auth';

// Test del JWT auth plugin (slice 6.5.2). Copre verifyHs256 puro +
// integrazione Fastify via inject.

const SECRET = 'super-test-secret-not-real';

function base64Url(input: string | object): string {
  const data = typeof input === 'string' ? input : JSON.stringify(input);
  return Buffer.from(data, 'utf8')
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function makeJwt(payload: Record<string, unknown>, secret = SECRET): string {
  const header = base64Url({ alg: 'HS256', typ: 'JWT' });
  const body = base64Url(payload);
  const sig = createHmac('sha256', secret)
    .update(`${header}.${body}`)
    .digest()
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `${header}.${body}.${sig}`;
}

const futureExp = (): number => Math.floor(Date.now() / 1000) + 3600;
const pastExp = (): number => Math.floor(Date.now() / 1000) - 60;

describe('verifyHs256', () => {
  it('JWT valido firmato col secret giusto -> ok + claims', () => {
    const token = makeJwt({ sub: 'host-1', email: 'a@b.com', exp: futureExp() });
    const r = verifyHs256(token, SECRET);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.claims.sub).toBe('host-1');
      expect(r.claims.email).toBe('a@b.com');
    }
  });

  it('JWT firmato con secret sbagliato -> invalid_signature', () => {
    const token = makeJwt({ sub: 'host-1', exp: futureExp() }, 'wrong');
    const r = verifyHs256(token, SECRET);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('invalid_signature');
  });

  it('JWT scaduto -> token_expired', () => {
    const token = makeJwt({ sub: 'host-1', exp: pastExp() });
    const r = verifyHs256(token, SECRET);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('token_expired');
  });

  it('JWT senza dot dot -> malformed_token', () => {
    const r = verifyHs256('abc.def', SECRET);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('malformed_token');
  });

  it('JWT con alg RS256 (non supportato) -> unsupported_alg', () => {
    const header = base64Url({ alg: 'RS256', typ: 'JWT' });
    const body = base64Url({ sub: 'host-1', exp: futureExp() });
    const sig = base64Url('fake');
    const r = verifyHs256(`${header}.${body}.${sig}`, SECRET);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('unsupported_alg');
  });

  it('JWT senza exp claim -> ok (Supabase puo emetterlo, accettiamo)', () => {
    const token = makeJwt({ sub: 'host-1' });
    const r = verifyHs256(token, SECRET);
    expect(r.ok).toBe(true);
  });

  it('JWT body alterato (header+sig dello stesso token) -> invalid_signature', () => {
    const original = makeJwt({ sub: 'host-1', amount: 10, exp: futureExp() });
    const tamperedBody = base64Url({ sub: 'host-1', amount: 1000, exp: futureExp() });
    const [headerB64, , sigB64] = original.split('.');
    const r = verifyHs256(`${headerB64}.${tamperedBody}.${sigB64}`, SECRET);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('invalid_signature');
  });
});

describe('jwtAuthPlugin (Fastify integration)', () => {
  beforeEach(() => {
    process.env.SUPABASE_JWT_SECRET = SECRET;
  });
  afterEach(() => {
    // biome-ignore lint/performance/noDelete: process.env semantica
    delete process.env.SUPABASE_JWT_SECRET;
  });

  async function buildApp(opts: { excludePaths?: string[] } = {}) {
    const app = Fastify({ logger: false });
    attachJwtAuth(app, opts);
    app.get('/secret', async (req) => {
      return { user: req.user ?? null };
    });
    app.get('/health', async () => ({ status: 'ok' }));
    app.post('/webhooks/whatsapp', async () => ({ received: true }));
    return app;
  }

  it('GET /health (escluso) senza JWT -> 200', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
  });

  it('POST /webhooks/whatsapp (escluso) senza JWT -> 200', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/webhooks/whatsapp' });
    expect(res.statusCode).toBe(200);
  });

  it('GET /secret senza Authorization -> 401', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/secret' });
    expect(res.statusCode).toBe(401);
  });

  it('GET /secret con Bearer token valido -> 200 + req.user popolato', async () => {
    const app = await buildApp();
    const token = makeJwt({ sub: 'host-42', email: 'a@b.com', exp: futureExp() });
    const res = await app.inject({
      method: 'GET',
      url: '/secret',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ user: { hostId: 'host-42', email: 'a@b.com' } });
  });

  it('GET /secret con Bearer token scaduto -> 401', async () => {
    const app = await buildApp();
    const token = makeJwt({ sub: 'host-1', exp: pastExp() });
    const res = await app.inject({
      method: 'GET',
      url: '/secret',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(401);
  });

  it('GET /secret con Bearer token firmato col secret sbagliato -> 401', async () => {
    const app = await buildApp();
    const token = makeJwt({ sub: 'host-1', exp: futureExp() }, 'wrong');
    const res = await app.inject({
      method: 'GET',
      url: '/secret',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(401);
  });

  it('SUPABASE_JWT_SECRET mancante -> 500', async () => {
    // biome-ignore lint/performance/noDelete: process.env semantica
    delete process.env.SUPABASE_JWT_SECRET;
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/secret',
      headers: { authorization: `Bearer ${makeJwt({ sub: 'x' })}` },
    });
    expect(res.statusCode).toBe(500);
  });

  it('JWT senza claim sub -> 401', async () => {
    const app = await buildApp();
    const token = makeJwt({ email: 'noone@example.com', exp: futureExp() });
    const res = await app.inject({
      method: 'GET',
      url: '/secret',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(401);
  });

  it('exclude path personalizzato funziona', async () => {
    const app = await buildApp({ excludePaths: ['/public/'] });
    app.get('/public/test', async () => ({ ok: true }));
    const res = await app.inject({ method: 'GET', url: '/public/test' });
    expect(res.statusCode).toBe(200);
  });
});
