import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { toFlatInbound, verifyWahaSignature } from '../src/api/webhooks/waha';

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
