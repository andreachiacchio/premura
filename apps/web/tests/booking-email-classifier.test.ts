import { describe, it, expect } from 'vitest';
import { classifyBookingEmail } from '../lib/booking-email-classifier';

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
