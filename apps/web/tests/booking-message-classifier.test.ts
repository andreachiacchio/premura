import { describe, expect, it } from 'vitest';
import {
  classifyBookingMessage,
  extractBookingMessagePreview,
} from '../lib/booking-message-classifier';

// Test classifier deterministico Booking message email (slice 7a.2).
// Corpus simulato basato sui pattern subject reali documentati in
// docs/booking-strategy.md §1.3 e KNOWN-LIMITS.md §9.

describe('classifyBookingMessage - subject italiano', () => {
  it('"Booking.com - Hai un nuovo messaggio da Mario Rossi" -> message + sender', () => {
    const r = classifyBookingMessage('Booking.com - Hai un nuovo messaggio da Mario Rossi');
    expect(r.type).toBe('message');
    if (r.type === 'message') {
      expect(r.senderName).toBe('Mario Rossi');
      expect(r.bookingExternalCode).toBeNull();
    }
  });

  it('"Booking.com - Hai ricevuto un messaggio da Anna Schmidt" -> message', () => {
    const r = classifyBookingMessage('Booking.com - Hai ricevuto un messaggio da Anna Schmidt');
    expect(r.type).toBe('message');
    if (r.type === 'message') {
      expect(r.senderName).toBe('Anna Schmidt');
    }
  });

  it('subject con codice prenotazione "(1234567, abc)" -> code estratto', () => {
    const r = classifyBookingMessage(
      'Booking.com - Hai un nuovo messaggio da Mario Rossi (1234567, La Goccia)',
    );
    expect(r.type).toBe('message');
    if (r.type === 'message') {
      expect(r.senderName).toBe('Mario Rossi');
      expect(r.bookingExternalCode).toBe('1234567');
    }
  });
});

describe('classifyBookingMessage - subject inglese', () => {
  it('"Booking.com - You have a new message from John Smith" -> message', () => {
    const r = classifyBookingMessage('Booking.com - You have a new message from John Smith');
    expect(r.type).toBe('message');
    if (r.type === 'message') {
      expect(r.senderName).toBe('John Smith');
    }
  });

  it('"Booking.com - New message from John Smith (1234567, La Goccia)" -> message + code', () => {
    const r = classifyBookingMessage(
      'Booking.com - New message from John Smith (1234567, La Goccia)',
    );
    expect(r.type).toBe('message');
    if (r.type === 'message') {
      expect(r.senderName).toBe('John Smith');
      expect(r.bookingExternalCode).toBe('1234567');
    }
  });
});

describe('classifyBookingMessage - non-message', () => {
  it('"Booking.com - Hai una nuova prenotazione!" -> not_message (e new_booking nel classifier event)', () => {
    expect(
      classifyBookingMessage('Booking.com - Hai una nuova prenotazione! (1234567, La Goccia)').type,
    ).toBe('not_message');
  });

  it('"Booking.com - Prenotazione cancellata!" -> not_message', () => {
    expect(
      classifyBookingMessage('Booking.com - Prenotazione cancellata! (1234567, La Goccia)').type,
    ).toBe('not_message');
  });

  it('subject senza prefix Booking.com -> not_message (newsletter, marketing)', () => {
    expect(classifyBookingMessage('Special offer just for you!').type).toBe('not_message');
  });

  it('subject vuoto -> not_message', () => {
    expect(classifyBookingMessage('').type).toBe('not_message');
  });

  it('"Booking.com - Hai un nuovo messaggio" senza nome -> not_message (no sender)', () => {
    expect(classifyBookingMessage('Booking.com - Hai un nuovo messaggio da').type).toBe(
      'not_message',
    );
  });
});

describe('extractBookingMessagePreview - signal-only fallback', () => {
  it('snippet con "Apri Extranet" -> signal_only true, preview null', () => {
    const r = extractBookingMessagePreview(
      '<html><body>Hai ricevuto un nuovo messaggio. Apri Extranet per leggerlo.</body></html>',
      'Hai ricevuto un nuovo messaggio. Apri Extranet per leggerlo.',
      'Hai ricevuto un nuovo messaggio. Apri Extranet per leggerlo.',
    );
    expect(r.signalOnly).toBe(true);
    expect(r.preview).toBeNull();
    expect(r.truncated).toBe(false);
  });

  it('blockquote presente -> preview estratto, no signal_only', () => {
    const html =
      '<html><body><p>Header</p><blockquote>Ciao, posso fare check-in alle 16 invece delle 14?</blockquote></body></html>';
    const r = extractBookingMessagePreview(html, '', '');
    expect(r.signalOnly).toBe(false);
    expect(r.preview).toBe('Ciao, posso fare check-in alle 16 invece delle 14?');
    expect(r.truncated).toBe(false);
  });

  it('preview piu lungo di 800 char -> truncated true + suffisso ...', () => {
    const longText = 'a'.repeat(900);
    const html = `<html><body><blockquote>${longText}</blockquote></body></html>`;
    const r = extractBookingMessagePreview(html, '', '');
    expect(r.preview?.endsWith('...')).toBe(true);
    expect(r.preview?.length).toBe(803); // 800 + ...
    expect(r.truncated).toBe(true);
  });

  it('text body con header "Messaggio:" -> preview da text body', () => {
    const text = [
      'Booking.com',
      '',
      'Messaggio:',
      'Buongiorno, vorrei sapere se ci sono parcheggi vicini.',
      'Grazie!',
      '',
      'Apri Extranet per rispondere',
    ].join('\n');
    const r = extractBookingMessagePreview('', text, '');
    expect(r.signalOnly).toBe(false);
    expect(r.preview).toContain('parcheggi');
    expect(r.preview).not.toContain('Apri Extranet');
  });

  it('niente HTML, niente text utile, snippet generico -> preview = snippet', () => {
    const r = extractBookingMessagePreview('', '', 'Buongiorno, possiamo arrivare alle 18');
    expect(r.signalOnly).toBe(false);
    expect(r.preview).toBe('Buongiorno, possiamo arrivare alle 18');
  });
});
