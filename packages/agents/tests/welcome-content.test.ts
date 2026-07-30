import { describe, expect, it } from 'vitest';
import { composeBookingWelcome } from '../src/outbound/welcome-content';

// Il benvenuto e' contenuto FISSO: questi test inchiodano il testo
// parola per parola. Se qualcuno lo cambia, il test glielo fa dichiarare.
//
// La fixture usa i dati REALI del go-live (decisioni Andrea 30/07):
// URL della guest app e meeting point Paolo/La Moressa. Il primo test
// e' letteralmente il messaggio che parte a Julian il 1 agosto.

const JULIAN = {
  guestFirstName: 'Julian',
  guestFullName: 'Julian Falch Milde',
  propertyName: 'Villa Cristina',
  checkinAt: new Date('2026-08-01T13:00:00Z'),
  language: 'en',
  guestAppUrl: 'https://andreachiacchio.github.io/villa-cristina-guest-app/',
  meetingPoint: {
    name: 'Paolo',
    place: 'La Moressa restaurant in Praiano',
    phone: '+39 340 488 7726',
  },
  aiDisclosureCustom: null,
};

describe('composeBookingWelcome', () => {
  it('EN completo — il testo che parte a Julian', () => {
    // Correzioni Andrea 30/07: niente doppio "Hi" (la disclosure saluta
    // gia'), meeting point qualificato ("restaurant in Praiano" — Julian
    // e' norvegese, "La Moressa" da solo non dice cos'e'), e NIENTE
    // "type human": promessa non collegata a nessun handover nel codice.
    expect(composeBookingWelcome(JULIAN)).toBe(
      'Hi! You’re chatting with Villa Cristina’s automated assistant.\n' +
        '\n' +
        "Julian, welcome! We're delighted to host you at Villa Cristina from Saturday 1 August.\n" +
        '\n' +
        'Paolo will meet you at La Moressa restaurant in Praiano — message him to arrange the time: +39 340 488 7726\n' +
        '\n' +
        "Here you'll find everything for your stay — house info and our local services (boat tours, transfers, private chef): https://andreachiacchio.github.io/villa-cristina-guest-app/\n" +
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
    expect(text).toContain('Julian, welcome!');
  });

  it('IT per ospiti italiani, meeting point incluso', () => {
    const text = composeBookingWelcome({ ...JULIAN, language: 'it' });
    expect(text).toContain('Julian, benvenuto!');
    expect(text).not.toContain('Ciao Julian');
    expect(text).toContain('sabato 1 agosto');
    expect(text).toContain(
      "All'arrivo Paolo ti aspetta a La Moressa restaurant in Praiano — scrivigli per concordare l'orario: +39 340 488 7726",
    );
    expect(text.endsWith('A presto,\nVilla Cristina')).toBe(true);
  });

  it('senza guest app URL la riga sparisce, niente link rotti', () => {
    const text = composeBookingWelcome({ ...JULIAN, guestAppUrl: null });
    expect(text).not.toContain('http');
    expect(text).toContain('Julian, welcome!');
  });

  it('la promessa "type human" non esiste finche non esiste l handover', () => {
    for (const language of ['en', 'it']) {
      const text = composeBookingWelcome({ ...JULIAN, language });
      expect(text).not.toMatch(/human|operatore/i);
    }
  });

  it('senza meeting point la riga sparisce, mai persone inventate', () => {
    const text = composeBookingWelcome({ ...JULIAN, meetingPoint: null });
    expect(text).not.toContain('Paolo');
    expect(text).not.toContain('will meet you');
  });

  it('firma = nome della struttura, mai Premura nel testo', () => {
    const text = composeBookingWelcome(JULIAN);
    expect(text).not.toMatch(/premura/i);
    expect(text.endsWith('Villa Cristina')).toBe(true);
  });

  it('senza first name usa il nome completo', () => {
    const text = composeBookingWelcome({ ...JULIAN, guestFirstName: null });
    expect(text).toContain('Julian Falch Milde, welcome!');
  });

  it('disclosure custom dell host sostituisce il default', () => {
    const text = composeBookingWelcome({
      ...JULIAN,
      aiDisclosureCustom: { en: 'Automated assistant of Villa Cristina here.' },
    });
    expect(text.startsWith('Automated assistant of Villa Cristina here.')).toBe(true);
  });
});
