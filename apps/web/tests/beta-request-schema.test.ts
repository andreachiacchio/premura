import { describe, expect, it } from 'vitest';
import {
  MAX_PROPERTY_COUNT_BETA,
  MIN_PROPERTY_COUNT_BETA,
  betaRequestBodySchema,
} from '../lib/beta-request-schema';

// Slice I — schema validation richiesta accesso beta.

describe('betaRequestBodySchema', () => {
  function validBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      email: 'andrea@example.com',
      fullName: 'Andrea Chiacchio',
      propertyCount: 2,
      privacyAccepted: true,
      ...overrides,
    };
  }

  it('accetta payload minimo valido', () => {
    const parsed = betaRequestBodySchema.parse(validBody());
    expect(parsed.email).toBe('andrea@example.com');
    expect(parsed.fullName).toBe('Andrea Chiacchio');
    expect(parsed.propertyCount).toBe(2);
    expect(parsed.cityAndType).toBeUndefined();
  });

  it('email trimmata + lowercase', () => {
    const parsed = betaRequestBodySchema.parse(validBody({ email: '  ANDREA@EXAMPLE.com  ' }));
    expect(parsed.email).toBe('andrea@example.com');
  });

  it('rifiuta email invalida', () => {
    const result = betaRequestBodySchema.safeParse(validBody({ email: 'not-an-email' }));
    expect(result.success).toBe(false);
  });

  it('rifiuta fullName vuoto', () => {
    const result = betaRequestBodySchema.safeParse(validBody({ fullName: '   ' }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain('nome');
    }
  });

  it(`propertyCount fuori range ${MIN_PROPERTY_COUNT_BETA}-${MAX_PROPERTY_COUNT_BETA} rifiutato`, () => {
    expect(betaRequestBodySchema.safeParse(validBody({ propertyCount: 0 })).success).toBe(false);
    expect(betaRequestBodySchema.safeParse(validBody({ propertyCount: 100 })).success).toBe(false);
    expect(betaRequestBodySchema.safeParse(validBody({ propertyCount: 2.5 })).success).toBe(false);
  });

  it('cityAndType vuoto trasformato in undefined', () => {
    const parsed = betaRequestBodySchema.parse(validBody({ cityAndType: '' }));
    expect(parsed.cityAndType).toBeUndefined();
  });

  it('cityAndType valido preservato', () => {
    const parsed = betaRequestBodySchema.parse(
      validBody({ cityAndType: 'Bologna, 2 app centro storico' }),
    );
    expect(parsed.cityAndType).toBe('Bologna, 2 app centro storico');
  });

  it('cityAndType > 240 char rifiutato', () => {
    const long = 'x'.repeat(241);
    expect(betaRequestBodySchema.safeParse(validBody({ cityAndType: long })).success).toBe(false);
  });

  it('privacyAccepted false rifiutato', () => {
    const result = betaRequestBodySchema.safeParse(validBody({ privacyAccepted: false }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain('privacy');
    }
  });

  it('privacyAccepted missing rifiutato', () => {
    const body = validBody();
    body.privacyAccepted = undefined;
    expect(betaRequestBodySchema.safeParse(body).success).toBe(false);
  });
});
