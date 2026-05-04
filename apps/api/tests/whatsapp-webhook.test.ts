import { createHmac } from 'node:crypto';
import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { whatsappWebhookRoutes } from '../src/api/webhooks/whatsapp';

// Test integration leggero (no DB) delle route Fastify del webhook
// WhatsApp. Esercita: challenge handshake GET, signature verify POST,
// errori 401/403/500 sui path negativi. Pattern app.inject() come in
// bookings-routes.test.ts.

const APP_SECRET = 'test-app-secret';
const VERIFY_TOKEN = 'test-verify-token';

function signBody(body: string, secret = APP_SECRET): string {
  const digest = createHmac('sha256', secret).update(Buffer.from(body, 'utf8')).digest('hex');
  return `sha256=${digest}`;
}

async function buildApp(): Promise<ReturnType<typeof Fastify>> {
  const app = Fastify({ logger: false });
  await app.register(whatsappWebhookRoutes);
  return app;
}

describe('GET /webhooks/whatsapp - challenge handshake', () => {
  beforeEach(() => {
    process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = VERIFY_TOKEN;
    process.env.WHATSAPP_APP_SECRET = APP_SECRET;
  });
  afterEach(() => {
    // Biome consiglia "= undefined" come unsafe fix, ma su process.env
    // setterebbe la stringa "undefined" (truthy). Servono delete reali.
    // biome-ignore lint/performance/noDelete: process.env semantica
    delete process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
    // biome-ignore lint/performance/noDelete: process.env semantica
    delete process.env.WHATSAPP_APP_SECRET;
  });

  it('mode=subscribe + token corretto + challenge -> 200 con challenge in plain text', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/webhooks/whatsapp',
      query: {
        'hub.mode': 'subscribe',
        'hub.verify_token': VERIFY_TOKEN,
        'hub.challenge': 'CHALLENGE_42',
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('CHALLENGE_42');
    expect(res.headers['content-type']).toContain('text/plain');
  });

  it('token sbagliato -> 403', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/webhooks/whatsapp',
      query: {
        'hub.mode': 'subscribe',
        'hub.verify_token': 'WRONG_TOKEN',
        'hub.challenge': 'CHALLENGE_42',
      },
    });
    expect(res.statusCode).toBe(403);
  });

  it('mode diverso da subscribe -> 403', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/webhooks/whatsapp',
      query: {
        'hub.mode': 'unsubscribe',
        'hub.verify_token': VERIFY_TOKEN,
        'hub.challenge': 'CHALLENGE_42',
      },
    });
    expect(res.statusCode).toBe(403);
  });

  it('env var WHATSAPP_WEBHOOK_VERIFY_TOKEN mancante -> 500', async () => {
    // biome-ignore lint/performance/noDelete: process.env semantica
    delete process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/webhooks/whatsapp',
      query: {
        'hub.mode': 'subscribe',
        'hub.verify_token': VERIFY_TOKEN,
        'hub.challenge': 'CHALLENGE_42',
      },
    });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ error: 'not_configured' });
  });
});

describe('POST /webhooks/whatsapp - event delivery con signature verify', () => {
  beforeEach(() => {
    process.env.WHATSAPP_APP_SECRET = APP_SECRET;
    process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = VERIFY_TOKEN;
  });
  afterEach(() => {
    // biome-ignore lint/performance/noDelete: process.env semantica
    delete process.env.WHATSAPP_APP_SECRET;
    // biome-ignore lint/performance/noDelete: process.env semantica
    delete process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  });

  it('signature valida -> 200 con { received: true }', async () => {
    const app = await buildApp();
    const payload = JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [{ id: 'WABA_ID', changes: [] }],
    });
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/whatsapp',
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': signBody(payload),
      },
      payload,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ received: true });
  });

  it('signature mancante -> 401', async () => {
    const app = await buildApp();
    const payload = JSON.stringify({ object: 'whatsapp_business_account', entry: [] });
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/whatsapp',
      headers: { 'content-type': 'application/json' },
      payload,
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: 'invalid_signature' });
  });

  it('signature firmata con secret sbagliato -> 401', async () => {
    const app = await buildApp();
    const payload = JSON.stringify({ object: 'whatsapp_business_account', entry: [] });
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/whatsapp',
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': signBody(payload, 'wrong-secret'),
      },
      payload,
    });
    expect(res.statusCode).toBe(401);
  });

  it('body alterato post-firma -> 401', async () => {
    const app = await buildApp();
    const original = JSON.stringify({ amount: 10 });
    const tampered = JSON.stringify({ amount: 1000 });
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/whatsapp',
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': signBody(original),
      },
      payload: tampered,
    });
    expect(res.statusCode).toBe(401);
  });

  it('env var WHATSAPP_APP_SECRET mancante -> 500', async () => {
    // biome-ignore lint/performance/noDelete: process.env semantica
    delete process.env.WHATSAPP_APP_SECRET;
    const app = await buildApp();
    const payload = JSON.stringify({ object: 'whatsapp_business_account', entry: [] });
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/whatsapp',
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': signBody(payload),
      },
      payload,
    });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ error: 'not_configured' });
  });

  it('body vuoto con signature valida per body vuoto -> 200', async () => {
    const app = await buildApp();
    const payload = '';
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/whatsapp',
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': signBody(payload),
      },
      payload,
    });
    expect(res.statusCode).toBe(200);
  });
});
