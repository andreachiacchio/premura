import { triggerDraftGeneration } from '@premura/agents';
import { type Database, bookings, messages, properties } from '@premura/db';
import type { Job } from 'bullmq';
import { eq } from 'drizzle-orm';
import pino from 'pino';
import type { DraftGenerationJobData } from './draft-generation-queue';

// Slice 7a.4 — Handler "puro" per il job draft-generation.
//
// Separato dal Worker BullMQ (draft-generation-worker.ts) per testabilita':
// importare il Worker fa partire l'istanza che apre connessione Redis lazy.
// Il test del handler invece importa solo questa funzione, niente Redis.
//
// Il Worker chiama processDraftGenerationJob col suo `client.db` ma per il
// test passiamo un fake Database. Iniettare anche il logger sarebbe over-
// engineering: usiamo pino fisso, output va su stderr in test ma e' OK.

const logger = pino({
  name: 'draft-generation-handler',
  level: process.env.LOG_LEVEL ?? 'info',
});

export async function processDraftGenerationJob(
  db: Database,
  job: Job<DraftGenerationJobData>,
): Promise<{ status: string; draftId?: string; reason?: string }> {
  const { messageId } = job.data;

  // Lookup message + booking + property in singola query con due
  // inner join. Se la riga non esiste, log warn e ack (no retry):
  // probabilmente il messaggio e' stato deleted nel mentre, o e'
  // un orphan persistito senza booking_id (non eligibile per draft).
  const [row] = await db
    .select({
      bookingId: messages.bookingId,
      body: messages.body,
      direction: messages.direction,
      fromEntity: messages.fromEntity,
      hostId: properties.hostId,
    })
    .from(messages)
    .innerJoin(bookings, eq(messages.bookingId, bookings.id))
    .innerJoin(properties, eq(bookings.propertyId, properties.id))
    .where(eq(messages.id, messageId))
    .limit(1);

  if (!row) {
    logger.warn({ messageId }, 'message non trovato (orphan o deleted), skip');
    return { status: 'skipped_message_not_found' };
  }

  if (row.direction !== 'inbound' || row.fromEntity !== 'guest') {
    // Sanity: il job dovrebbe partire solo per inbound guest. Non
    // facciamo throw per non triggerare retry inutili: log e skip.
    logger.warn(
      { messageId, direction: row.direction, fromEntity: row.fromEntity },
      'messaggio non e inbound guest, skip draft generation',
    );
    return { status: 'skipped_not_inbound_guest' };
  }

  if (!row.bookingId) {
    logger.warn({ messageId }, 'messaggio orphan (no bookingId), skip');
    return { status: 'skipped_orphan' };
  }

  // Delega alla pipeline shared (idempotenza + dedup + LLM + persist).
  const result = await triggerDraftGeneration(db, {
    messageId,
    bookingId: row.bookingId,
    body: row.body,
    hostId: row.hostId,
  });

  logger.info(
    {
      messageId,
      bookingId: row.bookingId,
      hostId: row.hostId,
      status: result.status,
      draftId: result.draftId,
      routing: result.routing,
      confidence: result.confidence,
    },
    'draft generation completed',
  );

  return {
    status: result.status,
    draftId: result.draftId,
    reason: result.reason,
  };
}
