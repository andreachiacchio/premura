import { createHmac } from 'node:crypto';
import type { Database } from '@premura/db';
import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Slice 7a.4 — integration test webhook -> enqueue draft-generation.
// Verifica che dopo un POST signed con payload inbound valido, il
// connector enqueue sulla coda 'draft-generation' UNA volta per ogni
// messaggio inserted (non per duplicati ne' orphan).

// Mock enqueue: cattura le chiamate per assert. Mock va prima del
// import del modulo whatsapp.ts che lo importa.
const enqueueMock = vi.fn().mockResolvedValue(undefined);
vi.mock('../src/jobs/draft-generation-queue', () => ({
  enqueueDraftGeneration: (messageId: string) => enqueueMock(messageId),
  draftGenerationQueue: {},
  DRAFT_GENERATION_QUEUE_NAME: 'draft-generation',
}));

// Slice B: mock survey routing. Default: nessuna survey attiva (legacy
// behavior, draft-generation enqueue procede). I test specifici del
// survey routing vivono in survey-routing.test.ts.
const surveyEnqueueMock = vi.fn().mockResolvedValue(undefined);
vi.mock('../src/jobs/survey-queue', () => ({
  enqueueSurveyProcessInbound: (...args: unknown[]) => surveyEnqueueMock(...args),
}));
vi.mock('@premura/agents', async () => {
  const actual = (await vi.importActual('@premura/agents')) as Record<string, unknown>;
  return {
    ...actual,
    findActiveSurvey: vi.fn().mockResolvedValue(null),
  };
});

// Mock persist: per controllare l'esito del persist (inserted / duplicate /
// orphan) senza un DB vero. Cosi' testiamo SOLO il connector logic.
const persistMock = vi.fn();
vi.mock('../src/api/webhooks/whatsapp-persist', () => ({
  persistInboundMessage: (...args: unknown[]) => persistMock(...args),
}));

const { whatsappWebhookRoutes } = await import('../src/api/webhooks/whatsapp');

const APP_SECRET = 'test-app-secret';
const VERIFY_TOKEN = 'test-verify-token';
const WABA_ID = '123456789';

function signBody(body: string): string {
  const digest = createHmac('sha256', APP_SECRET).update(Buffer.from(body, 'utf8')).digest('hex');
  return `sha256=${digest}`;
}

function makeNoopDb(): Database {
  return {} as unknown as Database;
}

async function buildApp(): Promise<ReturnType<typeof Fastify>> {
  const app = Fastify({ logger: false });
  await app.register(whatsappWebhookRoutes, { db: makeNoopDb() });
  return app;
}

function buildPayload(messages: Array<{ id: string; from: string; body: string }>): string {
  return JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [
      {
        id: WABA_ID,
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '+393331234567',
                phone_number_id: 'PHONE-123',
              },
              contacts: messages.map((m) => ({
                profile: { name: 'Mario' },
                wa_id: m.from,
              })),
              messages: messages.map((m) => ({
                from: m.from,
                id: m.id,
                timestamp: '1700000000',
                type: 'text',
                text: { body: m.body },
              })),
            },
          },
        ],
      },
    ],
  });
}

describe('webhook POST -> draft-generation enqueue connector', () => {
  beforeEach(() => {
    process.env.META_APP_SECRET = APP_SECRET;
    process.env.META_VERIFY_TOKEN = VERIFY_TOKEN;
    process.env.META_WABA_ID = WABA_ID;
    enqueueMock.mockClear();
    persistMock.mockClear();
  });
  afterEach(() => {
    // biome-ignore lint/performance/noDelete: process.env semantica
    delete process.env.META_APP_SECRET;
    // biome-ignore lint/performance/noDelete: process.env semantica
    delete process.env.META_VERIFY_TOKEN;
    // biome-ignore lint/performance/noDelete: process.env semantica
    delete process.env.META_WABA_ID;
  });

  it('messaggio inserted -> enqueue chiamato 1 volta col messageId', async () => {
    persistMock.mockResolvedValue({
      messageId: 'msg-uuid-1',
      conversationId: 'conv-1',
      bookingId: 'b1',
      status: 'inserted',
    });

    const app = await buildApp();
    const payload = buildPayload([
      { id: 'wamid.AAA', from: '393331234567', body: 'A che ora il check-in?' },
    ]);
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
    expect(enqueueMock).toHaveBeenCalledOnce();
    expect(enqueueMock).toHaveBeenCalledWith('msg-uuid-1');
    await app.close();
  });

  it('messaggio duplicate_skipped -> NO enqueue', async () => {
    persistMock.mockResolvedValue({
      messageId: 'msg-uuid-existing',
      conversationId: 'conv-1',
      bookingId: 'b1',
      status: 'duplicate_skipped',
    });

    const app = await buildApp();
    const payload = buildPayload([{ id: 'wamid.DUP', from: '393331234567', body: 'duplicato' }]);
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
    expect(enqueueMock).not.toHaveBeenCalled();
    await app.close();
  });

  it('messaggio orphan_inserted (no booking match) -> NO enqueue', async () => {
    persistMock.mockResolvedValue({
      messageId: 'msg-orphan',
      conversationId: null,
      bookingId: null,
      status: 'orphan_inserted',
    });

    const app = await buildApp();
    const payload = buildPayload([{ id: 'wamid.ORPH', from: '393339999999', body: 'orphan' }]);
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
    expect(enqueueMock).not.toHaveBeenCalled();
    await app.close();
  });

  it('batch misto: 2 inserted + 1 duplicate -> enqueue chiamato 2 volte', async () => {
    persistMock
      .mockResolvedValueOnce({
        messageId: 'msg-1',
        conversationId: 'conv-1',
        bookingId: 'b1',
        status: 'inserted',
      })
      .mockResolvedValueOnce({
        messageId: 'msg-2',
        conversationId: 'conv-1',
        bookingId: 'b1',
        status: 'inserted',
      })
      .mockResolvedValueOnce({
        messageId: 'msg-dup',
        conversationId: 'conv-1',
        bookingId: 'b1',
        status: 'duplicate_skipped',
      });

    const app = await buildApp();
    const payload = buildPayload([
      { id: 'wamid.A', from: '393331111111', body: 'msg uno' },
      { id: 'wamid.B', from: '393331111111', body: 'msg due' },
      { id: 'wamid.C', from: '393331111111', body: 'msg tre dup' },
    ]);
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
    expect(enqueueMock).toHaveBeenCalledTimes(2);
    expect(enqueueMock).toHaveBeenNthCalledWith(1, 'msg-1');
    expect(enqueueMock).toHaveBeenNthCalledWith(2, 'msg-2');
    await app.close();
  });

  it('enqueue fallito -> webhook risponde comunque 200 (failure isolation)', async () => {
    persistMock.mockResolvedValue({
      messageId: 'msg-uuid-1',
      conversationId: 'conv-1',
      bookingId: 'b1',
      status: 'inserted',
    });
    enqueueMock.mockRejectedValueOnce(new Error('Redis down'));

    const app = await buildApp();
    const payload = buildPayload([{ id: 'wamid.X', from: '393331234567', body: 'test' }]);
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/whatsapp',
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': signBody(payload),
      },
      payload,
    });

    // Webhook risponde 200 perche' il messaggio e' stato persistito.
    // L'enqueue failure e' loggata ma non rompe il batch — rimedia
    // un reprocess manuale, non vogliamo Meta retry sul batch.
    expect(res.statusCode).toBe(200);
    expect(enqueueMock).toHaveBeenCalledOnce();
    await app.close();
  });
});
