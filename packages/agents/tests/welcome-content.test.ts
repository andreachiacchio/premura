import { describe, expect, it } from 'vitest';
import { composeBookingWelcome } from '../src/outbound/welcome-content';

// Il benvenuto e' contenuto FISSO: questi test inchiodano il testo
// parola per parola. Se qualcuno lo cambia, il test glielo fa dichiarare.

const JULIAN = {
  guestFirstName: 'Julian',
  guestFullName: 'Julian Falch Milde',
  propertyName: 'Villa Cristina',
  checkinAt: new Date('2026-08-01T13:00:00Z'),
  language: 'en',
  guestAppUrl: 'https://guest.premura.it/villa-cristina',
  contact: { name: 'Paolo', phone: '+39 000 000 0000' },
  aiDisclosureCustom: null,
};

describe('composeBookingWelcome', () => {
  it('EN completo — il testo che parte a Julian', () => {
    expect(composeBookingWelcome(JULIAN)).toBe(
      'Hi! You’re chatting with Villa Cristina’s automated assistant. Type “human” at any time to reach a person.\n' +
        '\n' +
        "Hi Julian, welcome! We're delighted to host you at Villa Cristina from Saturday 1 August.\n" +
        '\n' +
        "Here you'll find everything for your stay — house info and our local services (boat tours, transfers, private chef): https://guest.premura.it/villa-cristina\n" +
        '\n' +
        'For anything on site, Paolo is your contact: +39 000 000 0000.\n' +
        '\n' +
        'See you soon,\n' +
        'Villa Cristina',
    );
  });

  it('la disclosure AI e SEMPRE la prima riga', () => {
    for (const language of ['en', 'it', 'no', null]) {
      const text = composeBookingWelcome({ ...JULIAN, language });
      expect(
        text.startsWith('Hi! You’re chatting with') || text.startsWith('Ciao! Ti risponde'),
      ).toBe(true);
    }
  });

  it('lingua norvegese cade su EN (lingua di invio, non nazionalita)', () => {
    const text = composeBookingWelcome({ ...JULIAN, language: 'no' });
    expect(text).toContain('Hi Julian, welcome!');
  });

  it('IT per ospiti italiani', () => {
    const text = composeBookingWelcome({ ...JULIAN, language: 'it' });
    expect(text).toContain('Ciao Julian, benvenuto!');
    expect(text).toContain('sabato 1 agosto');
    expect(text.endsWith('A presto,\nVilla Cristina')).toBe(true);
  });

  it('senza guest app URL la riga sparisce, niente link rotti', () => {
    const text = composeBookingWelcome({ ...JULIAN, guestAppUrl: null });
    expect(text).not.toContain('http');
    expect(text).toContain('Hi Julian, welcome!');
  });

  it('senza referente la riga sparisce, mai numeri inventati', () => {
    const text = composeBookingWelcome({ ...JULIAN, contact: null });
    expect(text).not.toContain('Paolo');
    expect(text).not.toContain('your contact');
  });

  it('firma = nome della struttura, mai Premura nel testo', () => {
    // URL neutro: la PROSA non deve mai nominare Premura (decisione
    // blindata), ma il dominio del link e' una scelta dell'host — se
    // fosse premura.it rivelerebbe comunque il brand, e la segnalazione
    // sta nel report, non in questo test.
    const text = composeBookingWelcome({
      ...JULIAN,
      guestAppUrl: 'https://villacristinapraiano.com/guest',
    });
    expect(text).not.toMatch(/premura/i);
    expect(text.endsWith('Villa Cristina')).toBe(true);
  });

  it('senza first name usa il nome completo', () => {
    const text = composeBookingWelcome({ ...JULIAN, guestFirstName: null });
    expect(text).toContain('Hi Julian Falch Milde, welcome!');
  });

  it('disclosure custom dell host sostituisce il default', () => {
    const text = composeBookingWelcome({
      ...JULIAN,
      aiDisclosureCustom: { en: 'Automated assistant of Villa Cristina here.' },
    });
    expect(text.startsWith('Automated assistant of Villa Cristina here.')).toBe(true);
  });
});
