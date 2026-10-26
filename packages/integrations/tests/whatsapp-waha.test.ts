import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  WahaSendError,
  chatIdToPhone,
  checkNumberOnWhatsapp,
  clearLidCache,
  parseWahaWebhook,
  resolveLidToPhone,
  sendImageViaWaha,
  sendTextViaWaha,
  toChatId,
} from '../src/whatsapp-waha';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  clearLidCache();
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

// Payload reale del 26/10 12:39 (WAHA WEBJS, immagine 2026-10-02), cosi'
// com'e' arrivato: WhatsApp reale verso il 3514512070. Era scartato in
// silenzio per media: null. _data era omesso nella cattura.
const REAL_PAYLOAD_26_10 = {
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
};

const envelope = (payload: unknown, event = 'message') => ({
  event,
  session: 'default',
  engine: 'WEBJS',
  payload,
});

function message(out: ReturnType<typeof parseWahaWebhook>) {
  if (out.kind !== 'message') throw new Error(`atteso un messaggio, arrivato ${out.kind}`);
  return out.message;
}

describe('parseWahaWebhook', () => {
  it('estrae un messaggio in arrivo', () => {
    const out = message(
      parseWahaWebhook({
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
      }),
    );

    expect(out).toMatchObject({
      event: 'message',
      session: 'default',
      messageId: 'false_4748356805@c.us_XYZ',
      from: '4748356805',
      senderLid: null,
      fromMe: false,
      text: 'Hi, what time is check-in?',
      hasMedia: false,
    });
    expect(out.timestamp.toISOString()).toBe(new Date(1785000000 * 1000).toISOString());
  });

  it('A) legge il payload reale del 26/10: media null, location null, mittente LID', () => {
    const out = message(parseWahaWebhook(envelope(REAL_PAYLOAD_26_10)));
    expect(out).toMatchObject({
      messageId: 'false_163505126793314@lid_3A7B3B34FB8CEF55FFE9',
      // Nessun numero nel payload: resta il LID intero, che non sembra
      // un telefono e non aggancia una prenotazione per errore.
      from: '163505126793314@lid',
      senderLid: '163505126793314@lid',
      text: 'Test premura',
      hasMedia: false,
      mediaUrl: null,
      ack: 1,
    });
  });

  it('A) accetta null su ogni campo facoltativo letto', () => {
    const out = parseWahaWebhook({
      event: 'message',
      session: null,
      payload: {
        id: 'a',
        from: '4748356805@c.us',
        timestamp: null,
        to: null,
        fromMe: null,
        body: null,
        hasMedia: null,
        ack: null,
        media: null,
      },
    });
    expect(out.kind).toBe('message');
  });

  it('riconosce i messaggi inviati da noi (fromMe) — servono per l handover', () => {
    const out = message(
      parseWahaWebhook({
        event: 'message.any',
        payload: { id: 'true_x_Y', from: '393514512070@c.us', fromMe: true, body: 'rispondo io' },
      }),
    );
    expect(out.fromMe).toBe(true);
  });

  it('sopravvive a un payload senza timestamp', () => {
    const out = message(
      parseWahaWebhook({
        event: 'message',
        payload: { id: 'a', from: '4748356805@c.us', body: 'x' },
      }),
    );
    expect(out.timestamp).toBeInstanceOf(Date);
  });

  it('B) un payload che non sa leggere dice cosa non andava, non ritorna null', () => {
    const out = parseWahaWebhook(
      envelope({ from: '4748356805@c.us', body: 'segreto', media: 'non-un-oggetto' }),
    );
    expect(out).toMatchObject({
      kind: 'invalid',
      event: 'message',
      payloadKeys: ['from', 'body', 'media'],
    });
    if (out.kind !== 'invalid') return;
    expect(out.issues.some((i) => i.startsWith('payload.id'))).toBe(true);
    expect(out.issues.some((i) => i.startsWith('payload.media'))).toBe(true);
    // Le chiavi si', i valori mai: il testo dell'ospite non va nei log.
    expect(JSON.stringify(out)).not.toContain('segreto');
  });

  it('B) un body che non e un evento WAHA e invalido, non ignorato', () => {
    expect(parseWahaWebhook({ entry: [{ changes: [] }] }).kind).toBe('invalid');
    expect(parseWahaWebhook(null).kind).toBe('invalid');
    expect(parseWahaWebhook({ event: 'message' }).kind).toBe('invalid');
  });
});

describe('C) numero del mittente gia nel payload', () => {
  it('usa _data.senderPn se WAHA lo porta accanto al LID', () => {
    const out = message(
      parseWahaWebhook(
        envelope({ ...REAL_PAYLOAD_26_10, _data: { senderPn: '393383963307@c.us' } }),
      ),
    );
    expect(out.from).toBe('393383963307');
    expect(out.senderLid).toBe('163505126793314@lid');
  });

  it('usa author se e un numero, anche come Wid { _serialized }', () => {
    expect(
      message(parseWahaWebhook(envelope({ ...REAL_PAYLOAD_26_10, author: '393383963307@c.us' })))
        .from,
    ).toBe('393383963307');
    expect(
      message(
        parseWahaWebhook(
          envelope({
            ...REAL_PAYLOAD_26_10,
            _data: { from: { _serialized: '393383963307@c.us' } },
          }),
        ),
      ).from,
    ).toBe('393383963307');
  });

  it('non prende mai il numero della struttura (to) per quello dell ospite', () => {
    const out = message(
      parseWahaWebhook(
        envelope({ ...REAL_PAYLOAD_26_10, _data: { to: '393514512070@c.us', from: '1@lid' } }),
      ),
    );
    expect(out.from).toBe('163505126793314@lid');
  });
});

describe('D) filtro: solo chat individuali, solo messaggi', () => {
  const base = { id: 'a', body: 'x', fromMe: false };

  it.each([
    ['gruppo', { ...base, from: '120363025246125486@g.us', author: '4748356805@c.us' }],
    ['stati', { ...base, from: 'status@broadcast', author: '4748356805@c.us' }],
    ['canale', { ...base, from: '120363170000000000@newsletter' }],
    ['nostro messaggio in un gruppo', { ...base, from: '393514512070@c.us', to: '1203@g.us' }],
  ])('%s: ignorato', (_label, payload) => {
    expect(parseWahaWebhook(envelope(payload)).kind).toBe('ignored');
  });

  it.each(['message.ack', 'session.status', 'presence.update', 'message.reaction'])(
    'evento %s: ignorato prima dello schema, non invalido',
    (event) => {
      const out = parseWahaWebhook({ event, session: 'default', payload: { status: 'WORKING' } });
      expect(out).toEqual({ kind: 'ignored', reason: `evento ${event}` });
    },
  );
});

describe('C) resolveLidToPhone', () => {
  it('chiede a WAHA il numero dietro il LID', async () => {
    fetchMock.mockResolvedValue(ok({ lid: '163505126793314@lid', pn: '393383963307@c.us' }));
    await expect(resolveLidToPhone('163505126793314@lid', 'default')).resolves.toBe('393383963307');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://waha.example.com/api/default/lids/163505126793314%40lid');
    expect((init.headers as Record<string, string>)['X-Api-Key']).toBe('chiave-di-test');
  });

  it('tiene il risultato in memoria per sessione: il secondo messaggio non richiama', async () => {
    fetchMock.mockResolvedValue(ok({ pn: '393383963307@c.us' }));
    await resolveLidToPhone('163505126793314@lid', 'default');
    await resolveLidToPhone('163505126793314@lid', 'default');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await resolveLidToPhone('163505126793314@lid', 'altra-sessione');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('ritorna null senza lanciare se WAHA non sa o non risponde', async () => {
    fetchMock.mockResolvedValueOnce(ok({ lid: '1@lid', pn: null }));
    await expect(resolveLidToPhone('1@lid')).resolves.toBeNull();

    fetchMock.mockResolvedValueOnce({ ok: false, status: 404, text: async () => 'not found' });
    await expect(resolveLidToPhone('1@lid')).resolves.toBeNull();

    fetchMock.mockRejectedValueOnce(new Error('tunnel giu'));
    await expect(resolveLidToPhone('1@lid')).resolves.toBeNull();
  });

  it('un fallimento non resta in cache: al messaggio dopo si riprova', async () => {
    fetchMock.mockRejectedValueOnce(new Error('tunnel giu'));
    await resolveLidToPhone('1@lid');
    fetchMock.mockResolvedValueOnce(ok({ pn: '393383963307@c.us' }));
    await expect(resolveLidToPhone('1@lid')).resolves.toBe('393383963307');
  });

  it('senza configurazione WAHA ritorna null, non lancia', async () => {
    vi.stubEnv('WAHA_URL', '');
    await expect(resolveLidToPhone('1@lid')).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('WahaSendError', () => {
  it('tronca il body per non riversare risposte enormi nei log', () => {
    const err = new WahaSendError(500, 'x'.repeat(2000));
    expect(err.message.length).toBeLessThan(600);
  });
});
