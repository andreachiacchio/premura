import { describe, expect, it } from 'vitest';
import { normalizePhone } from '../lib/phone-normalize';

// Slice A — Test normalizzazione numeri telefono.
// libphonenumber-js wrapper: input flessibile -> E.164.

describe('normalizePhone', () => {
  describe('valid Italian formats', () => {
    it('+39 333 1234567 -> +393331234567', () => {
      const r = normalizePhone('+39 333 1234567');
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.e164).toBe('+393331234567');
    });

    it('+393331234567 (gia E.164) -> stessa stringa', () => {
      const r = normalizePhone('+393331234567');
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.e164).toBe('+393331234567');
    });

    it('333 1234567 (no prefix, default IT) -> +393331234567', () => {
      const r = normalizePhone('333 1234567');
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.e164).toBe('+393331234567');
    });

    it('338 39 63307 (formato libero italiano) -> +393383963307', () => {
      const r = normalizePhone('338 39 63307');
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.e164).toBe('+393383963307');
    });

    it('+39-333-1234567 (con dash) -> +393331234567', () => {
      const r = normalizePhone('+39-333-1234567');
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.e164).toBe('+393331234567');
    });
  });

  describe('valid international formats', () => {
    it('+33612345678 (FR) -> stesso E.164', () => {
      const r = normalizePhone('+33612345678');
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.e164).toBe('+33612345678');
    });

    it('0033 6 12 34 56 78 (FR con 00 prefix) -> +33612345678', () => {
      const r = normalizePhone('0033 6 12 34 56 78');
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.e164).toBe('+33612345678');
    });
  });

  describe('invalid', () => {
    it('stringa vuota -> ok=false reason=empty', () => {
      const r = normalizePhone('');
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe('empty');
    });

    it('whitespace only -> empty', () => {
      const r = normalizePhone('   ');
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe('empty');
    });

    it('123 (troppo corto) -> invalid_format', () => {
      const r = normalizePhone('123');
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe('invalid_format');
    });

    it('numero non esistente +999... -> invalid_format o invalid_number', () => {
      const r = normalizePhone('+99999999999999');
      expect(r.ok).toBe(false);
    });

    it('lettere -> invalid_format', () => {
      const r = normalizePhone('abc def ghi');
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe('invalid_format');
    });
  });
});
