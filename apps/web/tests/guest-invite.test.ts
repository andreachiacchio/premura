import { describe, expect, it } from 'vitest';
import { composeGuestInvite } from '../lib/guest-invite';

// L1: il messaggio da inbox promette solo cio' che esiste — chiede il
// numero in risposta, il link compare solo se configurato, firma =
// nome struttura, mai Premura.

const BASE = {
  guestFirstName: 'Julian',
  guestFullName: 'Julian Falch Milde',
  propertyName: 'Villa Cristina',
  language: 'en',
  guestAppUrl: 'https://andreachiacchio.github.io/villa-cristina-guest-app/',
};

describe('composeGuestInvite', () => {
  it('EN con link e richiesta del numero', () => {
    const text = composeGuestInvite(BASE);
    expect(text).toContain('Hi Julian!');
    expect(text).toContain(BASE.guestAppUrl);
    expect(text).toContain('reply here with your phone number');
    expect(text.endsWith('Villa Cristina')).toBe(true);
    expect(text).not.toMatch(/premura/i);
  });

  it('senza URL la riga del link sparisce, niente link rotti', () => {
    const text = composeGuestInvite({ ...BASE, guestAppUrl: null });
    expect(text).not.toContain('http');
    expect(text).toContain('reply here with your phone number');
  });

  it('IT per ospiti italiani', () => {
    const text = composeGuestInvite({ ...BASE, language: 'it' });
    expect(text).toContain('Ciao Julian!');
    expect(text).toContain('rispondi qui con il tuo numero');
  });
});
