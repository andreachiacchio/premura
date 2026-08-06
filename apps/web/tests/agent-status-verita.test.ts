import { describe, expect, it } from 'vitest';
import { buildAgentStatus } from '../lib/repositories/agent-status';

// 05/08 (Andrea): "Tutto tranquillo, nessuna azione in sospeso" accanto
// a "SERVE TE: 1" e' una contraddizione; dirlo prima ancora di aver
// letto il calendario e' peggio — e' il momento in cui l'host conclude
// che il prodotto non fa niente. Questi test inchiodano i tre stati.

// 06/08: needsYouCount e calendars sono obbligatori. Ometterli non
// compila piu', quindi il caso "la frase non sa quanto sta mostrando
// la card" non e' testabile a runtime — e' proprio il punto.
const BASE = {
  pendingDraftsCount: 0,
  oldestDraftGuestName: null,
  nextArrival: null,
  needsYouCount: 0,
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

  it('calendario letto e niente da decidere -> lo dice, senza fingere calma', () => {
    const got = buildAgentStatus({
      ...BASE,
      needsYouCount: 0,
      calendars: { feedsTotali: 1, feedsLetti: 1, feedsInErrore: 0 },
    });
    expect(got.action).toBe('Niente da decidere adesso.');
    expect(got.sub).toContain('Calendario letto');
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

  // La frase di calma non deve poter uscire da nessuna combinazione di
  // input: e' la stringa che ieri stava accanto a "SERVE TE: 1".
  it('nessuno stato produce "tutto tranquillo"', () => {
    for (const feedsTotali of [0, 1, 2]) {
      for (const feedsLetti of [0, 1]) {
        for (const feedsInErrore of [0, 1]) {
          for (const needsYouCount of [0, 1, 3]) {
            for (const pendingDraftsCount of [0, 1]) {
              const got = buildAgentStatus({
                ...BASE,
                pendingDraftsCount,
                oldestDraftGuestName: 'Sofia',
                needsYouCount,
                calendars: { feedsTotali, feedsLetti, feedsInErrore },
              });
              expect(got.action.toLowerCase()).not.toContain('tranquillo');
            }
          }
        }
      }
    }
  });

  // R2: la frase non e' una stringa scelta a parte, deriva dallo stesso
  // numero che la card mostra. Se "Serve te" e' > 0, la frase lo dice.
  it('se il contatore mostra qualcosa, la frase lo nomina', () => {
    for (const needsYouCount of [1, 2, 7]) {
      const got = buildAgentStatus({
        ...BASE,
        needsYouCount,
        calendars: { feedsTotali: 1, feedsLetti: 1, feedsInErrore: 0 },
      });
      expect(got.action).toContain(needsYouCount === 1 ? 'una cosa' : String(needsYouCount));
      expect(got.action).toContain('aspetta');
    }
  });
});
