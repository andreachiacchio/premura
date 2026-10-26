import {
  calendarRemovalsHeadline,
  decisionsCount,
} from '@/app/dashboard/_components/DecisionsBlock';
import type { CalendarRemoval } from '@/lib/repositories/possible-cancellations';
import { describe, expect, it } from 'vitest';

// 26/10: le prenotazioni sparite dal feed le cancella Premura. In home
// resta UNA riga chiusa. Quello che i test difendono e' R2: la frase
// deriva dalle stesse righe che la riga apre, e quelle righe non
// gonfiano "Serve te" — non aspettano l'host.

const removal = (id: string, platform: 'booking' | 'airbnb'): CalendarRemoval => ({
  bookingId: id,
  propertyName: 'Villa Cristina',
  platform,
  checkinAt: new Date('2026-11-07T00:00:00Z'),
  checkoutAt: new Date('2026-11-11T00:00:00Z'),
  removedAt: new Date('2026-10-21T10:00:00Z'),
});

describe('calendarRemovalsHeadline', () => {
  it('conta le righe e nomina la piattaforma che le ha tolte', () => {
    expect(calendarRemovalsHeadline([removal('a', 'booking'), removal('b', 'booking')])).toBe(
      'Booking ha tolto 2 prenotazioni dal calendario negli ultimi 30 giorni',
    );
  });

  it('al singolare con una riga sola', () => {
    expect(calendarRemovalsHeadline([removal('a', 'airbnb')])).toBe(
      'Airbnb ha tolto 1 prenotazione dal calendario negli ultimi 30 giorni',
    );
  });

  it('mai "Booking" se una le ha tolte Airbnb', () => {
    expect(calendarRemovalsHeadline([removal('a', 'booking'), removal('b', 'airbnb')])).toBe(
      'Booking e Airbnb hanno tolto 2 prenotazioni dal calendario negli ultimi 30 giorni',
    );
  });
});

describe('decisionsCount', () => {
  it('le prenotazioni tolte da Premura non contano come decisioni', () => {
    expect(
      decisionsCount({
        draftItems: [],
        missingPhoneSoon: [],
        incompleteCount: 0,
        pendingKitsCount: 0,
        calendarRemovals: [removal('a', 'booking'), removal('b', 'booking')],
      }),
    ).toBe(0);
  });
});
