import { describe, expect, it } from 'vitest';
import { planMissingUpdates } from '../src/jobs/feed-reconciliation';

// Cancellazioni 2-poll (30/07): la decisione pura. Il vincolo "un poll
// fallito non conta" sta nel CHIAMANTE (il worker chiama solo dopo un
// parse riuscito); qui si verifica la meccanica del contatore.

const target = (id: string, count: number, flagged = false) => ({
  id,
  platformBookingRef: `uid-${id}`,
  feedMissingCount: count,
  possibleCancellationAt: flagged ? new Date('2026-07-30T10:00:00Z') : null,
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
