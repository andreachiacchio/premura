import { describe, expect, it } from 'vitest';
import { planMissingUpdates } from '../src/jobs/feed-reconciliation';

// Cancellazioni 2-poll (30/07): la decisione pura. Il vincolo "un poll
// fallito non conta" sta nel CHIAMANTE (il worker chiama solo dopo un
// parse riuscito); qui si verifica la meccanica del contatore.

const target = (id: string, count: number, flagged = false, dates?: [string, string]) => ({
  id,
  platformBookingRef: `uid-${id}`,
  feedMissingCount: count,
  possibleCancellationAt: flagged ? new Date('2026-07-30T10:00:00Z') : null,
  checkinAt: new Date(dates?.[0] ?? '2026-12-01T00:00:00Z'),
  checkoutAt: new Date(dates?.[1] ?? '2026-12-05T00:00:00Z'),
});

describe('planMissingUpdates', () => {
  it('primo poll senza evento: contatore a 1, nessun flag', () => {
    const plan = planMissingUpdates([target('a', 0)], new Set());
    expect(plan.updates).toEqual([{ id: 'a', nextCount: 1, flagNow: false }]);
    expect(plan.resetIds).toEqual([]);
  });

  it('secondo poll consecutivo senza evento: scatta "possibile cancellazione"', () => {
    const plan = planMissingUpdates([target('a', 1)], new Set());
    expect(plan.updates).toEqual([{ id: 'a', nextCount: 2, flagNow: true }]);
  });

  it('evento riapparso: contatore e sospetto si azzerano', () => {
    const plan = planMissingUpdates([target('a', 1), target('b', 2, true)], new Set(['uid-a', 'uid-b']));
    expect(plan.resetIds).toEqual(['a', 'b']);
    expect(plan.updates).toEqual([]);
  });

  it('evento presente e mai mancato: nessun update inutile', () => {
    const plan = planMissingUpdates([target('a', 0)], new Set(['uid-a']));
    expect(plan.resetIds).toEqual([]);
    expect(plan.updates).toEqual([]);
  });

  it('gia flaggata e ancora assente: il contatore sale ma il flag non si sovrascrive', () => {
    const plan = planMissingUpdates([target('a', 2, true)], new Set());
    expect(plan.updates).toEqual([{ id: 'a', nextCount: 3, flagNow: false }]);
  });
});

// ─────────────────────────────────────────────────────────────────────
// 06/08 — il caso Julian Falch Milde, Villa Cristina.
//
// UNA prenotazione (1-8 agosto, codice 6382670828). Booking accorcia la
// fascia al periodo residuo ogni notte e le assegna un UID NUOVO:
//   5-8 ago · UID 6b27abfc…   (creata 05/08 09:15)
//   6-8 ago · UID 8cbf50c9…   (creata 05/08 22:00)
//   7-8 ago · UID 03dacfe9…   (creata 06/08 22:00)
//
// Il vecchio UID sparisce DAVVERO dal feed. Guardare solo gli UID
// portava a concludere "possibile cancellazione" per un ospite che era
// in casa — una prova che non riguardava la prenotazione, ma il modo in
// cui il feed la nomina.
describe('accorciamento progressivo di Booking', () => {
  const AGO_5_8 = ['2026-08-05T00:00:00Z', '2026-08-08T00:00:00Z'] as [string, string];

  it('UID sparito ma date ancora coperte: NON e una cancellazione', () => {
    const plan = planMissingUpdates(
      [target('julian', 1, false, AGO_5_8)],
      new Set(['uid-nuovo-03dacfe9']),
      // La fascia riemessa: stesso soggiorno, periodo residuo.
      [{ checkinAt: new Date('2026-08-07T00:00:00Z'), checkoutAt: new Date('2026-08-08T00:00:00Z') }],
    );
    expect(plan.updates).toEqual([]);
    expect(plan.resetIds).toEqual(['julian']);
  });

  it('gia marcata per sbaglio: la copertura la riabilita', () => {
    const plan = planMissingUpdates(
      [target('julian', 8, true, AGO_5_8)],
      new Set(),
      [{ checkinAt: new Date('2026-08-06T00:00:00Z'), checkoutAt: new Date('2026-08-08T00:00:00Z') }],
    );
    expect(plan.resetIds).toEqual(['julian']);
  });

  it('una fascia che si TOCCA soltanto non copre: resta una cancellazione', () => {
    // Checkout il 8, nuovo check-in il 8: sono due soggiorni diversi,
    // non lo stesso accorciato. Sovrapposizione stretta, non inclusiva.
    const plan = planMissingUpdates(
      [target('partito', 1, false, AGO_5_8)],
      new Set(),
      [{ checkinAt: new Date('2026-08-08T00:00:00Z'), checkoutAt: new Date('2026-08-12T00:00:00Z') }],
    );
    expect(plan.updates).toEqual([{ id: 'partito', nextCount: 2, flagNow: true }]);
    expect(plan.resetIds).toEqual([]);
  });

  it('sparita davvero, nessuna fascia che la copre: cancellazione vera', () => {
    const plan = planMissingUpdates(
      [target('disdetta', 1, false, AGO_5_8)],
      new Set(),
      [{ checkinAt: new Date('2026-09-01T00:00:00Z'), checkoutAt: new Date('2026-09-04T00:00:00Z') }],
    );
    expect(plan.updates).toEqual([{ id: 'disdetta', nextCount: 2, flagNow: true }]);
  });
});
