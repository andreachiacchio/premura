import { randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Generiamo una chiave di test valida (32 byte base64) e la iniettiamo
// nelle env PRIMA di importare il modulo sotto test. I moduli sono ESM:
// usiamo top-level await? No — vitest esegue il file in ordine, quindi
// settiamo process.env all'inizio e poi `await import()` dinamico.

const TEST_KEY = randomBytes(32).toString('base64');

// Setup env di base prima di ogni import dinamico nei test.
function resetEnv() {
  process.env.TOKEN_ENCRYPTION_KEY = TEST_KEY;
  process.env.APP_URL = 'http://localhost:3000';
  process.env.GOOGLE_CLIENT_ID = 'test-client-id.apps.googleusercontent.com';
  process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
}

async function importFresh() {
  vi.resetModules();
  return await import('../lib/google-oauth');
}

beforeEach(() => {
  resetEnv();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─────────────────────────────────────────────────────────────
// encryptToken / decryptToken
// ─────────────────────────────────────────────────────────────

describe('encryptToken / decryptToken', () => {
  it('round-trip: cifra e decifra la stessa stringa', async () => {
    const { encryptToken, decryptToken } = await importFresh();
    const plaintext = 'ya29.a0Acc3_e7xD8VHfA.long-access-token';
    const encrypted = encryptToken(plaintext);
    expect(encrypted).not.toBe(plaintext);
    expect(decryptToken(encrypted)).toBe(plaintext);
  });

  it('due cifrature dello stesso plaintext producono ciphertext diversi (IV casuale)', async () => {
    const { encryptToken } = await importFresh();
    const plaintext = 'short-token';
    const a = encryptToken(plaintext);
    const b = encryptToken(plaintext);
    expect(a).not.toBe(b);
  });

  it('decryptToken rifiuta ciphertext manomesso (auth tag mismatch)', async () => {
    const { encryptToken, decryptToken } = await importFresh();
    const encrypted = encryptToken('hello');
    // Flippiamo l'ultimo byte del buffer decodificato
    const buf = Buffer.from(encrypted, 'base64');
    const lastByte = buf.at(buf.length - 1) ?? 0;
    buf[buf.length - 1] = lastByte ^ 0xff;
    const tampered = buf.toString('base64');
    expect(() => decryptToken(tampered)).toThrow(/auth tag mismatch/i);
  });

  it('decryptToken rifiuta ciphertext troppo corto', async () => {
    const { decryptToken } = await importFresh();
    expect(() => decryptToken('dGlueQ==')).toThrow(/troppo corto/i);
  });

  it('encryptToken rifiuta plaintext vuoto', async () => {
    const { encryptToken } = await importFresh();
    expect(() => encryptToken('')).toThrow(/plaintext vuoto/);
  });

  it('decryptToken rifiuta input vuoto', async () => {
    const { decryptToken } = await importFresh();
    expect(() => decryptToken('')).toThrow(/input vuoto/);
  });

  it('errore chiaro se TOKEN_ENCRYPTION_KEY manca', async () => {
    delete process.env.TOKEN_ENCRYPTION_KEY;
    const { encryptToken } = await importFresh();
    expect(() => encryptToken('x')).toThrow(/TOKEN_ENCRYPTION_KEY mancante/);
  });

  it('errore chiaro se TOKEN_ENCRYPTION_KEY non è 32 byte', async () => {
    process.env.TOKEN_ENCRYPTION_KEY = Buffer.from('troppo corta').toString('base64');
    const { encryptToken } = await importFresh();
    expect(() => encryptToken('x')).toThrow(/32 byte/);
  });

  it('decryptToken fallisce con key diversa (ciphertext cifrato con altra key)', async () => {
    const { encryptToken } = await importFresh();
    const encrypted = encryptToken('segreto');
    // Cambia key, re-importa, tenta decrypt
    process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString('base64');
    const { decryptToken } = await importFresh();
    expect(() => decryptToken(encrypted)).toThrow(/auth tag mismatch/i);
  });
});

// ─────────────────────────────────────────────────────────────
// signState / verifyState
// ─────────────────────────────────────────────────────────────

describe('signState / verifyState', () => {
  it('round-trip: firma e verifica payload identico', async () => {
    const { signState, verifyState } = await importFresh();
    const payload = { hostId: 'host-uuid-123', nonce: 'abc123' };
    const token = await signState(payload);
    const verified = await verifyState(token);
    expect(verified).toEqual(payload);
  });

  it('verifyState rifiuta token con firma invalida', async () => {
    const { signState } = await importFresh();
    const token = await signState({ hostId: 'h', nonce: 'n' });
    // Cambia key, re-importa
    process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString('base64');
    const { verifyState, StateInvalidError } = await importFresh();
    await expect(verifyState(token)).rejects.toThrow(StateInvalidError);
    await expect(verifyState(token)).rejects.toThrow(/firma invalida/);
  });

  it('verifyState rifiuta token scaduto', async () => {
    // Firmiamo manualmente un JWT con expiry nel passato
    const { SignJWT } = await import('jose');
    const key = new Uint8Array(Buffer.from(TEST_KEY, 'base64'));
    const nowSec = Math.floor(Date.now() / 1000);
    const expired = await new SignJWT({ hostId: 'h', nonce: 'n' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(nowSec - 1200) // 20 min fa
      .setExpirationTime(nowSec - 600) // scaduto 10 min fa
      .sign(key);

    const { verifyState, StateInvalidError } = await importFresh();
    await expect(verifyState(expired)).rejects.toThrow(StateInvalidError);
    await expect(verifyState(expired)).rejects.toThrow(/scaduto/);
  });

  it('verifyState rifiuta token malformato', async () => {
    const { verifyState, StateInvalidError } = await importFresh();
    await expect(verifyState('non-un-jwt')).rejects.toThrow(StateInvalidError);
  });

  it('verifyState rifiuta token vuoto', async () => {
    const { verifyState, StateInvalidError } = await importFresh();
    await expect(verifyState('')).rejects.toThrow(StateInvalidError);
    await expect(verifyState('')).rejects.toThrow(/mancante/);
  });

  it('verifyState rifiuta JWT senza hostId', async () => {
    // Firmiamo manualmente un JWT con payload incompleto
    const { SignJWT } = await import('jose');
    const key = new Uint8Array(Buffer.from(TEST_KEY, 'base64'));
    const token = await new SignJWT({ nonce: 'solo-nonce' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('60s')
      .sign(key);

    const { verifyState, StateInvalidError } = await importFresh();
    await expect(verifyState(token)).rejects.toThrow(StateInvalidError);
    await expect(verifyState(token)).rejects.toThrow(/senza hostId/);
  });
});

// ─────────────────────────────────────────────────────────────
// buildAuthUrl
// ─────────────────────────────────────────────────────────────

describe('buildAuthUrl', () => {
  it('genera URL Google OAuth con scope, redirect, state firmato', async () => {
    const { buildAuthUrl, verifyState } = await importFresh();
    const url = await buildAuthUrl('test-host-id');

    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe(
      'https://accounts.google.com/o/oauth2/v2/auth',
    );
    const params = parsed.searchParams;

    expect(params.get('client_id')).toBe('test-client-id.apps.googleusercontent.com');
    expect(params.get('redirect_uri')).toBe('http://localhost:3000/api/auth/google/callback');
    expect(params.get('response_type')).toBe('code');
    expect(params.get('access_type')).toBe('offline');
    expect(params.get('prompt')).toBe('consent');

    const scope = params.get('scope') ?? '';
    expect(scope).toContain('openid');
    expect(scope).toContain('email');
    expect(scope).toContain('https://www.googleapis.com/auth/gmail.readonly');

    const state = params.get('state');
    expect(state).toBeTruthy();
    const verified = await verifyState(state!);
    expect(verified.hostId).toBe('test-host-id');
    expect(verified.nonce).toMatch(/^[0-9a-f]{32}$/); // 16 byte hex
  });

  it('genera state diversi a ogni chiamata (nonce casuale)', async () => {
    const { buildAuthUrl } = await importFresh();
    const a = new URL(await buildAuthUrl('h')).searchParams.get('state');
    const b = new URL(await buildAuthUrl('h')).searchParams.get('state');
    expect(a).not.toBe(b);
  });

  it('errore se hostId vuoto', async () => {
    const { buildAuthUrl } = await importFresh();
    await expect(buildAuthUrl('')).rejects.toThrow(/hostId obbligatorio/);
  });

  it('errore se GOOGLE_CLIENT_ID manca', async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    const { buildAuthUrl } = await importFresh();
    await expect(buildAuthUrl('h')).rejects.toThrow(/GOOGLE_CLIENT_ID mancante/);
  });
});

// ─────────────────────────────────────────────────────────────
// exchangeCodeForTokens (solo state validation, no chiamata Google vera)
// ─────────────────────────────────────────────────────────────

describe('exchangeCodeForTokens', () => {
  it('rifiuta code vuoto', async () => {
    const { exchangeCodeForTokens, TokenExchangeError } = await importFresh();
    await expect(exchangeCodeForTokens('', 'state')).rejects.toThrow(TokenExchangeError);
    await expect(exchangeCodeForTokens('', 'state')).rejects.toThrow(/code mancante/);
  });

  it('propaga StateInvalidError se state manomesso', async () => {
    const { exchangeCodeForTokens, StateInvalidError } = await importFresh();
    await expect(exchangeCodeForTokens('fake-code', 'invalid-state')).rejects.toThrow(
      StateInvalidError,
    );
  });

  it('successo: mock getToken + verifyIdToken → ritorna ExchangedTokens', async () => {
    const mod = await importFresh();
    const state = await mod.signState({ hostId: 'host-42', nonce: 'nonce-abc' });

    // Mock dei metodi istanza di OAuth2Client via spyOn sul prototype
    const { OAuth2Client } = await import('google-auth-library');
    const expiryMs = Date.now() + 3600 * 1000;

    const getTokenSpy = vi
      .spyOn(OAuth2Client.prototype, 'getToken')
      // @ts-expect-error — mock parziale della response
      .mockResolvedValue({
        tokens: {
          access_token: 'fake-access',
          refresh_token: 'fake-refresh',
          expiry_date: expiryMs,
          scope: 'openid email https://www.googleapis.com/auth/gmail.readonly',
          id_token: 'fake-id-token',
        },
      });

    const verifyIdTokenSpy = vi
      .spyOn(OAuth2Client.prototype, 'verifyIdToken')
      // @ts-expect-error — mock parziale del LoginTicket
      .mockResolvedValue({
        getPayload: () => ({ email: 'andrea@gmail.com', email_verified: true }),
      });

    const result = await mod.exchangeCodeForTokens('real-code', state);

    expect(getTokenSpy).toHaveBeenCalledWith('real-code');
    expect(verifyIdTokenSpy).toHaveBeenCalled();
    expect(result.hostId).toBe('host-42');
    expect(result.accessToken).toBe('fake-access');
    expect(result.refreshToken).toBe('fake-refresh');
    expect(result.googleEmail).toBe('andrea@gmail.com');
    expect(result.expiresAt.getTime()).toBe(expiryMs);
    expect(result.scope).toContain('gmail.readonly');
  });

  it('errore se refresh_token mancante (consent già concesso senza revoca)', async () => {
    const mod = await importFresh();
    const state = await mod.signState({ hostId: 'h', nonce: 'n' });

    const { OAuth2Client } = await import('google-auth-library');
    vi.spyOn(OAuth2Client.prototype, 'getToken')
      // @ts-expect-error — mock parziale
      .mockResolvedValue({
        tokens: {
          access_token: 'a',
          expiry_date: Date.now() + 3600 * 1000,
          id_token: 'i',
          // refresh_token mancante
        },
      });

    await expect(mod.exchangeCodeForTokens('c', state)).rejects.toThrow(
      /refresh_token mancante/,
    );
  });

  it('errore se email Google non verificata nell\'id_token', async () => {
    const mod = await importFresh();
    const state = await mod.signState({ hostId: 'h', nonce: 'n' });

    const { OAuth2Client } = await import('google-auth-library');
    vi.spyOn(OAuth2Client.prototype, 'getToken')
      // @ts-expect-error — mock parziale
      .mockResolvedValue({
        tokens: {
          access_token: 'a',
          refresh_token: 'r',
          expiry_date: Date.now() + 3600 * 1000,
          id_token: 'i',
        },
      });
    vi.spyOn(OAuth2Client.prototype, 'verifyIdToken')
      // @ts-expect-error — mock parziale
      .mockResolvedValue({
        getPayload: () => ({ email: 'andrea@gmail.com', email_verified: false }),
      });

    await expect(mod.exchangeCodeForTokens('c', state)).rejects.toThrow(
      /non verificata/,
    );
  });
});
