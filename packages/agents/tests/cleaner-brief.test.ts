import type { KitItem } from '@premura/db';
import { describe, expect, it } from 'vitest';
import {
  buildAmazonSearchUrl,
  buildGlovoSearchUrl,
  composeCleanerBrief,
  computeAmazonOrderByDate,
} from '../src/kit-generator/cleaner-brief';

// Slice C — Test composer WA brief Karen (pure, no rete).

const items: KitItem[] = [
  {
    taxonomyKey: 'caffe_napoletano_confezionato',
    specificDescription: 'Kimbo bustina filtro x10',
    quantity: 1,
    estimatedPriceEur: 4,
    fonte: 'amazon',
    leadTime: '2_days',
  },
  {
    taxonomyKey: 'pasticceria_fresca_napoletana',
    specificDescription: 'Pasticciotti Scaturchio x2',
    quantity: 2,
    estimatedPriceEur: 5,
    fonte: 'glovo',
    leadTime: 'same_day',
  },
  {
    taxonomyKey: 'biglietto_manoscritto',
    specificDescription: 'Biglietto pre-stampato',
    quantity: 1,
    estimatedPriceEur: 0,
    fonte: 'manual_write',
    leadTime: '1_hour',
  },
];

const baseInput = {
  property: { name: 'La Goccia' },
  booking: {
    checkinAt: new Date('2026-05-15T14:30:00Z'),
    guestFullName: 'Lena Mueller',
  },
  cleaner: { fullName: 'Karen' },
  items,
  cardMessage: 'Lena, benvenuta a La Goccia. Buon soggiorno a Napoli. — Andrea',
  cardLanguage: 'it' as const,
  amazonLockerAddress: 'Locker Vomero, Via Scarlatti 12',
  arrivalEta: new Date('2026-05-13T10:00:00Z'),
  defaultPlacement: null,
};

describe('composeCleanerBrief', () => {
  it('include nome cleaner + property + check-in date', () => {
    const out = composeCleanerBrief(baseInput);
    expect(out).toContain('Ciao Karen');
    expect(out).toContain('La Goccia');
    expect(out).toMatch(/check-in 1[45]\/05/); // tolleranza UTC
  });

  it('include sezione RITIRO Amazon Locker se Amazon items presenti', () => {
    const out = composeCleanerBrief(baseInput);
    expect(out).toContain('📦 RITIRO');
    expect(out).toContain('Amazon Locker');
    expect(out).toContain('Locker Vomero');
  });

  it('include sezione RITIRO Glovo same-day', () => {
    const out = composeCleanerBrief(baseInput);
    expect(out).toContain('Mattina check-in ordino io Glovo a casa tua');
  });

  it('include items per setup', () => {
    const out = composeCleanerBrief(baseInput);
    expect(out).toContain('Kimbo bustina filtro x10');
    expect(out).toContain('Pasticciotti Scaturchio x2');
  });

  it('include biglietto manoscritto con cardMessage', () => {
    const out = composeCleanerBrief(baseInput);
    expect(out).toContain('Biglietto manoscritto');
    expect(out).toContain('scrivi a mano');
    expect(out).toContain(baseInput.cardMessage);
  });

  it('default placement = "tavolo cucina" se override null', () => {
    const out = composeCleanerBrief(baseInput);
    expect(out).toContain('📋 DOVE LASCIARE: tavolo cucina');
  });

  it('rispetta override property_knowledge.kit_default_placement', () => {
    const out = composeCleanerBrief({
      ...baseInput,
      defaultPlacement: 'comodino camera matrimoniale',
    });
    expect(out).toContain('📋 DOVE LASCIARE: comodino camera matrimoniale');
  });

  it('include footer foto + pagamento + conferma 👍', () => {
    const out = composeCleanerBrief(baseInput);
    expect(out).toContain('📸');
    expect(out).toContain('foto del setup');
    expect(out).toContain('€2 cumulativo a fine mese');
    expect(out).toContain('Tutto chiaro? Confermami con 👍');
  });

  it('omette sezione Amazon se non ci sono Amazon items', () => {
    const out = composeCleanerBrief({
      ...baseInput,
      items: items.filter((i) => i.fonte !== 'amazon'),
    });
    expect(out).not.toContain('Amazon Locker');
  });

  it('omette sezione Glovo se non ci sono Glovo items', () => {
    const out = composeCleanerBrief({
      ...baseInput,
      items: items.filter((i) => i.fonte !== 'glovo'),
    });
    expect(out).not.toContain('Glovo a casa tua');
  });

  it("lingua: solo italiano (Karen e' italiana)", () => {
    const out = composeCleanerBrief(baseInput);
    // No parole inglesi nel template
    expect(out).not.toMatch(/\bWelcome\b/i);
    expect(out).not.toMatch(/\bsetup completed\b/i);
  });
});

describe('computeAmazonOrderByDate', () => {
  it('ritorna data 2 giorni prima del check-in', () => {
    const checkin = new Date('2026-05-15T14:30:00Z');
    const orderBy = computeAmazonOrderByDate(checkin);
    expect(orderBy.getDate()).toBe(13);
    expect(orderBy.getMonth()).toBe(4); // 0-indexed mag = 4
  });
});

describe('buildAmazonSearchUrl', () => {
  it('encode query string per amazon.it', () => {
    const url = buildAmazonSearchUrl('Kimbo bustina filtro caffè');
    expect(url).toContain('https://www.amazon.it/s?k=');
    expect(url).toContain('Kimbo');
    expect(url).toContain('caff%C3%A8'); // accento encoded
  });
});

describe('buildGlovoSearchUrl', () => {
  it('encode query string per glovo napoli', () => {
    const url = buildGlovoSearchUrl('Scaturchio');
    expect(url).toContain('glovoapp.com/it/it/napoli/s');
    expect(url).toContain('Scaturchio');
  });
});
