import { type Database, messages } from '@premura/db';
import { eq, sql } from 'drizzle-orm';

export type DraftEnqueueOutcome =
  | { status: 'enqueued'; attempts: 1 | 2 }
  /** marked = lo stato e' stato scritto sul messaggio. */
  | { status: 'failed'; error: string; marked: boolean };

/**
 * Un Redis irraggiungibile NON fa fallire add(): la connessione condivisa
 * (maxRetriesPerRequest null, obbligatorio per i Worker) tiene il comando
 * in sospeso e riconnette all'infinito. Senza un limite il catch non
 * arriva mai, e l'enqueue fallito torna muto. Un add sano risponde in
 * millisecondi.
 *
 * Un add scaduto puo' ancora andare a buon fine quando Redis torna: la
 * bozza allora nasce su un messaggio gia' segnato. Per questo la frase
 * in conversazione guarda anche le bozze, non solo il segno.
 */
export const ENQUEUE_ATTEMPT_TIMEOUT_MS = 3_000;

async function withTimeout(attempt: Promise<void>): Promise<void> {
  const message = `nessuna risposta dalla coda dopo ${ENQUEUE_ATTEMPT_TIMEOUT_MS}ms (Redis irraggiungibile?)`;
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ENQUEUE_ATTEMPT_TIMEOUT_MS);
  });
  try {
    await Promise.race([attempt, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Accoda la bozza per un messaggio GIA' salvato.
 *
 * Un enqueue fallito non e' piu' solo un log (R2, 26/10): si riprova una
 * volta subito e, se fallisce ancora, lo si scrive sul messaggio
 * (metadata.draft_enqueue_failed), cosi' la conversazione puo' dire
 * "Premura non ha una risposta pronta" invece di tacere. Il messaggio
 * resta salvato in ogni caso: chi chiama non deve rispondere 5xx, e
 * questa funzione non lancia mai.
 *
 * `enqueue` e' obbligatorio: separato dalla coda BullMQ, cosi' chi lo
 * testa usa questa logica vera e finge solo la coda.
 */
export async function enqueueDraftOrMarkFailed(
  db: Database,
  messageId: string,
  enqueue: (messageId: string) => Promise<void>,
): Promise<DraftEnqueueOutcome> {
  try {
    await withTimeout(enqueue(messageId));
    return { status: 'enqueued', attempts: 1 };
  } catch {
    try {
      await withTimeout(enqueue(messageId));
      return { status: 'enqueued', attempts: 2 };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      try {
        await db
          .update(messages)
          .set({
            metadata: sql`coalesce(${messages.metadata}, '{}'::jsonb) || ${JSON.stringify({
              draft_enqueue_failed: true,
              draft_enqueue_error: error,
            })}::jsonb`,
          })
          .where(eq(messages.id, messageId));
        return { status: 'failed', error, marked: true };
      } catch {
        return { status: 'failed', error, marked: false };
      }
    }
  }
}
