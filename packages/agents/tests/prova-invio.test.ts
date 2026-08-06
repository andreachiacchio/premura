import { describe, expect, it, vi } from 'vitest';
import { markCleanerBriefed } from '../src/kit-generator/cleaner-brief';
import { markSurveySent } from '../src/survey-pipeline';
import { markWelcomeMessageSent } from '../src/welcome-message/welcome-finder';

// PROVA D'INVIO OBBLIGATORIA (Andrea, 05/08).
//
// Le funzioni che fanno avanzare stato irreversibile pretendono il
// providerMessageId: e' la prova che il messaggio e' partito davvero.
// Il tipo copre il caso di chi dimentica il parametro; questi test
// coprono il caso peggiore — chi lo passa vuoto o null pur di far
// compilare.
//
// Le tre funzioni marcano invii NOSTRI. markDeflectionSent e
// markCleanerAccepted no: registrano azioni umane (l'host che copia il
// messaggio, la cleaner che apre il link) e non hanno un
// providerMessageId da pretendere — per questo non sono qui.

/** db finto: se una di queste funzioni lo tocca, il test fallisce. */
function dbCheNonDeveEssereToccato() {
  const update = vi.fn(() => {
    throw new Error('lo stato NON deve avanzare senza prova di invio');
  });
  return { update } as never;
}

describe('markWelcomeMessageSent pretende la prova', () => {
  it('rifiuta una stringa vuota senza toccare il database', async () => {
    await expect(markWelcomeMessageSent(dbCheNonDeveEssereToccato(), 'kit-1', '')).rejects.toThrow(
      /providerMessageId vuoto/,
    );
  });

  it('rifiuta anche un null passato forzando il tipo (dry-run: messageId e null)', async () => {
    await expect(
      markWelcomeMessageSent(dbCheNonDeveEssereToccato(), 'kit-1', null as unknown as string),
    ).rejects.toThrow(/providerMessageId vuoto/);
  });
});

describe('markSurveySent pretende la prova', () => {
  it('rifiuta una stringa vuota senza toccare il database', async () => {
    await expect(markSurveySent(dbCheNonDeveEssereToccato(), 'quiz-1', '')).rejects.toThrow(
      /providerMessageId vuoto/,
    );
  });

  it('rifiuta un null: bruciare il sondaggio e irreversibile', async () => {
    await expect(
      markSurveySent(dbCheNonDeveEssereToccato(), 'quiz-1', null as unknown as string),
    ).rejects.toThrow(/providerMessageId vuoto/);
  });
});

describe('markCleanerBriefed pretende la prova', () => {
  it('rifiuta una stringa vuota: il kit non deve passare a ordering', async () => {
    await expect(markCleanerBriefed(dbCheNonDeveEssereToccato(), 'kit-1', '')).rejects.toThrow(
      /providerMessageId vuoto/,
    );
  });

  it('rifiuta un null', async () => {
    await expect(
      markCleanerBriefed(dbCheNonDeveEssereToccato(), 'kit-1', null as unknown as string),
    ).rejects.toThrow(/providerMessageId vuoto/);
  });
});
