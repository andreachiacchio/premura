import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  WahaSendError,
  chatIdToPhone,
  checkNumberOnWhatsapp,
  parseWahaWebhook,
  sendImageViaWaha,
  sendTextViaWaha,
  toChatId,
} from '../src/whatsapp-waha';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('WAHA_URL', 'https://waha.example.com');
  vi.stubEnv('WAHA_API_KEY', 'chiave-di-test');
  vi.stubEnv('WAHA_SESSION', 'default');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function ok(body: unknown) {
  return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
}

describe('toChatId', () => {
  it('converte un E.164 nel formato chat individuale', () => {
    expect(toChatId('+39 351 451 2070')).toBe('393514512070@c.us');
    expect(toChatId('+47 48 35 68 05')).toBe('4748356805@c.us');
  });

  it('lascia stare un chatId gia formato', () => {
    // Capita di rimandare indietro il `from` di un webhook.
    expect(toChatId('393514512070@c.us')).toBe('393514512070@c.us');
    expect(toChatId('393514512070@s.whatsapp.net')).toBe('393514512070@s.whatsapp.net');
  });

  it('rifiuta un numero troppo corto invece di comporre un chatId assurdo', () => {
    expect(() => toChatId('12345')).toThrow(/non valido/);
  });

  it('chatIdToPhone e l inverso', () => {
    expect(chatIdToPhone('4748356805@c.us')).toBe('4748356805');
  });
});

describe('configurazione', () => {
  it('solleva se manca WAHA_API_KEY', async () => {
    vi.stubEnv('WAHA_API_KEY', '');
    await expect(sendTextViaWaha('+393514512070', 'ciao')).rejects.toThrow(/WAHA non configurato/);
  });

  it('normalizza uno slash finale in WAHA_URL', async () => {
    vi.stubEnv('WAHA_URL', 'https://waha.example.com/');
    fetchMock.mockResolvedValue(ok({ id: 'x' }));
    await sendTextViaWaha('+393514512070', 'ciao');
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://waha.example.com/api/sendText');
  });
});

describe('sendTextViaWaha', () => {
  it('POSTa su /api/sendText con X-Api-Key e chatId', async () => {
    fetchMock.mockResolvedValue(ok({ id: 'true_39351@c.us_ABC', from: 'x' }));
    const res = await sendTextViaWaha('+393514512070', 'ciao Julian');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://waha.example.com/api/sendText');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['X-Api-Key']).toBe('chiave-di-test');
    expect(JSON.parse(init.body as string)).toEqual({
      session: 'default',
      chatId: '393514512070@c.us',
      text: 'ciao Julian',
      linkPreview: false,
    });
    expect(res.messageId).toBe('true_39351@c.us_ABC');
  });

  it('usa WAHA_SESSION quando valorizzata', async () => {
    vi.stubEnv('WAHA_SESSION', 'villa-cristina');
    fetchMock.mockResolvedValue(ok({ id: 'x' }));
    await sendTextViaWaha('+393514512070', 'ciao');
    expect(JSON.parse((fetchMock.mock.calls[0]?.[1] as RequestInit).body as string).session).toBe(
      'villa-cristina',
    );
  });

  it('4xx e permanente, 5xx e 429 sono ritentabili', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 422, text: async () => 'bad chatId' });
    await expect(sendTextViaWaha('+393514512070', 'x')).rejects.toMatchObject({
      name: 'WahaSendError',
      retryable: false,
    });

    for (const status of [500, 502, 504, 429]) {
      fetchMock.mockResolvedValue({ ok: false, status, text: async () => 'ko' });
      await expect(sendTextViaWaha('+393514512070', 'x')).rejects.toMatchObject({
        retryable: true,
      });
    }
  });

  it('non fallisce se WAHA aggiunge campi nuovi alla risposta', async () => {
    // passthrough(): un campo in piu' in una versione nuova non deve far
    // sembrare fallito un invio andato a buon fine.
    fetchMock.mockResolvedValue(ok({ id: 'abc', campoNuovoDiWaha: 42 }));
    await expect(sendTextViaWaha('+393514512070', 'x')).resolves.toEqual({ messageId: 'abc' });
  });
});

describe('sendImageViaWaha', () => {
  it('manda il file come oggetto url, non come stringa', async () => {
    fetchMock.mockResolvedValue(ok({ id: 'img-1' }));
    await sendImageViaWaha({
      to: '+4748356805',
      imageUrl: 'https://cdn.example/kit.jpg',
      caption: 'Benvenuto',
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://waha.example.com/api/sendImage');
    expect(JSON.parse(init.body as string)).toEqual({
      session: 'default',
      chatId: '4748356805@c.us',
      file: { url: 'https://cdn.example/kit.jpg' },
      caption: 'Benvenuto',
    });
  });

  it('omette caption quando assente', async () => {
    fetchMock.mockResolvedValue(ok({ id: 'img-2' }));
    await sendImageViaWaha({ to: '+4748356805', imageUrl: 'https://cdn/x.jpg' });
    expect(
      JSON.parse((fetchMock.mock.calls[0]?.[1] as RequestInit).body as string),
    ).not.toHaveProperty('caption');
  });
});

describe('checkNumberOnWhatsapp', () => {
  it('ritorna il flag numberExists', async () => {
    fetchMock.mockResolvedValue(ok({ numberExists: true, chatId: '4748356805@c.us' }));
    await expect(checkNumberOnWhatsapp('+47 48 35 68 05')).resolves.toBe(true);
    expect(fetchMock.mock.calls[0]?.[0]).toContain('phone=4748356805');
  });

  it('ritorna null se la verifica stessa fallisce', async () => {
    // Distinguere "non su WhatsApp" da "non l'ho potuto sapere" e' il
    // punto: nel DB phone_on_whatsapp e' nullable apposta.
    fetchMock.mockResolvedValue({ ok: false, status: 500, text: async () => 'ko' });
    await expect(checkNumberOnWhatsapp('+4748356805')).resolves.toBeNull();

    fetchMock.mockRejectedValue(new Error('tunnel giu'));
    await expect(checkNumberOnWhatsapp('+4748356805')).resolves.toBeNull();
  });
});

describe('parseWahaWebhook', () => {
  it('estrae un messaggio in arrivo', () => {
    const out = parseWahaWebhook({
      event: 'message',
      session: 'default',
      payload: {
        id: 'false_4748356805@c.us_XYZ',
        timestamp: 1785000000,
        from: '4748356805@c.us',
        to: '393514512070@c.us',
        fromMe: false,
        body: 'Hi, what time is check-in?',
        hasMedia: false,
      },
    });

    expect(out).toMatchObject({
      event: 'message',
      session: 'default',
      messageId: 'false_4748356805@c.us_XYZ',
      from: '4748356805',
      fromMe: false,
      text: 'Hi, what time is check-in?',
      hasMedia: false,
    });
    expect(out?.timestamp.toISOString()).toBe(new Date(1785000000 * 1000).toISOString());
  });

  it('riconosce i messaggi inviati da noi (fromMe) — servono per l handover', () => {
    const out = parseWahaWebhook({
      event: 'message.any',
      payload: { id: 'true_x_Y', from: '393514512070@c.us', fromMe: true, body: 'rispondo io' },
    });
    expect(out?.fromMe).toBe(true);
  });

  it('legge gli ack', () => {
    const out = parseWahaWebhook({
      event: 'message.ack',
      payload: { id: 'true_x_Y', from: '4748356805@c.us', ack: 3, ackName: 'READ' },
    });
    expect(out?.ack).toBe(3);
  });

  it('ritorna null su un payload che non e un evento WAHA', () => {
    expect(parseWahaWebhook({ entry: [{ changes: [] }] })).toBeNull();
    expect(parseWahaWebhook(null)).toBeNull();
    expect(parseWahaWebhook({ event: 'message' })).toBeNull();
  });

  it('sopravvive a un payload senza timestamp', () => {
    const out = parseWahaWebhook({
      event: 'message',
      payload: { id: 'a', from: '4748356805@c.us', body: 'x' },
    });
    expect(out?.timestamp).toBeInstanceOf(Date);
  });
});

describe('WahaSendError', () => {
  it('tronca il body per non riversare risposte enormi nei log', () => {
    const err = new WahaSendError(500, 'x'.repeat(2000));
    expect(err.message.length).toBeLessThan(600);
  });
});
