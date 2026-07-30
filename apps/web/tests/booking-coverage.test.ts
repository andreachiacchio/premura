import { describe, expect, it } from 'vitest';
import { isRangeCoveredByBookings } from '../lib/booking-coverage';

// Il caso reale che ha originato la regola: la fascia iCal Booking
// "30 lug - 8 ago" di Villa Cristina copre Krzysztof (29 lug - 1 ago)
// e Julian (1 - 8 ago) messi insieme.

function r(ci: string, co: string) {
  return { checkinAt: new Date(ci), checkoutAt: new Date(co) };
}

describe('isRangeCoveredByBookings', () => {
  it('caso Villa Cristina: Krzysztof + Julian coprono la fascia intera', () => {
    const fascia = r('2026-07-30', '2026-08-08');
    const known = [r('2026-07-29', '2026-08-01'), r('2026-08-01', '2026-08-08')];
    expect(isRangeCoveredByBookings(fascia, known)).toBe(true);
  });

  it('buco in mezzo = non coperta', () => {
    const fascia = r('2026-07-30', '2026-08-08');
    const known = [r('2026-07-29', '2026-08-01'), r('2026-08-02', '2026-08-08')];
    expect(isRangeCoveredByBookings(fascia, known)).toBe(false);
  });

  it('coperta solo in parte = non coperta', () => {
    expect(
      isRangeCoveredByBookings(r('2026-08-19', '2026-08-28'), [r('2026-08-19', '2026-08-22')]),
    ).toBe(false);
  });

  it('nessuna prenotazione nota = non coperta', () => {
    expect(isRangeCoveredByBookings(r('2026-10-02', '2026-10-05'), [])).toBe(false);
  });

  it('gli orari non contano: confronto per giorno', () => {
    const fascia = r('2026-08-01T00:00:00Z', '2026-08-08T00:00:00Z');
    const known = [r('2026-08-01T13:00:00Z', '2026-08-08T10:00:00Z')];
    expect(isRangeCoveredByBookings(fascia, known)).toBe(true);
  });
});
