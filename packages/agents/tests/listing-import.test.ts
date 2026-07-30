import { describe, expect, it } from 'vitest';
import { normalizeListingExtraction } from '../src/onboarding/listing-import';

// "Mai inventare" come proprieta' verificabile: la normalizzazione non
// deve MAI riempire un campo che il modello non ha emesso — null o
// lista vuota, mai default plausibili.

describe('normalizeListingExtraction', () => {
  it('output vuoto del modello = tutti i campi vuoti, niente default', () => {
    const data = normalizeListingExtraction({});
    expect(data).toEqual({
      nome: null,
      citta: null,
      indirizzoIpotizzato: null,
      tipo: null,
      postiLetto: null,
      descrizione: null,
      dotazioni: [],
      regole: [],
      checkin: null,
      checkout: null,
      quartiere: null,
      lingua: null,
    });
  });

  it('estrazione completa (caso La Goccia di San Gennaro)', () => {
    const data = normalizeListingExtraction({
      nome: 'La Goccia di San Gennaro (Jacuzzi - Centro Storico)',
      citta: 'Napoli',
      quartiere: 'Centro Storico',
      tipo: 'appartamento',
      posti_letto: 4,
      dotazioni: ['Jacuzzi', 'Wi-Fi', 'Aria condizionata'],
      regole: ['Non fumatori', 'No feste'],
      checkin: '15:00-20:00',
      checkout: 'entro le 10:00',
      lingua: 'it',
    });
    expect(data.nome).toBe('La Goccia di San Gennaro (Jacuzzi - Centro Storico)');
    expect(data.postiLetto).toBe(4);
    expect(data.dotazioni).toHaveLength(3);
    expect(data.indirizzoIpotizzato).toBeNull();
    expect(data.descrizione).toBeNull();
  });

  it('posti_letto non intero o fuori range = errore, non correzione silenziosa', () => {
    expect(() => normalizeListingExtraction({ posti_letto: 2.5 })).toThrow();
    expect(() => normalizeListingExtraction({ posti_letto: 0 })).toThrow();
    expect(() => normalizeListingExtraction({ posti_letto: 999 })).toThrow();
  });

  it('stringhe vuote non passano (il modello deve omettere, non svuotare)', () => {
    expect(() => normalizeListingExtraction({ nome: '' })).toThrow();
  });
});
