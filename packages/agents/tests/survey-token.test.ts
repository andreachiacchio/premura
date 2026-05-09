import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { signSurveyToken, verifySurveyToken } from '../src/survey-token';

// Slice B — Test JWT signed survey token (HMAC SHA-256).

const TEST_SECRET = 'a'.repeat(32);

describe('signSurveyToken / verifySurveyToken', () => {
  beforeEach(() => {
    vi.stubEnv('SURVEY_TOKEN_SECRET', TEST_SECRET);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('round-trip: sign → verify', () => {
    const expiresAt = Date.now() + 60_000;
    const token = signSurveyToken('booking-123', expiresAt);
    const result = verifySurveyToken(token);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.bid).toBe('booking-123');
      expect(result.payload.exp).toBeGreaterThan(0);
    }
  });

  it('expired token -> reason=expired', () => {
    const past = Date.now() - 60_000;
    const token = signSurveyToken('booking-123', past);
    const result = verifySurveyToken(token);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('expired');
  });

  it('tampered payload -> invalid_signature', () => {
    const token = signSurveyToken('booking-123', Date.now() + 60_000);
    const parts = token.split('.');
    // Modifica il payload (cambia la 'a' in 'b' nella prima posizione safe)
    const tampered = `${parts[0]}.${(parts[1] ?? '').replace(/.$/, 'X')}.${parts[2]}`;
    const result = verifySurveyToken(tampered);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('invalid_signature');
  });

  it('garbage string -> invalid_format', () => {
    const result = verifySurveyToken('not-a-jwt');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('invalid_format');
  });

  it('empty string -> invalid_format', () => {
    const result = verifySurveyToken('');
    expect(result.ok).toBe(false);
  });

  it('missing secret -> sign throws', () => {
    vi.unstubAllEnvs();
    expect(() => signSurveyToken('b1', Date.now() + 60_000)).toThrow(/SURVEY_TOKEN_SECRET/);
  });
});
