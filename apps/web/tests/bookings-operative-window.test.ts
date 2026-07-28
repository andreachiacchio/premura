import { formatStayRange } from '@/app/dashboard/_components/BookingRow';
import { _internals } from '@/lib/repositories/bookings';
import { describe, expect, it } from 'vitest';

/**
 * Due difetti segnalati sulla lista prenotazioni della dashboard:
 *
 *  1. Prenotazioni che sembravano vecchie restavano in lista. Erano in
 *     realtà del 2027: il formato data ometteva l'anno, quindi "15 lug"
 *     2027 si leggeva identico a "15 lug" di quest'anno.
 *
 *  2. Il filtro girava sul CHECK-IN (>= oggi - 2 giorni). Un soggiorno
 *     lungo spariva mentre l'ospite era ancora in casa, e chi faceva
 *     checkout oggi non compariva affatto — proprio il caso in cui
 *     l'host deve scrivergli.
 */

const { computeOperativeCutoff } = _internals;

/** Una prenotazione è operativa se il suo checkout non è ancora passato. */
function eOperativa(checkoutAt: Date, now: Date): boolean {
  return checkoutAt >= computeOperativeCutoff(now);
}

describe('finestra operativa — si guarda il checkout, non il check-in', () => {
  const oggi = new Date('2026-07-28T14:00:00Z');

  it('MOSTRA chi fa checkout oggi: è il caso più urgente', () => {
    // Prima della correzione questa spariva: check-in 24 luglio, cioè
    // oltre i 2 giorni di margine, benché l'ospite fosse ancora dentro.
    expect(eOperativa(new Date('2026-07-28T10:00:00Z'), oggi)).toBe(true);
  });

  it('MOSTRA un soggiorno lungo ancora in corso', () => {
    // Entrato il 20, esce il 3 agosto: in casa adesso.
    expect(eOperativa(new Date('2026-08-03T10:00:00Z'), oggi)).toBe(true);
  });

  it('NASCONDE una prenotazione conclusa ieri', () => {
    expect(eOperativa(new Date('2026-07-27T10:00:00Z'), oggi)).toBe(false);
  });

  it('NASCONDE una prenotazione conclusa il mese scorso', () => {
    expect(eOperativa(new Date('2026-06-20T10:00:00Z'), oggi)).toBe(false);
  });

  it('MOSTRA le prenotazioni future, anche lontane', () => {
    expect(eOperativa(new Date('2027-07-18T10:00:00Z'), oggi)).toBe(true);
  });

  it('la soglia è mezzanotte: un checkout alle 10:00 di oggi resta dentro', () => {
    const cutoff = computeOperativeCutoff(oggi);
    expect(cutoff.getHours()).toBe(0);
    expect(cutoff.getMinutes()).toBe(0);
    expect(eOperativa(new Date('2026-07-28T00:30:00Z'), oggi)).toBe(true);
  });
});

describe('formato date — l’anno compare quando serve', () => {
  const oggi = new Date('2026-07-28T12:00:00Z');

  it('OMETTE l’anno per un soggiorno dell’anno corrente', () => {
    const out = formatStayRange(
      new Date('2026-08-20T10:00:00Z'),
      new Date('2026-08-24T10:00:00Z'),
      oggi,
    );
    expect(out).not.toContain('2026');
    expect(out).toContain('20');
    expect(out).toContain('24');
  });

  it('MOSTRA l’anno per un soggiorno del 2027: era la causa dell’equivoco', () => {
    const out = formatStayRange(
      new Date('2027-07-15T10:00:00Z'),
      new Date('2027-07-18T10:00:00Z'),
      oggi,
    );
    expect(out).toContain('2027');
  });

  it('MOSTRA l’anno anche sul secondo caso segnalato (14-17 maggio 2027)', () => {
    const out = formatStayRange(
      new Date('2027-05-14T10:00:00Z'),
      new Date('2027-05-17T10:00:00Z'),
      oggi,
    );
    expect(out).toContain('2027');
  });

  it('MOSTRA l’anno su un soggiorno a cavallo di capodanno', () => {
    const out = formatStayRange(
      new Date('2026-12-30T10:00:00Z'),
      new Date('2027-01-02T10:00:00Z'),
      oggi,
    );
    expect(out).toContain('2027');
  });
});
