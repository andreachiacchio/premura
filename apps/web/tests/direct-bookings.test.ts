import { ANONYMOUS_ICAL_SOURCES, isRichDataSource } from '@premura/shared';
import { describe, expect, it } from 'vitest';
import { normalizeEuroAmount } from '../lib/euro-amount';
import { MAX_NIGHTS, nightsBetween } from '../lib/repositories/direct-bookings';

// Prenotazione diretta (Andrea 05/08): "va trattata come il caso
// migliore, non come fallback".
//
// Questi test inchiodano le invarianti da cui dipende l'assorbimento
// della fascia anonima. Il percorso completo tocca il DB e vive nei
// test di integrazione; qui restano le regole pure, che sono anche
// quelle che si rompono in silenzio.

describe('nightsBetween', () => {
  it('conta le notti fra due mezzanotti UTC', () => {
    expect(
      nightsBetween(new Date(Date.UTC(2026, 7, 10)), new Date(Date.UTC(2026, 7, 13))),
    ).toBe(3);
  });

  it('una notte sola', () => {
    expect(nightsBetween(new Date(Date.UTC(2026, 7, 10)), new Date(Date.UTC(2026, 7, 11)))).toBe(1);
  });

  it('stesse date -> 0, che l action rifiuta come intervallo non valido', () => {
    expect(nightsBetween(new Date(Date.UTC(2026, 7, 10)), new Date(Date.UTC(2026, 7, 10)))).toBe(0);
  });

  it('partenza prima dell arrivo -> negativo, mai un insert', () => {
    expect(
      nightsBetween(new Date(Date.UTC(2026, 7, 13)), new Date(Date.UTC(2026, 7, 10))),
    ).toBeLessThan(0);
  });

  it('attraversa il cambio di mese senza sbagliare', () => {
    expect(nightsBetween(new Date(Date.UTC(2026, 6, 30)), new Date(Date.UTC(2026, 7, 2)))).toBe(3);
  });

  it('attraversa il cambio dora legale senza sbagliare (confronto per giorno UTC)', () => {
    // 25/10/2026 e' il ritorno all'ora solare in Europa: con un
    // confronto basato su millisecondi locali questa sarebbe 2.99 notti.
    expect(nightsBetween(new Date(Date.UTC(2026, 9, 24)), new Date(Date.UTC(2026, 9, 27)))).toBe(3);
  });
});

describe('invarianti dell assorbimento', () => {
  it('direct_manual DEVE essere RICH, o l agente non parte e l upsert non protegge la riga', () => {
    // Se questo test cade: on-new-booking non parte sulla prenotazione
    // assorbita, e il ramo isCalendarBlock di upsertBookingShell puo'
    // farla sparire da tutte le viste.
    expect(isRichDataSource('direct_manual')).toBe(true);
  });

  it('direct_manual NON deve essere una fonte anonima, o il poll iCal ricrea il doppione', () => {
    // findCoveringNamedBookings filtra notInArray(dataSource,
    // ANON_SOURCES): se direct_manual finisse li', la riga assorbita
    // smetterebbe di coprire la fascia e la shell verrebbe reinserita.
    expect([...ANONYMOUS_ICAL_SOURCES]).not.toContain('direct_manual');
  });

  it('le fonti anonime sono quelle dei feed, non quelle incomplete', () => {
    expect([...ANONYMOUS_ICAL_SOURCES].sort()).toEqual(['airbnb_ical_only', 'booking_ical_only']);
  });

  it('le fonti anonime non sono RICH: sono proprio quelle da assorbire', () => {
    for (const s of ANONYMOUS_ICAL_SOURCES) {
      expect(isRichDataSource(s)).toBe(false);
    }
  });
});

// Prezzo: il separatore delle migliaia italiano. Un replace(',', '.')
// secco salvava "1.234,50" come 1,234 euro — e il prezzo pilota il
// budget del kit, quindi sbagliarlo di mille volte non e' un dettaglio.
describe('normalizeEuroAmount', () => {
  it('intero semplice', () => {
    expect(normalizeEuroAmount('450')).toBe('450');
  });

  it('virgola decimale italiana', () => {
    expect(normalizeEuroAmount('12,5')).toBe('12.5');
  });

  it('migliaia col punto + decimali con la virgola', () => {
    expect(normalizeEuroAmount('1.234,50')).toBe('1234.50');
  });

  it('migliaia col punto senza decimali NON diventa 1,234', () => {
    expect(normalizeEuroAmount('1.234')).toBe('1234');
  });

  it('punto decimale allanglosassone resta valido', () => {
    expect(normalizeEuroAmount('99.90')).toBe('99.90');
  });

  it('tollera spazi e simbolo euro', () => {
    expect(normalizeEuroAmount(' 1.500,00 €')).toBe('1500.00');
  });

  it('testo non numerico -> null, mai un NaN a database', () => {
    expect(normalizeEuroAmount('abc')).toBeNull();
    expect(normalizeEuroAmount('12abc')).toBeNull();
    expect(normalizeEuroAmount('')).toBeNull();
  });

  it('negativo rifiutato', () => {
    expect(normalizeEuroAmount('-50')).toBeNull();
  });
});

describe('tetto sulla durata', () => {
  it('un anno e un giorno non e un soggiorno', () => {
    expect(MAX_NIGHTS).toBe(365);
    expect(
      nightsBetween(new Date(Date.UTC(2026, 0, 1)), new Date(Date.UTC(2027, 0, 3))),
    ).toBeGreaterThan(MAX_NIGHTS);
  });
});
