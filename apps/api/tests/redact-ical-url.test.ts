import { describe, it, expect } from 'vitest';
import { redactIcalUrl } from '../src/jobs/redact-ical-url';

// Test del helper di redaction URL iCal. Copre i due provider reali
// (Booking, Airbnb), i casi senza query string, e gli edge case di input
// non parsabile (malformato, vuoto). La query mascherata ha sempre il
// formato ?***REDACTED***.

describe('redactIcalUrl - URL validi con query', () => {
  it('Booking iCal con token t -> ?***REDACTED***', () => {
    expect(
      redactIcalUrl(
        'https://ical.booking.com/v1/export?t=47e1d765-abcd-1234-5678-9876543210fe',
      ),
    ).toBe('https://ical.booking.com/v1/export?***REDACTED***');
  });

  it('Airbnb iCal con token s -> ?***REDACTED***', () => {
    expect(
      redactIcalUrl(
        'https://www.airbnb.com/calendar/ical/12345.ics?s=secret-token-xyz',
      ),
    ).toBe('https://www.airbnb.com/calendar/ical/12345.ics?***REDACTED***');
  });

  it('URL con multipli query param -> tutta la query mascherata', () => {
    expect(
      redactIcalUrl('https://example.com/feed?t=x&user=foo&debug=1'),
    ).toBe('https://example.com/feed?***REDACTED***');
  });

  it('URL con query e hash fragment -> mascherato (hash perso, accettabile)', () => {
    expect(redactIcalUrl('https://example.com/feed?t=secret#frag')).toBe(
      'https://example.com/feed?***REDACTED***',
    );
  });
});

describe('redactIcalUrl - URL senza query', () => {
  it('URL pulito -> invariato', () => {
    expect(redactIcalUrl('https://example.com/feed.ics')).toBe(
      'https://example.com/feed.ics',
    );
  });

  it('URL con solo hash fragment -> invariato (preserva hash)', () => {
    expect(redactIcalUrl('https://example.com/feed.ics#section')).toBe(
      'https://example.com/feed.ics#section',
    );
  });
});

describe('redactIcalUrl - input non parsabile', () => {
  it('stringa libera -> "(invalid url)"', () => {
    expect(redactIcalUrl('not a url at all')).toBe('(invalid url)');
  });

  it('stringa vuota -> "(invalid url)"', () => {
    expect(redactIcalUrl('')).toBe('(invalid url)');
  });

  it('host senza schema -> "(invalid url)"', () => {
    expect(redactIcalUrl('example.com/feed')).toBe('(invalid url)');
  });
});
