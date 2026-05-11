import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { composeMagicLinkMessage } from '../src/cleaner-auth/cleaner-magic-link';
import { signCleanerToken, verifyCleanerToken } from '../src/cleaner-auth/cleaner-token';

// Slice D — Test token cleaner + magic link composer (pure, no rete).

const SECRET = 'test-secret-cleaner-token-min-32-chars-long-ok';

describe('signCleanerToken + verifyCleanerToken', () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.CLEANER_TOKEN_SECRET;
    process.env.CLEANER_TOKEN_SECRET = SECRET;
  });

  afterEach(() => {
    process.env.CLEANER_TOKEN_SECRET = originalEnv;
  });

  it('roundtrip sign + verify ritorna payload con cid corretto', () => {
    const t = signCleanerToken('cleaner-uuid-1');
    const r = verifyCleanerToken(t);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.payload.cid).toBe('cleaner-uuid-1');
  });

  it("payload exp e' nel futuro (TTL default 30 giorni)", () => {
    const t = signCleanerToken('cleaner-uuid-2');
    const r = verifyCleanerToken(t);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const now = Math.floor(Date.now() / 1000);
      expect(r.payload.exp).toBeGreaterThan(now);
      // ~30 giorni (con tolleranza 1 minuto)
      expect(r.payload.exp - now).toBeGreaterThan(29 * 24 * 3600);
      expect(r.payload.exp - now).toBeLessThanOrEqual(30 * 24 * 3600 + 60);
    }
  });

  it('TTL custom 1 giorno', () => {
    const t = signCleanerToken('cleaner-uuid-3', 1);
    const r = verifyCleanerToken(t);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const now = Math.floor(Date.now() / 1000);
      expect(r.payload.exp - now).toBeLessThanOrEqual(24 * 3600 + 60);
    }
  });

  it('verify ritorna invalid_format se non ci sono 3 parti', () => {
    const r = verifyCleanerToken('not.a.valid.token.format');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('invalid_format');
  });

  it('verify ritorna invalid_signature se hash manipolato', () => {
    const t = signCleanerToken('cleaner-uuid');
    const parts = t.split('.');
    const tampered = `${parts[0]}.${parts[1]}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`;
    const r = verifyCleanerToken(tampered);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('invalid_signature');
  });

  it('verify con secret diverso rifiuta', () => {
    const t = signCleanerToken('cleaner-uuid');
    process.env.CLEANER_TOKEN_SECRET = 'another-secret-min-32-chars-long-okkkkkkk';
    const r = verifyCleanerToken(t);
    expect(r.ok).toBe(false);
  });

  it('throw se secret non configurato o troppo corto', () => {
    process.env.CLEANER_TOKEN_SECRET = 'short';
    expect(() => signCleanerToken('x')).toThrow(/min 32/);
  });
});

describe('composeMagicLinkMessage', () => {
  it('IT: include nome + Premura + url', () => {
    const msg = composeMagicLinkMessage({
      firstName: 'Karen',
      language: 'it',
      url: 'https://premura.it/c/abc.def.ghi',
    });
    expect(msg).toContain('Ciao Karen');
    expect(msg).toContain('Premura');
    expect(msg).toContain('https://premura.it/c/abc.def.ghi');
    expect(msg).toContain('Aggiungi a Home');
  });

  it('EN: traduzione corretta', () => {
    const msg = composeMagicLinkMessage({
      firstName: 'Maria',
      language: 'en',
      url: 'https://premura.it/c/xyz',
    });
    expect(msg).toContain('Hi Maria');
    expect(msg).toContain('Open it from your phone');
    expect(msg).not.toContain('Ciao');
  });

  it('default (es / unknown) -> italiano', () => {
    const msg = composeMagicLinkMessage({
      firstName: 'X',
      language: 'es',
      url: 'https://premura.it/c/x',
    });
    expect(msg).toContain('Ciao X');
  });
});
