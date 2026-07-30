import { describe, expect, it } from 'vitest';
import {
  type UpcomingCheckinCardData,
  arrivalLabel,
  buildTimeline,
  dayPhrase,
  nextStepLine,
  statePhrase,
} from '../app/dashboard/upcoming-checkins/_components/UpcomingCheckinsBoard';

// Unit test delle funzioni pure del board (niente jsdom: il root vitest
// config gira in env node, i test di render vivono in tests/dashboard).

const NOW = new Date('2026-07-29T15:00:00+02:00');

describe('arrivalLabel', () => {
  it('oggi / domani / fra N giorni', () => {
    expect(arrivalLabel('2026-07-29T15:00:00+02:00', '2026-08-01T10:00:00+02:00', NOW)).toBe(
      'oggi',
    );
    expect(arrivalLabel('2026-07-30T15:00:00+02:00', '2026-08-01T10:00:00+02:00', NOW)).toBe(
      'domani',
    );
    expect(arrivalLabel('2026-08-01T15:00:00+02:00', '2026-08-08T10:00:00+02:00', NOW)).toBe(
      'fra 3 giorni',
    );
  });

  it('check-in passato con checkout futuro = in corso (Krzysztof)', () => {
    expect(arrivalLabel('2026-07-27T15:00:00+02:00', '2026-08-01T10:00:00+02:00', NOW)).toBe(
      'in corso',
    );
  });

  it('un check-in a mezzanotte di oggi resta "oggi" anche a sera', () => {
    // Date costruite nel fuso LOCALE del runtime: il confronto giorno-su-
    // giorno di arrivalLabel usa il fuso di chi guarda (il browser
    // dell'host), e il test deve valere sia in CI (UTC) sia in locale.
    const evening = new Date(2026, 6, 29, 23, 30);
    const checkinMidnight = new Date(2026, 6, 29, 0, 0);
    const checkout = new Date(2026, 7, 2, 10, 0);
    expect(arrivalLabel(checkinMidnight.toISOString(), checkout.toISOString(), evening)).toBe(
      'oggi',
    );
  });
});

function baseRow(patch: Partial<UpcomingCheckinCardData>): UpcomingCheckinCardData {
  return {
    id: 'b1',
    guestFullName: 'Julian Falch Milde',
    guestFirstName: 'Julian',
    propertyId: 'p1',
    propertyName: 'Villa Cristina',
    checkinAt: '2026-08-01T15:00:00+02:00',
    checkoutAt: '2026-08-08T10:00:00+02:00',
    numGuests: 6,
    platform: 'booking',
    guestPhone: '+4748356805',
    premuraActiveAt: '2026-07-29T14:00:00+02:00',
    premuraState: 'active',
    surveyStatus: 'not_yet',
    surveySentAt: null,
    surveyCompletedAt: null,
    welcomeSentAt: null,
    outbound: [],
    unknownOccupied: false,
    ...patch,
  };
}

describe('buildTimeline', () => {
  it('niente inviato: benvenuto previsto al check-in, survey in coda se T-7 e passato', () => {
    // Check-in 1 ago, oggi 29 lug: la finestra T-7 (25 lug) e' gia'
    // passata, quindi la survey e' "in coda al prossimo giro".
    const items = buildTimeline(baseRow({}), '08:00', NOW);
    const byLabel = Object.fromEntries(items.map((i) => [i.label, i]));

    expect(byLabel.Benvenuto?.done).toBe(false);
    expect(byLabel.Benvenuto?.detail).toContain('ore 08:00');
    expect(byLabel.Survey?.done).toBe(false);
    expect(byLabel.Survey?.detail).toContain('in coda');
    expect(byLabel['Mid-stay']?.done).toBe(false);
    expect(byLabel['Mid-stay']?.detail).toBe("a metà soggiorno, se c'è consenso");
  });

  it('benvenuto con orario gia passato e nulla inviato: "non inviato", mai "previsto"', () => {
    // Krzysztof: check-in 27 lug, oggi 29 lug. Dire "previsto 27 lug
    // ore 08:00" e' una promessa al passato (bug 30/07).
    const items = buildTimeline(
      baseRow({ checkinAt: '2026-07-27T15:00:00+02:00', checkoutAt: '2026-08-01T10:00:00+02:00' }),
      '08:00',
      NOW,
    );
    const welcome = items.find((i) => i.label === 'Benvenuto');
    expect(welcome?.done).toBe(false);
    expect(welcome?.detail).toBe('non inviato');
    expect(welcome?.detail).not.toContain('previsto');
  });

  it('survey futura: mostra la data prevista (T-7 alle 09:00)', () => {
    const items = buildTimeline(
      baseRow({ checkinAt: '2026-08-10T15:00:00+02:00', checkoutAt: '2026-08-15T10:00:00+02:00' }),
      '08:00',
      NOW,
    );
    const survey = items.find((i) => i.label === 'Survey');
    expect(survey?.detail).toContain('prevista');
    expect(survey?.detail).toContain('09:00');
  });

  it('welcome inviato via kit: risulta fatto con orario', () => {
    const items = buildTimeline(
      baseRow({ welcomeSentAt: '2026-08-01T08:05:00+02:00' }),
      '08:00',
      NOW,
    );
    const welcome = items.find((i) => i.label === 'Benvenuto');
    expect(welcome?.done).toBe(true);
    expect(welcome?.detail).toContain('inviato');
  });

  it('welcome inviato via outbound_sends in dry-run: marcato simulato', () => {
    const items = buildTimeline(
      baseRow({
        outbound: [
          { trigger: 'welcome', status: 'sent', sentAt: '2026-08-01T08:03:00+02:00', dryRun: true },
        ],
      }),
      '08:00',
      NOW,
    );
    const welcome = items.find((i) => i.label === 'Benvenuto');
    expect(welcome?.done).toBe(true);
    expect(welcome?.detail).toContain('simulato');
  });

  it('welcome failed: dice che va sbloccato, non che e in coda', () => {
    // Lo slot resta occupato con status failed e va sbloccato a mano:
    // la UI deve dire questo, non far credere che ripartira' da solo.
    const items = buildTimeline(
      baseRow({
        outbound: [{ trigger: 'welcome', status: 'failed', sentAt: null, dryRun: false }],
      }),
      '08:00',
      NOW,
    );
    const welcome = items.find((i) => i.label === 'Benvenuto');
    expect(welcome?.done).toBe(false);
    expect(welcome?.detail).toContain('sbloccare');
  });

  it('survey completata e mid-stay inviato risultano fatti', () => {
    const items = buildTimeline(
      baseRow({
        surveyStatus: 'completed',
        surveyCompletedAt: '2026-07-26T18:00:00+02:00',
        outbound: [
          {
            trigger: 'midstay',
            status: 'sent',
            sentAt: '2026-08-04T11:00:00+02:00',
            dryRun: false,
          },
        ],
      }),
      '08:00',
      NOW,
    );
    expect(items.find((i) => i.label === 'Survey')?.done).toBe(true);
    expect(items.find((i) => i.label === 'Mid-stay')?.done).toBe(true);
  });
});

// NOW = mercoledì 29 lug 2026; 1 ago = sabato (+3 giorni).

describe('dayPhrase', () => {
  it('oggi / domani / giorno della settimana entro 6 giorni / data oltre', () => {
    expect(dayPhrase('2026-07-29T15:00:00+02:00', NOW)).toBe('oggi');
    expect(dayPhrase('2026-07-30T15:00:00+02:00', NOW)).toBe('domani');
    expect(dayPhrase('2026-08-01T15:00:00+02:00', NOW)).toBe('sabato');
    expect(dayPhrase('2026-08-10T15:00:00+02:00', NOW)).toBe('il 10 ago');
  });
});

describe('statePhrase (stato come frase, punto 4 UX)', () => {
  it('arrivo futuro: "arriva sabato · 6 ospiti"', () => {
    expect(statePhrase(baseRow({}), NOW)).toBe('arriva sabato · 6 ospiti');
  });

  it('soggiorno in corso: "in casa, parte domani"', () => {
    expect(
      statePhrase(
        baseRow({
          checkinAt: '2026-07-27T15:00:00+02:00',
          checkoutAt: '2026-07-30T10:00:00+02:00',
        }),
        NOW,
      ),
    ).toBe('in casa, parte domani');
  });
});

describe('nextStepLine (timeline in una riga, punto 5 UX)', () => {
  it('niente inviato, check-in futuro: "Benvenuto sabato alle 08:00"', () => {
    expect(nextStepLine(baseRow({}), '08:00', NOW)).toBe('Benvenuto sabato alle 08:00');
  });

  it('welcome fallito: "Benvenuto da sbloccare"', () => {
    const row = baseRow({
      outbound: [{ trigger: 'welcome', status: 'failed', sentAt: null, dryRun: false }],
    });
    expect(nextStepLine(row, '08:00', NOW)).toBe('Benvenuto da sbloccare');
  });

  it('welcome inviato, survey fuori finestra: "Survey in coda (giro delle 09:00)"', () => {
    const row = baseRow({ welcomeSentAt: '2026-07-29T08:05:00+02:00' });
    expect(nextStepLine(row, '08:00', NOW)).toBe('Survey in coda (giro delle 09:00)');
  });

  it('tutto fatto: "Tutto inviato"', () => {
    const row = baseRow({
      welcomeSentAt: '2026-07-29T08:05:00+02:00',
      surveyStatus: 'completed',
      surveyCompletedAt: '2026-07-26T18:00:00+02:00',
      outbound: [
        { trigger: 'midstay', status: 'sent', sentAt: '2026-08-04T11:00:00+02:00', dryRun: false },
      ],
    });
    expect(nextStepLine(row, '08:00', NOW)).toBe('Tutto inviato');
  });
});
