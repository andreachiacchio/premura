import {
  buildNudgeMessage,
  findBookingsForSurveySend,
  markSurveyAbandoned,
  processSurveyInbound,
  recordSurveyOutbound,
  startSurvey,
} from '@premura/agents';
import { type Database, bookings, guestQuizzes, hosts, messages, properties } from '@premura/db';
import { sendText } from '@premura/integrations';
import type { Job } from 'bullmq';
import { eq } from 'drizzle-orm';
import pino from 'pino';
import type { SurveyJobData } from './survey-queue';

// Slice B — Handler puro (testabile, no Redis) per i 3 job survey.
// Worker (survey-worker.ts) wrappa con Redis + DB lifecycle.

const logger = pino({
  name: 'survey-handler',
  level: process.env.LOG_LEVEL ?? 'info',
});

export async function processSurveyJob(
  db: Database,
  job: Job<SurveyJobData>,
): Promise<{ status: string; reason?: string }> {
  const data = job.data;
  if (data.type === 'send-first') {
    return processSendFirst(db, data.bookingId);
  }
  if (data.type === 'send-nudge') {
    return processSendNudge(db, data.quizId);
  }
  if (data.type === 'mark-abandon') {
    return processMarkAbandon(db, data.quizId);
  }
  if (data.type === 'process-inbound') {
    return processInbound(db, data.bookingId, data.messageId);
  }
  return { status: 'unknown_job_type' };
}

async function processInbound(
  db: Database,
  bookingId: string,
  messageId: string,
): Promise<{ status: string; reason?: string }> {
  // Carica context: messaggio inbound + booking/property/host info.
  const [row] = await db
    .select({
      body: messages.body,
      guestPhone: bookings.guestPhone,
      guestFirstName: bookings.guestFirstName,
      guestFullName: bookings.guestFullName,
      hostFullName: hosts.fullName,
      propertyName: properties.name,
    })
    .from(messages)
    .innerJoin(bookings, eq(messages.bookingId, bookings.id))
    .innerJoin(properties, eq(bookings.propertyId, properties.id))
    .innerJoin(hosts, eq(properties.hostId, hosts.id))
    .where(eq(messages.id, messageId))
    .limit(1);
  if (!row || !row.guestPhone) return { status: 'skipped_no_context' };

  const fname = row.guestFirstName ?? row.guestFullName.split(/\s+/)[0] ?? 'gentile ospite';
  const result = await processSurveyInbound(db, {
    bookingId,
    guestMessage: row.body,
    guestFirstName: fname,
    hostName: row.hostFullName ?? 'host',
    propertyName: row.propertyName,
  });

  if (result.status === 'error') {
    logger.error({ messageId, error: result.error }, 'survey inbound processing failed');
    throw new Error(`survey inbound: ${result.error}`);
  }

  // Send reply.
  try {
    await sendText(row.guestPhone, result.replyMessage);
  } catch (err) {
    logger.error({ err, messageId }, 'survey reply send failed');
    throw err;
  }

  // Su completion: notify Andrea operatore.
  if (result.status === 'completed') {
    const note = await notifyOperatorSurveyCompleted({
      hostName: row.hostFullName ?? 'host',
      guestName: row.guestFullName,
      bookingId,
      responses: result.responses,
    });
    logger.info(
      { messageId, bookingId, notifySent: note.sent, reason: note.reason },
      'survey completed, operator notified',
    );
    return { status: 'completed' };
  }

  if (result.status === 'declined') {
    logger.info({ messageId, bookingId }, 'survey declined by guest');
    return { status: 'declined' };
  }

  logger.info({ messageId, bookingId }, 'survey inbound processed (continue)');
  return { status: 'continue' };
}

async function processSendFirst(
  db: Database,
  bookingId: string,
): Promise<{ status: string; reason?: string }> {
  // Re-fetch candidate per sicurezza (potrebbero essere passati minuti
  // dall'enqueue: la booking potrebbe essere stata cancellata,
  // guest_phone rimosso, ecc).
  const all = await findBookingsForSurveySend(db);
  const candidate = all.find((c) => c.bookingId === bookingId);
  if (!candidate) {
    logger.warn({ bookingId }, 'survey send-first: candidate non piu eligible, skip');
    return { status: 'skipped_not_eligible' };
  }

  // Step 1: insert guest_quizzes + persist primo messaggio in conversation log.
  const result = await startSurvey(db, candidate);
  if (result.status === 'already_started') {
    return { status: 'already_started' };
  }

  // Step 2: invia via Meta Cloud API.
  try {
    await sendText(candidate.guestPhone, result.firstMessage);
    logger.info(
      { bookingId, quizId: result.quizId, language: candidate.language },
      'survey first message sent',
    );
    return { status: 'sent' };
  } catch (err) {
    logger.error({ err, bookingId, quizId: result.quizId }, 'survey first message send failed');
    // Reset sent_at cosi' il prossimo cron tick riprova (vs lasciare la
    // riga in "sent" ma non ha mai raggiunto Meta). Stato consistent.
    await db
      .update(guestQuizzes)
      .set({ sentAt: null, lastOutboundAt: null, conversationMessages: [] })
      .where(eq(guestQuizzes.id, result.quizId));
    throw err; // rethrow per BullMQ retry
  }
}

async function processSendNudge(
  db: Database,
  quizId: string,
): Promise<{ status: string; reason?: string }> {
  const [row] = await db
    .select({
      quizId: guestQuizzes.id,
      sentAt: guestQuizzes.sentAt,
      completedAt: guestQuizzes.completedAt,
      skippedAt: guestQuizzes.skippedAt,
      language: guestQuizzes.language,
      guestPhone: bookings.guestPhone,
      guestFirstName: bookings.guestFirstName,
      guestFullName: bookings.guestFullName,
    })
    .from(guestQuizzes)
    .innerJoin(bookings, eq(guestQuizzes.bookingId, bookings.id))
    .where(eq(guestQuizzes.id, quizId))
    .limit(1);
  if (!row) return { status: 'not_found' };
  if (row.completedAt || row.skippedAt) return { status: 'no_longer_pending' };
  if (!row.guestPhone) return { status: 'no_phone' };

  const fname = row.guestFirstName ?? row.guestFullName.split(/\s+/)[0] ?? 'gentile ospite';
  const message = buildNudgeMessage({
    language: row.language as 'it' | 'en',
    guestFirstName: fname,
  });
  try {
    await sendText(row.guestPhone, message);
    await recordSurveyOutbound(db, quizId, message);
    logger.info({ quizId }, 'survey nudge sent');
    return { status: 'nudged' };
  } catch (err) {
    logger.error({ err, quizId }, 'survey nudge send failed');
    throw err;
  }
}

async function processMarkAbandon(
  db: Database,
  quizId: string,
): Promise<{ status: string; reason?: string }> {
  const [row] = await db
    .select({
      completedAt: guestQuizzes.completedAt,
      skippedAt: guestQuizzes.skippedAt,
    })
    .from(guestQuizzes)
    .where(eq(guestQuizzes.id, quizId))
    .limit(1);
  if (!row) return { status: 'not_found' };
  if (row.completedAt || row.skippedAt) return { status: 'no_longer_pending' };

  await markSurveyAbandoned(db, quizId);
  logger.info({ quizId }, 'survey marked abandoned (96h timeout)');
  return { status: 'abandoned' };
}

// Helper esposto al webhook handler: notifica email Andrea operatore
// quando una survey si completa. Lazy import resend per non costringere
// il configurare RESEND_API_KEY in dev.
export async function notifyOperatorSurveyCompleted(input: {
  hostName: string;
  guestName: string;
  bookingId: string;
  responses: Record<string, unknown>;
}): Promise<{ sent: boolean; reason?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const operatorEmail = process.env.OPERATOR_EMAIL ?? 'andrea.chiacchio@premura.it';
  if (!apiKey) {
    return { sent: false, reason: 'no_resend_api_key' };
  }
  try {
    const { Resend } = await import('resend');
    const resend = new Resend(apiKey);
    const subject = `Premura — Survey ${input.guestName} completata`;
    const responsesFmt = Object.entries(input.responses)
      .filter(([, v]) => v != null && v !== '')
      .map(([k, v]) => `<li><strong>${k}</strong>: ${escapeHtml(String(v))}</li>`)
      .join('');
    const body = `<!doctype html><html><body style="font-family:sans-serif;">
<p>Survey pre-arrival completata per il guest <strong>${escapeHtml(input.guestName)}</strong> (host: ${escapeHtml(input.hostName)}).</p>
<p>Risposte estratte:</p>
<ul>${responsesFmt}</ul>
<p>Apri <a href="https://premura.it/dashboard/bookings/${input.bookingId}">il dettaglio booking</a> per vedere la conversation completa e generare il kit.</p>
</body></html>`;
    await resend.emails.send({
      from: 'Premura <noreply@premura.it>',
      to: operatorEmail,
      subject,
      html: body,
    });
    return { sent: true };
  } catch (err) {
    logger.error({ err }, 'notifyOperatorSurveyCompleted failed');
    return { sent: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
