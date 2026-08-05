import { describe, expect, it } from 'vitest';
import { buildAgentStatus } from '../lib/repositories/agent-status';

// 05/08 (Andrea): "Tutto tranquillo, nessuna azione in sospeso" accanto
// a "SERVE TE: 1" e' una contraddizione; dirlo prima ancora di aver
// letto il calendario e' peggio — e' il momento in cui l'host conclude
// che il prodotto non fa niente. Questi test inchiodano i tre stati.

const BASE = {
  pendingDraftsCount: 0,
  oldestDraftGuestName: null,
  nextArrival: null,
};

describe('buildAgentStatus — la card dice la verita', () => {
  it('calendario configurato ma mai letto -> "sto leggendo", MAI tranquillo', () => {
    const got = buildAgentStatus({
      ...BASE,
      calendars: { feedsTotali: 1, feedsLetti: 0, feedsInErrore: 0 },
    });
    expect(got.action).toContain('Sto leggendo il tuo calendario');
    expect(got.action).not.toContain('tranquillo');
  });

  it('nessun calendario collegato -> lo dice, non finge calma', () => {
    const got = buildAgentStatus({
      ...BASE,
      calendars: { feedsTotali: 0, feedsLetti: 0, feedsInErrore: 0 },
    });
    expect(got.action).toContain('Non ho ancora un calendario');
    expect(got.action).not.toContain('tranquillo');
  });

  it('feed in errore -> "non risponde piu" con l azione, prima di tutto il resto', () => {
    const got = buildAgentStatus({
      ...BASE,
      calendars: { feedsTotali: 2, feedsLetti: 1, feedsInErrore: 1 },
    });
    expect(got.action).toContain('non risponde più');
    expect(got.sub).toContain('ricollegat');
  });

  it('cose in sospeso -> mai "tutto tranquillo" (la contraddizione segnalata)', () => {
    const got = buildAgentStatus({
      ...BASE,
      needsYouCount: 1,
      calendars: { feedsTotali: 1, feedsLetti: 1, feedsInErrore: 0 },
    });
    expect(got.action).not.toContain('tranquillo');
    expect(got.action).toContain('aspetta te');
  });

  it('piu cose in sospeso -> plurale col numero', () => {
    const got = buildAgentStatus({
      ...BASE,
      needsYouCount: 3,
      calendars: { feedsTotali: 1, feedsLetti: 1, feedsInErrore: 0 },
    });
    expect(got.action).toContain('3 cose che aspettano te');
  });

  it('calendario letto e niente da fare -> lo dice esplicitamente', () => {
    const got = buildAgentStatus({
      ...BASE,
      needsYouCount: 0,
      calendars: { feedsTotali: 1, feedsLetti: 1, feedsInErrore: 0 },
    });
    expect(got.action).toBe('Calendario letto, nessun arrivo in programma.');
  });

  it('le bozze restano la priorita assoluta, anche col calendario da leggere', () => {
    const got = buildAgentStatus({
      ...BASE,
      pendingDraftsCount: 1,
      oldestDraftGuestName: 'Sofia',
      needsYouCount: 1,
      calendars: { feedsTotali: 1, feedsLetti: 0, feedsInErrore: 0 },
    });
    expect(got.action).toContain('Sofia');
    expect(got.action).toContain('serve il tuo via');
  });

  it('senza informazioni sui calendari il comportamento storico non cambia', () => {
    const got = buildAgentStatus(BASE);
    expect(got.action).toBe('Tutto tranquillo, nessuna azione in sospeso.');
  });
});
