import { describe, expect, it } from 'vitest';
import type { WelcomeMessageCandidate } from '../src/welcome-message/welcome-finder';
import { generateWelcomeMessage } from '../src/welcome-message/welcome-generator';

// Slice E — Test welcome message generator (pure template).

const baseInput: WelcomeMessageCandidate = {
  kitId: 'kit-1',
  bookingId: 'booking-1',
  hostId: 'host-1',
  hostFullName: 'Andrea Chiacchio',
  hostFirstName: 'Andrea',
  guestFullName: 'Lena Mueller',
  guestFirstName: 'Lena',
  guestPhone: '+39 333 1234567',
  guestLanguage: 'it',
  propertyName: 'La Goccia',
  propertyId: 'prop-1',
  checkinAt: new Date('2026-05-15T14:30:00Z'),
  cleanerPhotoUrl: 'https://example/photo.jpg',
  cardMessage: 'Lena, benvenuta a La Goccia. Buon soggiorno a Napoli. — Andrea',
  cardMessageEn: 'Lena, welcome. Enjoy your stay in Naples. — Andrea',
  keyboxCode: '5821',
};

describe('generateWelcomeMessage IT', () => {
  it('include greeting con nome guest + property', () => {
    const out = generateWelcomeMessage(baseInput);
    expect(out.language).toBe('it');
    expect(out.text).toContain('Buongiorno Lena');
    expect(out.text).toContain('La Goccia');
    expect(out.text).toContain('Andrea Chiacchio');
    expect(out.text).toContain('benvenuto');
  });

  it('include keybox code se valorizzato', () => {
    const out = generateWelcomeMessage(baseInput);
    expect(out.hasKeybox).toBe(true);
    expect(out.text).toContain('codice della keybox è 5821');
  });

  it('omette keybox se null', () => {
    const out = generateWelcomeMessage({ ...baseInput, keyboxCode: null });
    expect(out.hasKeybox).toBe(false);
    expect(out.text).not.toContain('keybox');
  });

  it('include card message in italiano', () => {
    const out = generateWelcomeMessage(baseInput);
    expect(out.text).toContain('Lena, benvenuta a La Goccia');
  });

  it('firma con host name via Premura', () => {
    const out = generateWelcomeMessage(baseInput);
    expect(out.text).toContain('— Andrea Chiacchio via Premura');
  });

  it('fallback greeting deriva firstName da guestFullName', () => {
    const out = generateWelcomeMessage({
      ...baseInput,
      guestFirstName: null,
      guestFullName: 'Lena Mueller',
    });
    expect(out.text).toContain('Buongiorno Lena');
  });
});

describe('generateWelcomeMessage EN', () => {
  it('language en quando guestLanguage=en', () => {
    const out = generateWelcomeMessage({ ...baseInput, guestLanguage: 'en' });
    expect(out.language).toBe('en');
    expect(out.text).toContain('Good morning Lena');
    expect(out.text).toContain('La Goccia is ready');
    expect(out.text).toContain('keybox code is 5821');
    expect(out.text).toContain('Lena, welcome');
    expect(out.text).toContain('Have a wonderful stay');
    expect(out.text).toContain('— Andrea Chiacchio via Premura');
  });

  it('usa cardMessage EN se disponibile', () => {
    const out = generateWelcomeMessage({
      ...baseInput,
      guestLanguage: 'en',
      cardMessageEn: 'Custom EN card',
    });
    expect(out.text).toContain('Custom EN card');
  });

  it('fallback su cardMessage IT se EN mancante', () => {
    const out = generateWelcomeMessage({
      ...baseInput,
      guestLanguage: 'en',
      cardMessageEn: null,
    });
    expect(out.text).toContain('Lena, benvenuta a La Goccia');
  });
});

describe('generateWelcomeMessage edge cases', () => {
  it('fallback host name "il tuo host" se hostFullName null', () => {
    const out = generateWelcomeMessage({ ...baseInput, hostFullName: null });
    expect(out.text).toContain('il tuo host');
  });

  it("niente card message rende output piu' corto", () => {
    const out = generateWelcomeMessage({
      ...baseInput,
      cardMessage: null,
      cardMessageEn: null,
    });
    expect(out.text).not.toContain('«');
  });
});
