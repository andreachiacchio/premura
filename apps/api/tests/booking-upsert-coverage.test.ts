import { describe, expect, it } from 'vitest';
import { isRangeCoveredByIntervals } from '../src/jobs/booking-upsert-repository';

// PARTE A (30/07): una fascia anonima coperta dall'UNIONE di piu'
// prenotazioni contigue non va creata. Il caso reale: "CLOSED" 30/7-8/8
// su Villa Cristina = Krzysztof (29/7-1/8) + Julian (1/8-8/8).

const d = (s: string) => new Date(`${s}T00:00:00Z`);

describe('isRangeCoveredByIntervals', () => {
  it('unione di due prenotazioni contigue copre la fascia (caso Krzysztof+Julian)', () => {
    expect(
      isRangeCoveredByIntervals(
        { checkinAt: d('2026-07-30'), checkoutAt: d('2026-08-08') },
        [
          { checkinAt: d('2026-07-29'), checkoutAt: d('2026-08-01') },
          { checkinAt: d('2026-08-01'), checkoutAt: d('2026-08-08') },
        ],
      ),
    ).toBe(true);
  });

  it('buco di una notte = NON coperta', () => {
    expect(
      isRangeCoveredByIntervals(
        { checkinAt: d('2026-07-30'), checkoutAt: d('2026-08-08') },
        [
          { checkinAt: d('2026-07-29'), checkoutAt: d('2026-08-01') },
          { checkinAt: d('2026-08-02'), checkoutAt: d('2026-08-08') },
        ],
      ),
    ).toBe(false);
  });

  it('nessuna prenotazione = NON coperta', () => {
    expect(
      isRangeCoveredByIntervals({ checkinAt: d('2026-08-04'), checkoutAt: d('2026-08-07') }, []),
    ).toBe(false);
  });
});
