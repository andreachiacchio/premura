import { describe, expect, it } from 'vitest';
import { computeKitBudgetEur } from '../src/kit-generator/items-taxonomy';

// Slice C — Test budget tier per nights / hostPayout.
// Riferimento spec: 1-2 notti -> min(hostPayout * 0.07, 12);
// 3-5 -> min(hostPayout * 0.06, 18); 6+ -> min(hostPayout * 0.05, 30).

describe('computeKitBudgetEur', () => {
  it('1 notte, hostPayout basso: 7% di hostPayout', () => {
    expect(computeKitBudgetEur({ nights: 1, hostPayoutEur: 100 })).toBeCloseTo(7);
  });

  it('2 notti, hostPayout alto: capped a 12', () => {
    expect(computeKitBudgetEur({ nights: 2, hostPayoutEur: 1000 })).toBe(12);
  });

  it('3 notti, hostPayout medio: 6% di hostPayout', () => {
    expect(computeKitBudgetEur({ nights: 3, hostPayoutEur: 200 })).toBeCloseTo(12);
  });

  it('5 notti, hostPayout alto: capped a 18', () => {
    expect(computeKitBudgetEur({ nights: 5, hostPayoutEur: 1000 })).toBe(18);
  });

  it('6 notti, hostPayout medio: 5% di hostPayout', () => {
    expect(computeKitBudgetEur({ nights: 6, hostPayoutEur: 400 })).toBeCloseTo(20);
  });

  it('10 notti, hostPayout altissimo: capped a 30', () => {
    expect(computeKitBudgetEur({ nights: 10, hostPayoutEur: 5000 })).toBe(30);
  });

  it('boundary: passaggio 2->3 notti cambia tier', () => {
    const t2 = computeKitBudgetEur({ nights: 2, hostPayoutEur: 100 });
    const t3 = computeKitBudgetEur({ nights: 3, hostPayoutEur: 100 });
    expect(t2).toBeCloseTo(7); // 7% di 100
    expect(t3).toBeCloseTo(6); // 6% di 100
  });

  it('boundary: passaggio 5->6 notti cambia tier', () => {
    const t5 = computeKitBudgetEur({ nights: 5, hostPayoutEur: 100 });
    const t6 = computeKitBudgetEur({ nights: 6, hostPayoutEur: 100 });
    expect(t5).toBeCloseTo(6); // 6% di 100
    expect(t6).toBeCloseTo(5); // 5% di 100
  });
});
