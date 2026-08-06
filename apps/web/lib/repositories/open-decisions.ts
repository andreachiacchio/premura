import { getCurrentHostId } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { isIncompleteDataSource } from '@/lib/types';
import { cache } from 'react';
import { findByHostId } from './bookings';
import { listGuestsMissingPhoneSoon } from './home-summary';
import { countKitsByStatusForHost } from './kits';
import { listPossibleCancellations } from './possible-cancellations';
import { listPendingReplyDraftsForHost } from './reply-drafts';

// Tutto cio' che aspetta l'host, letto UNA VOLTA per richiesta.
//
// Perche' esiste: il badge sulla navigazione e il blocco "Serve una tua
// decisione" mostrano lo stesso numero, e devono leggerlo dalla stessa
// fonte. Due conteggi scritti separatamente sono identici il giorno in
// cui li scrivi e divergono il mese dopo — e' esattamente il difetto
// trovato il 06/08 su outbound_sends.dry_run (un'espressione duplicata
// a mano accanto alla funzione che avrebbe dovuto calcolarla).
//
// cache() di React memoizza per richiesta: layout e pagina chiamano
// questa funzione entrambi e le query partono una volta sola.

export type OpenDecisions = {
  replyDrafts: Awaited<ReturnType<typeof listPendingReplyDraftsForHost>>;
  missingPhoneSoon: Awaited<ReturnType<typeof listGuestsMissingPhoneSoon>>;
  possibleCancellations: Awaited<ReturnType<typeof listPossibleCancellations>>;
  incompleteCount: number;
  pendingKitsCount: number;
  /**
   * Le prenotazioni servono a contare quelle incomplete, e la pagina le
   * riusa per la lista: esposte qui per non interrogare due volte.
   */
  bookings: Awaited<ReturnType<typeof findByHostId>>;
  /** Il numero mostrato: card, badge e frase dell'agente leggono questo. */
  count: number;
};

const EMPTY: OpenDecisions = {
  replyDrafts: [],
  missingPhoneSoon: [],
  possibleCancellations: [],
  incompleteCount: 0,
  pendingKitsCount: 0,
  bookings: [],
  count: 0,
};

/**
 * Una sezione che fallisce non deve azzerare le altre: un errore sui kit
 * non puo' far sparire una bozza che aspetta da venti minuti.
 */
async function section<T>(label: string, fallback: T, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    console.error(`[open-decisions] sezione ${label} fallita`, err);
    return fallback;
  }
}

export const loadOpenDecisions = cache(async (): Promise<OpenDecisions> => {
  let hostId: string;
  let db: Awaited<ReturnType<typeof getDb>>['db'];
  try {
    hostId = await getCurrentHostId();
    ({ db } = await getDb());
  } catch (err) {
    console.error('[open-decisions] host o db non disponibili', err);
    return EMPTY;
  }

  const [replyDrafts, missingPhoneSoon, possibleCancellations, kitStatusCounts, bookings] =
    await Promise.all([
      section('bozze', [], () => listPendingReplyDraftsForHost(db, hostId)),
      section('numeri mancanti', [], () => listGuestsMissingPhoneSoon(db, hostId)),
      section('possibili cancellazioni', [], () => listPossibleCancellations(db, hostId)),
      section('kit', {} as Record<string, number>, () => countKitsByStatusForHost(db, hostId)),
      section('prenotazioni', [] as Awaited<ReturnType<typeof findByHostId>>, () =>
        findByHostId({ db, hostId }),
      ),
    ]);

  const incompleteCount = bookings.filter(
    (b) => isIncompleteDataSource(b.dataSource) && !b.hostSkippedCompletion,
  ).length;
  const pendingKitsCount = (kitStatusCounts.proposed ?? 0) + (kitStatusCounts.modified ?? 0);

  return {
    replyDrafts,
    missingPhoneSoon,
    possibleCancellations,
    incompleteCount,
    pendingKitsCount,
    bookings,
    count: countOpenDecisions({
      replyDrafts,
      missingPhoneSoon,
      possibleCancellations,
      incompleteCount,
      pendingKitsCount,
    }),
  };
});

/**
 * L'unica definizione di "quante cose aspettano l'host".
 *
 * incompleteCount e pendingKitsCount contano UNO ciascuno anche quando
 * il numero sottostante e' dieci: sono una voce sola nella lista, con un
 * link che le apre tutte. Contarle a una a una gonfierebbe il badge
 * rispetto a quello che l'host vede davvero sotto.
 */
export function countOpenDecisions(d: {
  replyDrafts: { length: number };
  missingPhoneSoon: { length: number };
  possibleCancellations: { length: number };
  incompleteCount: number;
  pendingKitsCount: number;
}): number {
  return (
    d.replyDrafts.length +
    d.missingPhoneSoon.length +
    d.possibleCancellations.length +
    (d.incompleteCount > 0 ? 1 : 0) +
    (d.pendingKitsCount > 0 ? 1 : 0)
  );
}
