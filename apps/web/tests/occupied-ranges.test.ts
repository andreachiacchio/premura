import { describe, expect, it } from 'vitest';
import {
  type OccupiedRange,
  abbreviatePropertyName,
  distanceLabel,
  fullDateRange,
  splitByUrgency,
} from '../lib/occupied-ranges';

// Ristrutturazione "Date occupate" (Andrea 30/07): gruppi per urgenza,
// chip struttura abbreviato, date complete mai troncate.

const NOW = new Date('2026-07-30T15:00:00+02:00');

function range(id: string, checkin: string, checkout: string, property = 'Villa Cristina') {
  return {
    id,
    propertyId: 'p1',
    propertyName: property,
    propertyColor: null,
    checkinAtIso: checkin,
    checkoutAtIso: checkout,
  } satisfies OccupiedRange;
}

describe('splitByUrgency', () => {
  it('entro 30 giorni = "da verificare ora", oltre = "più avanti", ordine cronologico', () => {
    const { current, soon, later } = splitByUrgency(
      [
        range('c', '2027-04-01T00:00:00Z', '2027-04-03T00:00:00Z'),
        range('a', '2026-08-20T00:00:00Z', '2026-08-24T00:00:00Z'),
        range('b', '2026-08-04T00:00:00Z', '2026-08-09T00:00:00Z'),
      ],
      NOW,
    );
    expect(current).toEqual([]);
    expect(soon.map((r) => r.id)).toEqual(['b', 'a']);
    expect(later.map((r) => r.id)).toEqual(['c']);
  });

  it('fascia occupata ADESSO finisce in "in corso ora", non fra le altre', () => {
    const { current, soon } = splitByUrgency(
      [
        range('now', '2026-07-28T00:00:00Z', '2026-08-02T00:00:00Z'),
        range('b', '2026-08-04T00:00:00Z', '2026-08-09T00:00:00Z'),
      ],
      NOW,
    );
    expect(current.map((r) => r.id)).toEqual(['now']);
    expect(soon.map((r) => r.id)).toEqual(['b']);
  });
});

describe('abbreviatePropertyName', () => {
  it('nomi corti restano interi', () => {
    expect(abbreviatePropertyName('Villa Cristina')).toBe('Villa Cristina');
  });

  it('"La Goccia di San Gennaro" -> "La Goccia di S.G."', () => {
    expect(abbreviatePropertyName('La Goccia di San Gennaro')).toBe('La Goccia di S.G.');
  });

  it('"La Napoli Sotterranea" -> "La Napoli S."', () => {
    expect(abbreviatePropertyName('La Napoli Sotterranea')).toBe('La Napoli S.');
  });
});

describe('fullDateRange', () => {
  it('stesso mese: "4 – 9 agosto 2026"', () => {
    expect(fullDateRange('2026-08-04T00:00:00Z', '2026-08-09T00:00:00Z')).toBe('4 – 9 agosto 2026');
  });

  it('mesi diversi: "30 luglio – 8 agosto 2026"', () => {
    expect(fullDateRange('2026-07-30T00:00:00Z', '2026-08-08T00:00:00Z')).toBe(
      '30 luglio – 8 agosto 2026',
    );
  });

  it('anni diversi: entrambi con anno', () => {
    expect(fullDateRange('2026-12-28T00:00:00Z', '2027-01-02T00:00:00Z')).toBe(
      '28 dicembre 2026 – 2 gennaio 2027',
    );
  });
});

describe('distanceLabel', () => {
  it('gruppo urgente: "fra N giorni" / "domani" / "in corso"', () => {
    expect(distanceLabel(range('x', '2026-08-04T00:00:00Z', '2026-08-09T00:00:00Z'), NOW)).toBe(
      'fra 5 giorni',
    );
    expect(distanceLabel(range('x', '2026-07-31T00:00:00Z', '2026-08-02T00:00:00Z'), NOW)).toBe(
      'domani',
    );
    expect(distanceLabel(range('x', '2026-07-28T00:00:00Z', '2026-08-01T00:00:00Z'), NOW)).toBe(
      'in corso',
    );
  });

  it('gruppo lontano: il mese, con anno se non corrente', () => {
    expect(distanceLabel(range('x', '2026-10-04T00:00:00Z', '2026-10-09T00:00:00Z'), NOW)).toBe(
      'ottobre',
    );
    expect(distanceLabel(range('x', '2027-04-01T00:00:00Z', '2027-04-03T00:00:00Z'), NOW)).toBe(
      'aprile 2027',
    );
  });
});
