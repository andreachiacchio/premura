import { config as loadEnv } from 'dotenv';

// Rimette in coda la bozza per un messaggio GIA' salvato (26/10).
//
// Nasce dal primo messaggio vero passato da Premura: salvato e attribuito,
// ma l'enqueue e' fallito ("Custom Id cannot contain :") e nessuna bozza
// e' partita. Invece di far riscrivere l'ospite, si rimette in coda quel
// messaggio. Serve allo stesso modo per ogni messaggio segnato con
// metadata.draft_enqueue_failed.
//
// Uso (sul worker, dove vivono Redis e la coda):
//
//   fly ssh console --config apps/api/fly.toml --process-group worker \
//     -C "pnpm exec tsx src/scripts/requeue-draft.ts <messageId>"
//
// oppure dal workflow "Rimetti in coda una bozza" (workflow_dispatch).
//
// L'esito si legge, non si assume (R2): dopo l'enqueue lo script aspetta
// fino a 90 secondi che il worker scriva la bozza in pending_drafts, e
// stampa cosa e' successo davvero. Riga finale "[requeue-draft] ESITO: ...".
// Il segno draft_enqueue_failed si toglie solo con la bozza in mano: se
// la generazione fallisce, "non ha una risposta pronta" resta vero.
//
// Rilanciabile: un job gia' finito senza bozza (failed, oppure completed
// con generator_error o skipped_*, che il worker non tratta da errore)
// viene rieseguito. Un secondo add con lo stesso id sarebbe scartato.
//
// Exit code: 0 bozza pronta (o gia' presente), 1 tutto il resto.

loadEnv({ path: '.env.local' });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WAIT_MS = 90_000;
const POLL_MS = 3_000;

function esito(text: string, ok: boolean): void {
  console.log(`[requeue-draft] ESITO: ${text}`);
  if (!ok) process.exitCode = 1;
}

async function main(): Promise<void> {
  const messageId = process.argv[2] ?? '';
  if (!UUID.test(messageId)) {
    esito('ID NON VALIDO: serve l uuid del messaggio', false);
    return;
  }

  // Dynamic import DOPO loadEnv, come send-test-message.ts.
  const { createServerClient, messages, pendingDrafts } = await import('@premura/db');
  const { and, eq, sql } = await import('drizzle-orm');
  const { draftGenerationQueue, draftJobId, enqueueDraftGeneration } = await import(
    '../jobs/draft-generation-queue'
  );
  const { getRedisConnection } = await import('../jobs/redis-connection');

  const client = createServerClient();
  const clearFlag = async () => {
    await client.db
      .update(messages)
      .set({
        metadata: sql`coalesce(${messages.metadata}, '{}'::jsonb) - 'draft_enqueue_failed' - 'draft_enqueue_error'`,
      })
      .where(eq(messages.id, messageId));
  };
  const draftFor = async () => {
    const [row] = await client.db
      .select({ id: pendingDrafts.id, status: pendingDrafts.status })
      .from(pendingDrafts)
      .where(
        and(eq(pendingDrafts.replyToMessageId, messageId), eq(pendingDrafts.kind, 'reply_draft')),
      )
      .limit(1);
    return row ?? null;
  };

  try {
    const [message] = await client.db
      .select({ direction: messages.direction, bookingId: messages.bookingId })
      .from(messages)
      .where(eq(messages.id, messageId))
      .limit(1);
    if (!message) {
      esito('NON TROVATO: nessun messaggio con questo id', false);
      return;
    }
    // Stesse condizioni del handler: solo un messaggio dell'ospite
    // attribuito a una prenotazione produce una bozza.
    if (message.direction !== 'inbound' || !message.bookingId) {
      esito('NON ACCODABILE: serve un messaggio in arrivo attribuito a una prenotazione', false);
      return;
    }

    const existingDraft = await draftFor();
    if (existingDraft) {
      await clearFlag();
      esito(`BOZZA GIA PRESENTE: ${existingDraft.id} (${existingDraft.status})`, true);
      return;
    }

    const existingJob = await draftGenerationQueue.getJob(draftJobId(messageId));
    if (existingJob) {
      const state = await existingJob.getState();
      if (state === 'failed' || state === 'completed') {
        await existingJob.retry(state);
        console.log(`[requeue-draft] job ${existingJob.id} era ${state} senza bozza: rieseguito`);
      } else {
        console.log(`[requeue-draft] job ${existingJob.id} gia in coda, stato ${state}`);
      }
    } else {
      await enqueueDraftGeneration(messageId);
      console.log(`[requeue-draft] accodato job ${draftJobId(messageId)}`);
    }

    const deadline = Date.now() + WAIT_MS;
    while (Date.now() < deadline) {
      const draft = await draftFor();
      if (draft) {
        await clearFlag();
        esito(`BOZZA PRONTA: ${draft.id} (${draft.status})`, true);
        return;
      }
      await new Promise((r) => setTimeout(r, POLL_MS));
    }

    const job = await draftGenerationQueue.getJob(draftJobId(messageId));
    const state = job ? await job.getState() : 'sconosciuto';
    const reason = job?.failedReason ? `, motivo: ${job.failedReason}` : '';
    esito(
      `NESSUNA BOZZA DOPO ${WAIT_MS / 1000}s: job ${state}${reason}. Controllare agent_actions e i log del worker`,
      false,
    );
  } finally {
    await client.close();
    await draftGenerationQueue.close();
    getRedisConnection().disconnect();
  }
}

main().catch((err) => {
  esito(`ERRORE: ${err instanceof Error ? err.message : String(err)}`, false);
});
