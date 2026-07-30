import { triggerDraftGeneration } from '@premura/agents';
import { type Database, bookings, hosts, messages, properties } from '@premura/db';
import { sendText } from '@premura/integrations';
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
      conversationId: messages.conversationId,
      guestFirstName: bookings.guestFirstName,
      guestFullName: bookings.guestFullName,
      propertyName: properties.name,
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
    conversationId: row.conversationId,
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

  // Modalita' bozza (decisione Andrea 29/07): l'agente prepara, l'host
  // approva. L'host deve saperlo SENZA avere la dashboard aperta, quindi
  // ogni bozza nuova genera un WhatsApp al suo numero via lo stesso
  // transport. { immediate: true } perche' il destinatario e' il founder,
  // non un ospite: il jitter anti-raffica qui non protegge nessuno.
  //
  // Best-effort per costruzione: la bozza ESISTE gia' in pending_drafts.
  // Un errore della notifica non deve far fallire il job (il retry
  // rigenererebbe... niente: la pipeline e' idempotente, ma sprecherebbe
  // un giro), quindi log e avanti. In dry-run il transport non invia e
  // torna messageId null: comportamento corretto anche in staging.
  if (result.status === 'generated') {
    try {
      await notifyHostOfPendingDraft(db, {
        hostId: row.hostId,
        guestName: row.guestFirstName ?? row.guestFullName,
        propertyName: row.propertyName,
        inboundBody: row.body,
      });
    } catch (err) {
      logger.error({ err, draftId: result.draftId }, 'notifica bozza al founder fallita');
    }
  }

  return {
    status: result.status,
    draftId: result.draftId,
    reason: result.reason,
  };
}

const NOTIFY_PREVIEW_CHARS = 120;

async function notifyHostOfPendingDraft(
  db: Database,
  input: { hostId: string; guestName: string; propertyName: string; inboundBody: string },
): Promise<void> {
  const [host] = await db
    .select({ phone: hosts.phone })
    .from(hosts)
    .where(eq(hosts.id, input.hostId))
    .limit(1);

  // hosts.phone e' la fonte; l'env e' la rete di sicurezza per il pilot
  // (un solo host, il founder).
  const to = host?.phone ?? process.env.HOST_NOTIFY_PHONE;
  if (!to) {
    logger.warn({ hostId: input.hostId }, 'notifica bozza saltata: host senza numero');
    return;
  }

  const preview =
    input.inboundBody.length > NOTIFY_PREVIEW_CHARS
      ? `${input.inboundBody.slice(0, NOTIFY_PREVIEW_CHARS)}…`
      : input.inboundBody;
  const appUrl = process.env.APP_URL ?? 'https://premura.it';

  const text =
    `${input.guestName} (${input.propertyName}) ha scritto: «${preview}»\n\n` +
    `La risposta è pronta e aspetta il tuo ok: ${appUrl}/dashboard`;

  const out = await sendText(to, text, { immediate: true });
  logger.info(
    { dryRun: out.dryRun, skipped: out.skippedReason ?? null, messageId: out.messageId },
    'notifica bozza al founder',
  );
}
