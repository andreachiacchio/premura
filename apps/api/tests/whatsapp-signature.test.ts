import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyMetaSignature } from '../src/api/webhooks/whatsapp-signature';

// Unit test del verificatore HMAC SHA-256 per webhook WhatsApp Cloud API.
// Copre signature valida, signature fake, header malformato/mancante,
// body alterato, secret sbagliato, prefix sbagliato. La funzione e' pura
// (no Fastify), quindi i test girano in millisecondi.

const APP_SECRET = 'test-app-secret-not-real';

function signBody(body: Buffer | string, secret = APP_SECRET): string {
  const buf = typeof body === 'string' ? Buffer.from(body, 'utf8') : body;
  const digest = createHmac('sha256', secret).update(buf).digest('hex');
  return `sha256=${digest}`;
}

describe('verifyMetaSignature - signature valida', () => {
  it('body JSON canonico + header sha256= computato correttamente -> true', () => {
    const body = Buffer.from(
      JSON.stringify({ object: 'whatsapp_business_account', entry: [] }),
      'utf8',
    );
    const header = signBody(body);
    expect(verifyMetaSignature(body, header, APP_SECRET)).toBe(true);
  });

  it('body vuoto (Buffer 0 byte) + header valido per body vuoto -> true', () => {
    const body = Buffer.alloc(0);
    const header = signBody(body);
    expect(verifyMetaSignature(body, header, APP_SECRET)).toBe(true);
  });

  it('body con UTF-8 non-ASCII (italiano) -> true', () => {
    const body = Buffer.from(
      JSON.stringify({ msg: 'Ciao, chiavi nella keybox a destra del portone' }),
      'utf8',
    );
    const header = signBody(body);
    expect(verifyMetaSignature(body, header, APP_SECRET)).toBe(true);
  });
});

describe('verifyMetaSignature - signature non valida', () => {
  it('header undefined -> false', () => {
    const body = Buffer.from('{"x":1}', 'utf8');
    expect(verifyMetaSignature(body, undefined, APP_SECRET)).toBe(false);
  });

  it('header stringa vuota -> false', () => {
    const body = Buffer.from('{"x":1}', 'utf8');
    expect(verifyMetaSignature(body, '', APP_SECRET)).toBe(false);
  });

  it('header senza prefix sha256= -> false', () => {
    const body = Buffer.from('{"x":1}', 'utf8');
    const digest = createHmac('sha256', APP_SECRET).update(body).digest('hex');
    expect(verifyMetaSignature(body, digest, APP_SECRET)).toBe(false);
  });

  it('header con prefix sbagliato (sha1=) -> false', () => {
    const body = Buffer.from('{"x":1}', 'utf8');
    const digest = createHmac('sha256', APP_SECRET).update(body).digest('hex');
    expect(verifyMetaSignature(body, `sha1=${digest}`, APP_SECRET)).toBe(false);
  });

  it('hex troppo corto (32 char invece di 64) -> false', () => {
    const body = Buffer.from('{"x":1}', 'utf8');
    expect(verifyMetaSignature(body, `sha256=${'0'.repeat(32)}`, APP_SECRET)).toBe(false);
  });

  it('hex con caratteri non esadecimali -> false', () => {
    const body = Buffer.from('{"x":1}', 'utf8');
    expect(verifyMetaSignature(body, `sha256=${'z'.repeat(64)}`, APP_SECRET)).toBe(false);
  });

  it('hex valido ma firmato con secret diverso -> false', () => {
    const body = Buffer.from('{"x":1}', 'utf8');
    const header = signBody(body, 'wrong-secret');
    expect(verifyMetaSignature(body, header, APP_SECRET)).toBe(false);
  });

  it('body alterato dopo la firma (man-in-the-middle) -> false', () => {
    const original = Buffer.from('{"amount":10}', 'utf8');
    const tampered = Buffer.from('{"amount":1000}', 'utf8');
    const header = signBody(original);
    expect(verifyMetaSignature(tampered, header, APP_SECRET)).toBe(false);
  });

  it('hex tutto zero (firma fittizia) -> false', () => {
    const body = Buffer.from('{"x":1}', 'utf8');
    expect(verifyMetaSignature(body, `sha256=${'0'.repeat(64)}`, APP_SECRET)).toBe(false);
  });
});

describe('verifyMetaSignature - case insensitivity hex', () => {
  it('hex maiuscolo con stesso valore -> true (timing-safe compare opera sui buffer)', () => {
    const body = Buffer.from('{"x":1}', 'utf8');
    const lowerHeader = signBody(body);
    const upperHeader = `sha256=${lowerHeader.slice('sha256='.length).toUpperCase()}`;
    expect(verifyMetaSignature(body, upperHeader, APP_SECRET)).toBe(true);
  });
});
