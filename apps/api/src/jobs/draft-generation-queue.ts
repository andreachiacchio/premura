import { Queue } from 'bullmq';
import { getRedisConnection } from './redis-connection';

// Slice 7a.4 — Coda BullMQ per draft generation.
//
// Pipeline 1 connector: dopo che whatsapp-persist insert un message inbound,
// il webhook handler enqueue qui un job. Il worker (draft-generation-worker)
// carica il context, chiama generateReplyDraft (Sonnet 4.6) e persiste un
// pending_drafts kind='reply_draft' pronto per host approval.
//
// Idempotenza: garantita a livello di pipeline (triggerDraftGeneration
// fa dedup su pending_drafts.replyToMessageId). Doppi job per stesso
// messageId ritornano skipped_existing_draft senza chiamare l'LLM.
//
// Payload minimal: solo messageId. Il worker risolve bookingId, hostId,
// body, ecc. dalla riga messages join properties/bookings. Cosi' il
// payload e' stabile anche se cambiamo lo schema in futuro.

export type DraftGenerationJobData = {
  messageId: string;
};

export const DRAFT_GENERATION_QUEUE_NAME = 'draft-generation';

// Default job options:
//  - attempts 3: due retry su errori Anthropic transienti (timeout, 529)
//  - backoff exponential delay 5s: 5s, 10s, 20s. Le LLM call sono piu'
//    flaky di una HTTP request semplice, conservativo qui.
//  - removeOnComplete keep 50: meno storage, log su Axiom per audit.
//  - removeOnFail keep 200: storage extra per debugging.
export const draftGenerationQueue = new Queue<DraftGenerationJobData>(DRAFT_GENERATION_QUEUE_NAME, {
  connection: getRedisConnection(),
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 50 },
    removeOnFail: { count: 200 },
  },
});

// Helper esposto al webhook handler: enqueue fire-and-forget. JobId =
// messageId per dedup BullMQ-level (oltre a quello DB-level del pipeline):
// se per qualunque motivo enqueuiamo due volte lo stesso messageId in
// rapida successione, BullMQ scarta il duplicato senza creare un secondo
// job nella coda.
export async function enqueueDraftGeneration(messageId: string): Promise<void> {
  await draftGenerationQueue.add('generate', { messageId }, { jobId: `draft:${messageId}` });
}
