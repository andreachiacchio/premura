import { describe, it, expect } from 'vitest';
import { classifyBookingEmail, parseItalianDate } from '../lib/booking-email-classifier';

// Test del classifier deterministico per email Booking.com (M2a.3 Fase 3).
// Copre:
//   - 3 nuove (conferma standard, last minute, last minute con caratteri
//     speciali nell'estensione)
//   - 2 cancellazioni
//   - 2 modifiche
//   - 5 noise (Customer Service, Invoice, newsletter, marketing, weekly digest)

describe('classifyBookingEmail — new_booking', () => {
  it('subject conferma standard → new_booking + code estratto', () => {
    const got = classifyBookingEmail(
      'Booking.com - Hai una nuova prenotazione! (1234567890, La Goccia)',
    );
    expect(got.eventType).toBe('new_booking');
    expect(got.bookingExternalCode).toBe('1234567890');
  });

  it('subject last minute → new_booking + code estratto', () => {
    const got = classifyBookingEmail(
      'Booking.com - Nuova prenotazione last minute (9876543, La Goccia di S.Gennaro)',
    );
    expect(got.eventType).toBe('new_booking');
    expect(got.bookingExternalCode).toBe('9876543');
  });

  it('last minute con caratteri speciali nel nome struttura → new_booking', () => {
    const got = classifyBookingEmail(
      "Booking.com - Nuova prenotazione last minute (5555000, L'Ulivo & il Mare — Suite #2)",
    );
    expect(got.eventType).toBe('new_booking');
    expect(got.bookingExternalCode).toBe('5555000');
  });
});

describe('classifyBookingEmail — cancellation', () => {
  it('subject cancellata standard → cancellation + code', () => {
    const got = classifyBookingEmail(
      'Booking.com - Prenotazione cancellata! (1234567890, La Goccia)',
    );
    expect(got.eventType).toBe('cancellation');
    expect(got.bookingExternalCode).toBe('1234567890');
  });

  it('cancellata: code unico (parentesi chiusa subito) → cancellation', () => {
    const got = classifyBookingEmail(
      'Booking.com - Prenotazione cancellata! (4444444)',
    );
    expect(got.eventType).toBe('cancellation');
    expect(got.bookingExternalCode).toBe('4444444');
  });
});

describe('classifyBookingEmail — modification', () => {
  it('subject modificata standard → modification + code', () => {
    const got = classifyBookingEmail(
      'Booking.com - Prenotazione modificata! (7777000, Casa Vista Mare)',
    );
    expect(got.eventType).toBe('modification');
    expect(got.bookingExternalCode).toBe('7777000');
  });

  it('modificata con suffisso lungo → modification + code', () => {
    const got = classifyBookingEmail(
      'Booking.com - Prenotazione modificata! (3210987, Trastevere — appartamento ristrutturato 2024)',
    );
    expect(got.eventType).toBe('modification');
    expect(got.bookingExternalCode).toBe('3210987');
  });
});

describe('classifyBookingEmail — noise', () => {
  it('Customer Service → noise', () => {
    const got = classifyBookingEmail(
      'Booking.com Customer Service: Aggiornamento sulla tua prenotazione (1234)',
    );
    expect(got.eventType).toBe('noise');
    expect(got.bookingExternalCode).toBeNull();
  });

  it('Invoice → noise', () => {
    const got = classifyBookingEmail(
      'Booking.com - La tua fattura mensile è disponibile',
    );
    expect(got.eventType).toBe('noise');
    expect(got.bookingExternalCode).toBeNull();
  });

  it('Newsletter → noise', () => {
    const got = classifyBookingEmail(
      'Le novità di questa settimana da Booking.com',
    );
    expect(got.eventType).toBe('noise');
    expect(got.bookingExternalCode).toBeNull();
  });

  it('Marketing partner → noise', () => {
    const got = classifyBookingEmail(
      'Diventa Genius Partner: scopri i vantaggi dedicati agli host',
    );
    expect(got.eventType).toBe('noise');
    expect(got.bookingExternalCode).toBeNull();
  });

  it('Weekly digest → noise', () => {
    const got = classifyBookingEmail(
      'Booking.com - Riepilogo settimanale delle tue strutture',
    );
    expect(got.eventType).toBe('noise');
    expect(got.bookingExternalCode).toBeNull();
  });
});

describe('classifyBookingEmail — edge cases', () => {
  it('subject vuoto → noise', () => {
    const got = classifyBookingEmail('');
    expect(got.eventType).toBe('noise');
    expect(got.bookingExternalCode).toBeNull();
  });

  it('rawSubject preservato fedelmente (non normalizzato)', () => {
    const subj = 'Booking.com - Hai una nuova prenotazione! (123, Foo)';
    const got = classifyBookingEmail(subj);
    expect(got.rawSubject).toBe(subj);
  });
});

// Blocco 3 (03/08): il secondo campo delle parentesi nelle email REALI
// e' la data di check-in in italiano — fixture prese pari pari da
// booking_email_events di aprile (codici inclusi, sono gia' nostri).
describe('classifyBookingEmail — data di check-in dal subject', () => {
  it('cancellazione reale → code + data ISO', () => {
    const got = classifyBookingEmail(
      'Booking.com - Prenotazione cancellata! (5009228445, sabato 18 aprile 2026)',
    );
    expect(got.eventType).toBe('cancellation');
    expect(got.bookingExternalCode).toBe('5009228445');
    expect(got.checkinDateIso).toBe('2026-04-18');
  });

  it('nuova prenotazione reale → data ISO', () => {
    const got = classifyBookingEmail(
      'Booking.com - Hai una nuova prenotazione! (5575765766, giovedì 15 luglio 2027)',
    );
    expect(got.eventType).toBe('new_booking');
    expect(got.checkinDateIso).toBe('2027-07-15');
  });

  it('modificata reale → data ISO', () => {
    const got = classifyBookingEmail(
      'Booking.com - Prenotazione modificata! (5009228445, sabato 18 aprile 2026)',
    );
    expect(got.eventType).toBe('modification');
    expect(got.checkinDateIso).toBe('2026-04-18');
  });

  it('giorno della settimana accentato (venerdì 1 agosto) → data ISO', () => {
    const got = classifyBookingEmail(
      'Booking.com - Hai una nuova prenotazione! (111222333, venerdì 1 agosto 2026)',
    );
    expect(got.checkinDateIso).toBe('2026-08-01');
  });

  it('coda non-data (nome struttura, vecchio formato ipotizzato) → data null, classificazione intatta', () => {
    const got = classifyBookingEmail(
      'Booking.com - Hai una nuova prenotazione! (1234567890, La Goccia)',
    );
    expect(got.eventType).toBe('new_booking');
    expect(got.bookingExternalCode).toBe('1234567890');
    expect(got.checkinDateIso).toBeNull();
  });

  it('parentesi col solo codice → data null', () => {
    const got = classifyBookingEmail('Booking.com - Prenotazione cancellata! (99887766)');
    expect(got.eventType).toBe('cancellation');
    expect(got.bookingExternalCode).toBe('99887766');
    expect(got.checkinDateIso).toBeNull();
  });
});

describe('parseItalianDate', () => {
  it('tutti i mesi', () => {
    const mesi = [
      ['gennaio', '01'],
      ['febbraio', '02'],
      ['marzo', '03'],
      ['aprile', '04'],
      ['maggio', '05'],
      ['giugno', '06'],
      ['luglio', '07'],
      ['agosto', '08'],
      ['settembre', '09'],
      ['ottobre', '10'],
      ['novembre', '11'],
      ['dicembre', '12'],
    ] as const;
    for (const [mese, mm] of mesi) {
      expect(parseItalianDate(`lunedì 5 ${mese} 2026`)).toBe(`2026-${mm}-05`);
    }
  });

  it('mese sconosciuto → null', () => {
    expect(parseItalianDate('lunedì 5 frimaio 2026')).toBeNull();
  });

  it('giorno fuori range → null', () => {
    expect(parseItalianDate('lunedì 40 aprile 2026')).toBeNull();
  });

  it('testo libero senza data → null', () => {
    expect(parseItalianDate('La Goccia di San Gennaro')).toBeNull();
  });
});
