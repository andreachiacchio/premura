import { createServerClient } from '@premura/db';
import { type Job, Worker } from 'bullmq';
import pino from 'pino';
import { processDraftGenerationJob } from './draft-generation-handler';
import { DRAFT_GENERATION_QUEUE_NAME, type DraftGenerationJobData } from './draft-generation-queue';
import { getRedisConnection } from './redis-connection';

// Slice 7a.4 — Worker BullMQ draft-generation.
//
// Consumer di apps/api/src/api/webhooks/whatsapp.ts: dopo persist di un
// inbound, il webhook enqueue { messageId }. Questo worker risolve il
// context (booking, property, host) e delega la pipeline AI al modulo
// shared @premura/agents (triggerDraftGeneration).
//
// Idempotenza:
//   - JobId = `draft:${messageId}` (BullMQ scarta enqueue duplicati)
//   - Pipeline check pending_drafts.replyToMessageId pre-call LLM
// Doppia barriera per evitare doppi draft / doppia spesa Anthropic.
//
// La logica vera del job vive in draft-generation-handler.ts (separato
// per testabilita': il test importa solo l'handler senza far partire
// l'istanza Worker che apre Redis).
//
// Lifecycle DB: client Drizzle aperto/chiuso per ogni job. Pattern
// allineato a ical-poll-worker. Se l'overhead diventa significativo
// (concurrency alta) si passa a client shared.
//
// Concurrency 2: due chiamate Sonnet in parallelo per istanza worker.
// Conservativo per Anthropic rate limits e per non saturare un singolo
// worker quando c'e' burst di messaggi.

const logger = pino({
  name: 'draft-generation-worker',
  level: process.env.LOG_LEVEL ?? 'info',
});

export const draftGenerationWorker = new Worker<DraftGenerationJobData>(
  DRAFT_GENERATION_QUEUE_NAME,
  async (job: Job<DraftGenerationJobData>) => {
    const client = createServerClient();
    try {
      return await processDraftGenerationJob(client.db, job);
    } catch (err) {
      // Errore inatteso: log e rethrow per BullMQ retry (attempts 3 con
      // exponential backoff). Errori Anthropic transienti (timeout, 529)
      // sono recuperabili dal retry. Errori permanenti (es. payload
      // malformato) hanno gia' la loro logica di skip dentro
      // triggerDraftGeneration.
      logger.error({ err, messageId: job.data.messageId }, 'draft generation worker errored');
      throw err;
    } finally {
      await client.close();
    }
  },
  {
    connection: getRedisConnection(),
    concurrency: 2,
  },
);
