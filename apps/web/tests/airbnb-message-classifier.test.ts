import { describe, expect, it } from 'vitest';
import { classifyAirbnbMessage } from '../lib/airbnb-message-classifier';

// Test classifier deterministico Airbnb message email (slice 7a.2).
// Pattern subject reali: 6 varianti italiano + inglese.

describe('classifyAirbnbMessage - italiano', () => {
  it('"Nuovo messaggio da Mario Rossi" -> message', () => {
    const r = classifyAirbnbMessage('Nuovo messaggio da Mario Rossi');
    expect(r.type).toBe('message');
    if (r.type === 'message') expect(r.senderName).toBe('Mario Rossi');
  });

  it('"Hai un nuovo messaggio da Anna Schmidt" -> message', () => {
    const r = classifyAirbnbMessage('Hai un nuovo messaggio da Anna Schmidt');
    expect(r.type).toBe('message');
    if (r.type === 'message') expect(r.senderName).toBe('Anna Schmidt');
  });

  it('"Mario Rossi ti ha inviato un messaggio" -> message', () => {
    const r = classifyAirbnbMessage('Mario Rossi ti ha inviato un messaggio');
    expect(r.type).toBe('message');
    if (r.type === 'message') expect(r.senderName).toBe('Mario Rossi');
  });

  it('"Anna ti ha scritto un messaggio" -> message', () => {
    const r = classifyAirbnbMessage('Anna ti ha scritto un messaggio');
    expect(r.type).toBe('message');
    if (r.type === 'message') expect(r.senderName).toBe('Anna');
  });

  it('subject con suffisso "su Airbnb" -> nome estratto pulito', () => {
    const r = classifyAirbnbMessage('Nuovo messaggio da John Smith su Airbnb');
    expect(r.type).toBe('message');
    if (r.type === 'message') expect(r.senderName).toBe('John Smith');
  });
});

describe('classifyAirbnbMessage - inglese', () => {
  it('"New message from John Smith" -> message', () => {
    const r = classifyAirbnbMessage('New message from John Smith');
    expect(r.type).toBe('message');
    if (r.type === 'message') expect(r.senderName).toBe('John Smith');
  });

  it('"You have a new message from Mary Jane" -> message', () => {
    const r = classifyAirbnbMessage('You have a new message from Mary Jane');
    expect(r.type).toBe('message');
    if (r.type === 'message') expect(r.senderName).toBe('Mary Jane');
  });

  it('"John Smith sent you a message" -> message', () => {
    const r = classifyAirbnbMessage('John Smith sent you a message');
    expect(r.type).toBe('message');
    if (r.type === 'message') expect(r.senderName).toBe('John Smith');
  });

  it('subject con codice "New message from John Smith (HM4XYZ)" -> nome pulito', () => {
    const r = classifyAirbnbMessage('New message from John Smith (HM4XYZ)');
    expect(r.type).toBe('message');
    if (r.type === 'message') expect(r.senderName).toBe('John Smith');
  });
});

describe('classifyAirbnbMessage - non-message (false positives da escludere)', () => {
  it('"Nuova prenotazione confermata!" -> not_message', () => {
    expect(classifyAirbnbMessage('Nuova prenotazione confermata!').type).toBe('not_message');
  });

  it('"Promemoria recensione" -> not_message', () => {
    expect(classifyAirbnbMessage('Promemoria recensione').type).toBe('not_message');
  });

  it('"Update da Airbnb" simile a "Update da X" -> not_message (boilerplate)', () => {
    expect(classifyAirbnbMessage('Nuovo messaggio da Update Airbnb').type).toBe('not_message');
  });

  it('subject che dice "L\'ospite ti ha scritto" senza vero nome -> not_message', () => {
    expect(classifyAirbnbMessage("L'ospite ti ha inviato un messaggio").type).toBe('not_message');
  });

  it('subject vuoto -> not_message', () => {
    expect(classifyAirbnbMessage('').type).toBe('not_message');
  });

  it('subject random -> not_message', () => {
    expect(classifyAirbnbMessage('Special discount inside!').type).toBe('not_message');
  });
});
