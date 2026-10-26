import { createHmac } from 'node:crypto';
import type { Database } from '@premura/db';
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toFlatInbound, verifyWahaSignature, wahaWebhookRoutes } from '../src/api/webhooks/waha';

describe('verifyWahaSignature', () => {
  const secret = 'segreto-di-test';
  const body = Buffer.from(JSON.stringify({ event: 'message', payload: { id: 'a' } }));

  it('accetta una firma sha512 valida', () => {
    const sig = createHmac('sha512', secret).update(body).digest('hex');
    expect(verifyWahaSignature(body, sig, 'sha512', secret)).toBe(true);
  });

  it('usa sha512 come default quando l header dell algoritmo manca', () => {
    const sig = createHmac('sha512', secret).update(body).digest('hex');
    expect(verifyWahaSignature(body, sig, undefined, secret)).toBe(true);
  });

  it('accetta sha256 quando dichiarato', () => {
    const sig = createHmac('sha256', secret).update(body).digest('hex');
    expect(verifyWahaSignature(body, sig, 'sha256', secret)).toBe(true);
  });

  it('rifiuta una firma calcolata con un altro segreto', () => {
    const sig = createHmac('sha512', 'altro-segreto').update(body).digest('hex');
    expect(verifyWahaSignature(body, sig, 'sha512', secret)).toBe(false);
  });

  it('rifiuta se il body e stato alterato', () => {
    const sig = createHmac('sha512', secret).update(body).digest('hex');
    const tampered = Buffer.from(JSON.stringify({ event: 'message', payload: { id: 'b' } }));
    expect(verifyWahaSignature(tampered, sig, 'sha512', secret)).toBe(false);
  });

  it('rifiuta firma assente, vuota o di lunghezza diversa senza sollevare', () => {
    // timingSafeEqual pretende buffer di pari lunghezza: se il confronto
    // preventivo mancasse, questi casi diventerebbero un 500 invece di un 401.
    expect(verifyWahaSignature(body, undefined, 'sha512', secret)).toBe(false);
    expect(verifyWahaSignature(body, '', 'sha512', secret)).toBe(false);
    expect(verifyWahaSignature(body, 'abc', 'sha512', secret)).toBe(false);
  });

  it('rifiuta un algoritmo non previsto invece di provarci', () => {
    const sig = createHmac('sha1', secret).update(body).digest('hex');
    expect(verifyWahaSignature(body, sig, 'sha1', secret)).toBe(false);
    expect(verifyWahaSignature(body, sig, 'md5', secret)).toBe(false);
  });
});

describe('toFlatInbound', () => {
  const base = {
    event: 'message',
    session: 'default',
    messageId: 'false_4748356805@c.us_XYZ',
    from: '4748356805',
    senderLid: null,
    fromMe: false,
    timestamp: new Date('2026-08-01T10:00:00Z'),
    text: 'What time is check-in?',
    hasMedia: false,
    mediaUrl: null,
    ack: null,
  };

  it('adatta un messaggio di testo alla forma che persistInboundMessage conosce', () => {
    const flat = toFlatInbound(base);
    expect(flat.message).toEqual({
      from: '4748356805',
      id: 'false_4748356805@c.us_XYZ',
      timestamp: String(Math.floor(base.timestamp.getTime() / 1000)),
      type: 'text',
      text: { body: 'What time is check-in?' },
    });
  });

  it('marca i messaggi con media come image', () => {
    const flat = toFlatInbound({ ...base, hasMedia: true, text: null });
    expect(flat.message.type).toBe('image');
  });

  it('non inventa identificatori Meta: usa la sessione WAHA', () => {
    const flat = toFlatInbound(base);
    expect(flat.wabaId).toBe('waha:default');
    expect(flat.phoneNumberId).toBe('waha:default');
  });

  it('regge una sessione assente', () => {
    const flat = toFlatInbound({ ...base, session: null });
    expect(flat.wabaId).toBe('waha:default');
  });

  it('usa stringa vuota quando il testo manca, non undefined', () => {
    // messages.body e' NOT NULL a schema: un undefined qui diventerebbe
    // un errore di insert al primo messaggio senza corpo.
    const flat = toFlatInbound({ ...base, text: null });
    expect(flat.message).toMatchObject({ type: 'text', text: { body: '' } });
  });
});

// ─────────────────────────────────────────────────────────────────────
// 26/10: la route con il payload reale. Persistenza, coda bozze e
// risoluzione LID sono finte: qui si verifica cosa arriva a
// persistInboundMessage e cosa finisce nei log.

const persistMock = vi.hoisted(() => vi.fn());
const enqueueMock = vi.hoisted(() => vi.fn());
const resolveLidMock = vi.hoisted(() => vi.fn());

vi.mock('../src/api/webhooks/whatsapp-persist', () => ({ persistInboundMessage: persistMock }));
vi.mock('../src/jobs/draft-generation-queue', () => ({ enqueueDraftGeneration: enqueueMock }));
vi.mock('@premura/integrations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@premura/integrations')>()),
  resolveLidToPhone: resolveLidMock,
}));

const REAL_ENVELOPE = {
  event: 'message',
  session: 'default',
  engine: 'WEBJS',
  payload: {
    id: 'false_163505126793314@lid_3A7B3B34FB8CEF55FFE9',
    from: '163505126793314@lid',
    to: '393514512070@c.us',
    body: 'Test premura',
    fromMe: false,
    hasMedia: false,
    media: null,
    ack: 1,
    ackName: 'SERVER',
    location: null,
    vCards: [],
    _data: {},
  },
};

type LogLine = { level: number; event?: string; msg?: string; [k: string]: unknown };

async function buildWahaApp(): Promise<{ app: ReturnType<typeof Fastify>; logs: LogLine[] }> {
  const logs: LogLine[] = [];
  const app = Fastify({
    logger: {
      level: 'debug',
      stream: { write: (line: string) => logs.push(JSON.parse(line) as LogLine) },
    },
  });
  await app.register(wahaWebhookRoutes, { db: {} as Database });
  return { app, logs };
}

const post = (app: ReturnType<typeof Fastify>, body: unknown) =>
  app.inject({
    method: 'POST',
    url: '/webhooks/waha',
    headers: { 'content-type': 'application/json' },
    payload: JSON.stringify(body),
  });

const WARN = 40;

describe('POST /webhooks/waha', () => {
  beforeEach(() => {
    persistMock.mockReset();
    enqueueMock.mockReset();
    resolveLidMock.mockReset();
    persistMock.mockResolvedValue({
      messageId: 'm-1',
      conversationId: 'c-1',
      bookingId: null,
      status: 'orphan_inserted',
    });
  });

  it('payload reale, LID risolto: si salva con il numero', async () => {
    resolveLidMock.mockResolvedValue('393383963307');
    const { app } = await buildWahaApp();
    const res = await post(app, REAL_ENVELOPE);

    expect(res.statusCode).toBe(200);
    expect(resolveLidMock).toHaveBeenCalledWith('163505126793314@lid', 'default');
    expect(persistMock).toHaveBeenCalledTimes(1);
    const flat = persistMock.mock.calls[0]?.[1];
    expect(flat.message).toMatchObject({
      from: '393383963307',
      id: 'false_163505126793314@lid_3A7B3B34FB8CEF55FFE9',
      text: { body: 'Test premura' },
    });
  });

  it('payload reale, LID non risolto: si salva COMUNQUE col LID, e lo si dice a WARN', async () => {
    resolveLidMock.mockResolvedValue(null);
    const { app, logs } = await buildWahaApp();
    const res = await post(app, REAL_ENVELOPE);

    expect(res.statusCode).toBe(200);
    expect(persistMock).toHaveBeenCalledTimes(1);
    expect(persistMock.mock.calls[0]?.[1].message.from).toBe('163505126793314@lid');
    expect(logs.some((l) => l.event === 'waha.lid.unresolved' && l.level === WARN)).toBe(true);
  });

  it('payload non leggibile: 200, niente salvataggio, WARN con chiavi e problemi', async () => {
    const { app, logs } = await buildWahaApp();
    const res = await post(app, {
      event: 'message',
      payload: { from: '4748356805@c.us', body: 'segreto' },
    });

    expect(res.statusCode).toBe(200);
    expect(persistMock).not.toHaveBeenCalled();
    const warn = logs.find((l) => l.event === 'waha.parse.invalid');
    expect(warn?.level).toBe(WARN);
    expect(warn?.payloadKeys).toEqual(['from', 'body']);
    expect((warn?.issues as string[]).some((i) => i.startsWith('payload.id'))).toBe(true);
    expect(JSON.stringify(logs)).not.toContain('segreto');
  });

  it('gruppo: ignorato a debug, niente salvataggio, niente WARN di parsing', async () => {
    const { app, logs } = await buildWahaApp();
    const res = await post(app, {
      event: 'message',
      session: 'default',
      payload: { id: 'g1', from: '120363025246125486@g.us', author: '4748356805@c.us', body: 'x' },
    });

    expect(res.statusCode).toBe(200);
    expect(persistMock).not.toHaveBeenCalled();
    expect(logs.some((l) => l.event === 'waha.skip' && l.level === 20)).toBe(true);
    expect(logs.some((l) => l.event === 'waha.parse.invalid')).toBe(false);
  });

  it('evento che non e un messaggio: ignorato, non invalido', async () => {
    const { app, logs } = await buildWahaApp();
    const res = await post(app, { event: 'session.status', payload: { status: 'WORKING' } });

    expect(res.statusCode).toBe(200);
    expect(persistMock).not.toHaveBeenCalled();
    expect(logs.some((l) => l.event === 'waha.parse.invalid')).toBe(false);
  });

  it('26/10: enqueue della bozza fallito due volte -> 200, lo stato finisce sul messaggio', async () => {
    resolveLidMock.mockResolvedValue('393383963307');
    persistMock.mockResolvedValue({
      messageId: '9bf305fe-eb1d-4f0a-839e-5e8c66c83225',
      conversationId: 'c-1',
      bookingId: 'b-1',
      status: 'inserted',
    });
    enqueueMock.mockRejectedValue(new Error('Custom Id cannot contain :'));
    const sets: unknown[] = [];
    const db = {
      update: () => ({
        set: (v: unknown) => {
          sets.push(v);
          return { where: async () => undefined };
        },
      }),
    } as unknown as Database;
    const logs: LogLine[] = [];
    const app = Fastify({
      logger: { level: 'debug', stream: { write: (l: string) => logs.push(JSON.parse(l)) } },
    });
    await app.register(wahaWebhookRoutes, { db });

    const res = await post(app, REAL_ENVELOPE);

    expect(res.statusCode).toBe(200);
    expect(enqueueMock).toHaveBeenCalledTimes(2);
    expect(sets).toHaveLength(1);
    const err = logs.find((l) => l.event === 'waha.draft.enqueue_error');
    expect(err?.marked).toBe(true);
  });

  it('numero gia in chiaro (@c.us): nessuna chiamata per il LID', async () => {
    const { app } = await buildWahaApp();
    await post(app, {
      event: 'message',
      session: 'default',
      payload: { id: 'x', from: '4748356805@c.us', body: 'What time is check-in?', media: null },
    });

    expect(resolveLidMock).not.toHaveBeenCalled();
    expect(persistMock.mock.calls[0]?.[1].message.from).toBe('4748356805');
  });
});
