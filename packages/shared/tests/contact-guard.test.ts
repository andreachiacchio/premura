import { describe, expect, it } from 'vitest';
import { findForbiddenPhone } from '../src/contact-guard';

// REGOLA DI BUSINESS: i contatti dei fornitori non escono mai verso
// l'ospite. Questi test inchiodano il rilevamento: qualsiasi formato
// del numero di Antonio dentro un testo in uscita deve essere trovato.

const ANTONIO = '+393500328207';

describe('findForbiddenPhone', () => {
  it('trova il numero in ogni formato che un modello puo scrivere', () => {
    const formats = [
      'Call Antonio at +39 350 032 8207 to book',
      'il numero è 3500328207',
      'his number: 350.032.8207',
      'WhatsApp: +39-350-032-8207!',
      'chiama il 350 03 28 207',
    ];
    for (const body of formats) {
      expect(findForbiddenPhone(body, [ANTONIO]), body).toBe(ANTONIO);
    }
  });

  it('non scatta su testi senza il numero (prezzi, date, contatti host-side)', () => {
    const safe = [
      'Full day €900, half day €550, sunset €350 — which do you prefer?',
      'Paolo will meet you at La Moressa restaurant in Praiano: +39 340 488 7726',
      'Check-in 1 Aug 2026 at 15:00, 6 guests',
      '',
    ];
    for (const body of safe) {
      expect(findForbiddenPhone(body, [ANTONIO]), body).toBeNull();
    }
  });

  it('numeri null o vuoti in lista vengono ignorati', () => {
    expect(findForbiddenPhone('call me at 3500328207', [null, undefined, ''])).toBeNull();
  });

  it('numeri troppo corti non generano varianti (niente falsi positivi su date)', () => {
    expect(findForbiddenPhone('arrivo il 1/8/2026', ['182026'])).toBeNull();
  });

  it('piu fornitori: trova quello giusto', () => {
    const chef = '+393331112223';
    expect(findForbiddenPhone('the chef: 333 111 2223', [ANTONIO, chef])).toBe(chef);
  });
});
