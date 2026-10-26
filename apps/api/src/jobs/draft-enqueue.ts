import { type Database, messages } from '@premura/db';
import { eq, sql } from 'drizzle-orm';

export type DraftEnqueueOutcome =
  | { status: 'enqueued'; attempts: 1 | 2 }
  /** marked = lo stato e' stato scritto sul messaggio. */
  | { status: 'failed'; error: string; marked: boolean };

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
    await enqueue(messageId);
    return { status: 'enqueued', attempts: 1 };
  } catch {
    try {
      await enqueue(messageId);
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
