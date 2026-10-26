import { describe, expect, it } from 'vitest';
import {
  CANCEL_AFTER_MISSING_POLLS,
  planMissingUpdates,
  planRevivals,
  romeStartOfDay,
} from '../src/jobs/feed-reconciliation';

// Riconciliazione feed iCal: la decisione pura. Il vincolo "un poll
// fallito non conta" sta nel CHIAMANTE (il worker chiama solo dopo un
// parse riuscito); qui si verifica la meccanica del contatore e delle
// cancellazioni che Premura decide da sola (26/10).

const TODAY = new Date('2026-10-26T00:00:00Z');

// Un feed che risponde con ALTRI eventi: l'UID del target manca davvero.
// Un feed vuoto e' un caso a parte (non prova niente, vedi sotto).
const ALTRO = new Set(['uid-altro']);

const target = (
  id: string,
  count: number,
  flagged = false,
  dates?: [string, string],
  hostKeptActive = false,
) => ({
  id,
  platformBookingRef: `uid-${id}`,
  feedMissingCount: count,
  possibleCancellationAt: flagged ? new Date('2026-10-20T10:00:00Z') : null,
  checkinAt: new Date(dates?.[0] ?? '2026-12-01T00:00:00Z'),
  checkoutAt: new Date(dates?.[1] ?? '2026-12-05T00:00:00Z'),
  hostKeptActive,
});

// La fascia vista nel poll e la riga a cui l'upsert l'ha assegnata.
const range = (from: string, to: string, bookingId = 'altra-riga') => ({
  checkinAt: new Date(from),
  checkoutAt: new Date(to),
  bookingId,
});

describe('planMissingUpdates — osservazione', () => {
  it('primo poll senza evento: contatore a 1, nessun flag', () => {
    const plan = planMissingUpdates([target('a', 0)], ALTRO, [], TODAY);
    expect(plan.updates).toEqual([{ id: 'a', nextCount: 1, flagNow: false, cancelNow: false }]);
    expect(plan.resetIds).toEqual([]);
    expect(plan.supersededIds).toEqual([]);
  });

  it('secondo poll consecutivo senza evento: in osservazione, non cancellata', () => {
    const plan = planMissingUpdates([target('a', 1)], ALTRO, [], TODAY);
    expect(plan.updates).toEqual([{ id: 'a', nextCount: 2, flagNow: true, cancelNow: false }]);
  });

  it('evento riapparso: contatore e osservazione si azzerano', () => {
    const plan = planMissingUpdates(
      [target('a', 1), target('b', 2, true)],
      new Set(['uid-a', 'uid-b']),
      [],
      TODAY,
    );
    expect(plan.resetIds).toEqual(['a', 'b']);
    expect(plan.updates).toEqual([]);
  });

  it('evento presente e mai mancato: nessun update inutile', () => {
    const plan = planMissingUpdates([target('a', 0)], new Set(['uid-a']), [], TODAY);
    expect(plan.resetIds).toEqual([]);
    expect(plan.updates).toEqual([]);
  });

  it('gia in osservazione e ancora assente: il contatore sale ma il flag non si sovrascrive', () => {
    const plan = planMissingUpdates([target('a', 2, true)], ALTRO, [], TODAY);
    expect(plan.updates).toEqual([{ id: 'a', nextCount: 3, flagNow: false, cancelNow: false }]);
  });
});

// ─────────────────────────────────────────────────────────────────────
// A) Auto-risoluzione (26/10). Villa Cristina: 7 prenotazioni assenti
// dal feed da 5 a 67 giorni, mai risolte dall'host. Erano cancellazioni
// vere. Dopo 3 giorni di poll riusciti (288 a 15 minuti) decide Premura.
describe('A) assente dal feed per 3 giorni: cancella Premura', () => {
  it('la soglia e 3 giorni di poll a 15 minuti', () => {
    expect(CANCEL_AFTER_MISSING_POLLS).toBe(288);
  });

  it('assente 287 poll: ancora confirmed, solo in osservazione', () => {
    const plan = planMissingUpdates([target('a', 286, true)], ALTRO, [], TODAY);
    expect(plan.updates).toEqual([{ id: 'a', nextCount: 287, flagNow: false, cancelNow: false }]);
  });

  it('assente 288 poll: cancellata', () => {
    const plan = planMissingUpdates([target('a', 287, true)], ALTRO, [], TODAY);
    expect(plan.updates).toEqual([{ id: 'a', nextCount: 288, flagNow: false, cancelNow: true }]);
  });

  it('contatore gia oltre la soglia (le 7 del 26/10): cancellata al primo poll', () => {
    const plan = planMissingUpdates([target('a', 6429, true)], ALTRO, [], TODAY);
    expect(plan.updates).toEqual([{ id: 'a', nextCount: 6430, flagNow: false, cancelNow: true }]);
  });

  it('riapparsa a 287: si azzera e non viene cancellata', () => {
    const plan = planMissingUpdates([target('a', 287, true)], new Set(['uid-a']), [], TODAY);
    expect(plan.resetIds).toEqual(['a']);
    expect(plan.updates).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────
// B) Sovrapposizioni sulla stessa unita' (26/10).
//
// Booking accorcia la fascia al periodo residuo ogni notte e le assegna
// un UID nuovo (06/08, caso Julian). L'upsert aggiorna la riga che si
// sovrappone, ma se nel database ce n'erano GIA' due sovrapposte ne
// aggiorna una sola: l'altra perde l'UID e resta coperta dalla fascia
// nuova. Prima era "ancora coperta -> confirmed per sempre". Caso reale
// Villa Cristina: 22-30 ott (viva) e 27-30 ott (ferma dal 21/09, il
// "prossimo check-in" fantasma del 27).
describe('B) UID sparito ma date coperte: superseded', () => {
  const OTT_27_30: [string, string] = ['2026-10-27T00:00:00Z', '2026-10-30T00:00:00Z'];
  // La fascia residua della 22-30, riemessa stanotte con un UID nuovo.
  const RESIDUA_26_30 = range('2026-10-26T00:00:00Z', '2026-10-30T00:00:00Z');

  it('coperta da un altro evento dello stesso feed: superseded subito, senza contatore', () => {
    const plan = planMissingUpdates(
      [target('fantasma', 0, false, OTT_27_30)],
      new Set(['uid-residua']),
      [RESIDUA_26_30],
      TODAY,
    );
    expect(plan.supersededIds).toEqual(['fantasma']);
    expect(plan.updates).toEqual([]);
    expect(plan.resetIds).toEqual([]);
  });

  it('gia in osservazione e coperta: superseded, non resta confirmed', () => {
    const plan = planMissingUpdates(
      [target('fantasma', 8, true, OTT_27_30)],
      ALTRO,
      [RESIDUA_26_30],
      TODAY,
    );
    expect(plan.supersededIds).toEqual(['fantasma']);
    expect(plan.resetIds).toEqual([]);
  });

  it('una fascia che si TOCCA soltanto non copre: si conta come assente', () => {
    // Checkout il 30, nuovo check-in il 30: due soggiorni diversi.
    // Sovrapposizione stretta, non inclusiva.
    const plan = planMissingUpdates(
      [target('partito', 1, false, OTT_27_30)],
      ALTRO,
      [range('2026-10-30T00:00:00Z', '2026-11-02T00:00:00Z')],
      TODAY,
    );
    expect(plan.supersededIds).toEqual([]);
    expect(plan.updates).toEqual([
      { id: 'partito', nextCount: 2, flagNow: true, cancelNow: false },
    ]);
  });

  it('UID ancora nel feed: vince l UID, la sovrapposizione non conta', () => {
    const plan = planMissingUpdates(
      [target('viva', 0, false, OTT_27_30)],
      new Set(['uid-viva']),
      [RESIDUA_26_30],
      TODAY,
    );
    expect(plan.supersededIds).toEqual([]);
    expect(plan.updates).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Mai cancellare un soggiorno gia' iniziato: l'ospite e' in casa.
describe('check-in passato: mai cancellata', () => {
  const IN_CASA: [string, string] = ['2026-10-22T00:00:00Z', '2026-10-30T00:00:00Z'];

  it('assente oltre la soglia ma gia arrivato: nessuna cancellazione', () => {
    const plan = planMissingUpdates([target('in-casa', 287, true, IN_CASA)], ALTRO, [], TODAY);
    expect(plan.updates).toEqual([]);
    expect(plan.supersededIds).toEqual([]);
  });

  it('coperta da un altro evento ma gia arrivato: nessun superseded', () => {
    const plan = planMissingUpdates(
      [target('in-casa', 0, false, IN_CASA)],
      ALTRO,
      [range('2026-10-26T00:00:00Z', '2026-10-30T00:00:00Z')],
      TODAY,
    );
    expect(plan.supersededIds).toEqual([]);
    expect(plan.updates).toEqual([]);
  });

  it('check-in oggi conta come futuro: la regola vale', () => {
    const plan = planMissingUpdates(
      [target('oggi', 287, true, ['2026-10-26T00:00:00Z', '2026-10-28T00:00:00Z'])],
      ALTRO,
      [],
      TODAY,
    );
    expect(plan.updates).toEqual([{ id: 'oggi', nextCount: 288, flagNow: false, cancelNow: true }]);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Revisione 26/10: i casi che la prima versione sbagliava.

describe('feed vuoto: non prova niente', () => {
  it('nessun evento nel feed: nessun conteggio, nessuna cancellazione', () => {
    // Calendario scollegato o struttura disattivata: 200 con un
    // VCALENDAR vuoto. Tre giorni cosi' cancellerebbero tutta la casa.
    const plan = planMissingUpdates([target('a', 287, true), target('b', 0)], new Set(), [], TODAY);
    expect(plan.updates).toEqual([]);
    expect(plan.supersededIds).toEqual([]);
    expect(plan.resetIds).toEqual([]);
  });
});

describe('superseded solo se la fascia e andata a UN ALTRA riga', () => {
  const OTT_27_30: [string, string] = ['2026-10-27T00:00:00Z', '2026-10-30T00:00:00Z'];

  it('fascia assegnata alla stessa riga (upsert riuscito su di lei): non e superseded', () => {
    const plan = planMissingUpdates(
      [target('r', 0, false, OTT_27_30)],
      ALTRO,
      [range('2026-10-26T00:00:00Z', '2026-10-30T00:00:00Z', 'r')],
      TODAY,
    );
    expect(plan.supersededIds).toEqual([]);
    expect(plan.updates).toEqual([{ id: 'r', nextCount: 1, flagNow: false, cancelNow: false }]);
  });

  it('upsert fallito: la fascia non e registrata, la riga si conta e non si cancella', () => {
    // Il worker registra la fascia solo dopo un upsert riuscito: qui
    // non c'e', quindi niente superseded per un errore transitorio.
    const plan = planMissingUpdates([target('r', 0, false, OTT_27_30)], ALTRO, [], TODAY);
    expect(plan.supersededIds).toEqual([]);
    expect(plan.updates).toEqual([{ id: 'r', nextCount: 1, flagNow: false, cancelNow: false }]);
  });
});

describe('"Era ancora attiva" (host_kept_active_at)', () => {
  it('assente oltre la soglia: in osservazione, mai cancellata', () => {
    const plan = planMissingUpdates(
      [target('tenuta', 300, true, undefined, true)],
      ALTRO,
      [],
      TODAY,
    );
    expect(plan.updates).toEqual([
      { id: 'tenuta', nextCount: 301, flagNow: false, cancelNow: false },
    ]);
  });

  it('coperta da un altro evento: non superseded', () => {
    const plan = planMissingUpdates(
      [target('tenuta', 0, false, undefined, true)],
      ALTRO,
      [range('2026-11-30T00:00:00Z', '2026-12-05T00:00:00Z')],
      TODAY,
    );
    expect(plan.supersededIds).toEqual([]);
  });

  it('UID ricomparso: reset, e l esenzione cade con lui', () => {
    const plan = planMissingUpdates(
      [target('tenuta', 0, false, undefined, true)],
      new Set(['uid-tenuta']),
      [],
      TODAY,
    );
    expect(plan.resetIds).toEqual(['tenuta']);
  });
});

describe('planRevivals: il feed smentisce Premura', () => {
  it('UID di una riga cancellata da Premura di nuovo nel feed: torna confirmed', () => {
    expect(
      planRevivals(
        [
          { id: 'tornata', platformBookingRef: 'uid-tornata' },
          { id: 'sparita', platformBookingRef: 'uid-sparita' },
        ],
        new Set(['uid-tornata', 'uid-altro']),
      ),
    ).toEqual(['tornata']);
  });
});

describe('romeStartOfDay: oggi e il giorno di Roma', () => {
  it('alle 23:30 UTC a Roma e gia domani (ora solare)', () => {
    expect(romeStartOfDay(new Date('2026-10-25T23:30:00Z'))).toEqual(
      new Date('2026-10-26T00:00:00Z'),
    );
  });

  it('alle 22:30 UTC in estate a Roma e gia domani (ora legale)', () => {
    expect(romeStartOfDay(new Date('2026-08-05T22:30:00Z'))).toEqual(
      new Date('2026-08-06T00:00:00Z'),
    );
  });

  it('di giorno coincide con la data UTC', () => {
    expect(romeStartOfDay(new Date('2026-10-26T10:00:00Z'))).toEqual(
      new Date('2026-10-26T00:00:00Z'),
    );
  });
});
