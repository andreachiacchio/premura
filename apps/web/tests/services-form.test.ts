import { describe, expect, it } from 'vitest';
import { serviceFormSchema, slugify } from '../lib/services-form';

// Sezione Servizi (30/07): validazione form e slug stabile.

describe('serviceFormSchema', () => {
  const base = {
    titleEn: 'Full-day boat tour',
    titleIt: '',
    category: 'boat_tour',
    descriptionEn: '',
    descriptionIt: '',
    photoUrl: '',
    salePriceEur: '120,50',
    priceOnRequest: false,
    providerId: '',
  };

  it('accetta un servizio valido con prezzo alla virgola italiana', () => {
    const parsed = serviceFormSchema.safeParse(base);
    expect(parsed.success).toBe(true);
  });

  it('rifiuta un nome troppo corto e un prezzo non numerico', () => {
    expect(serviceFormSchema.safeParse({ ...base, titleEn: 'A' }).success).toBe(false);
    expect(serviceFormSchema.safeParse({ ...base, salePriceEur: 'centoventi' }).success).toBe(
      false,
    );
  });

  it('con "prezzo su richiesta" il prezzo puo mancare', () => {
    const parsed = serviceFormSchema.safeParse({
      ...base,
      salePriceEur: '',
      priceOnRequest: true,
    });
    expect(parsed.success).toBe(true);
  });

  it('rifiuta un URL foto non valido', () => {
    expect(serviceFormSchema.safeParse({ ...base, photoUrl: 'non-un-url' }).success).toBe(false);
  });
});

describe('slugify', () => {
  it('kebab-case, accenti rimossi, mai vuoto', () => {
    expect(slugify('Full-day boat tour')).toBe('full-day-boat-tour');
    expect(slugify('Città del Sole — tour')).toBe('citta-del-sole-tour');
    expect(slugify('***')).toBe('servizio');
  });
});
