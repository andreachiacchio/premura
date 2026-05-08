import {
  findBookingsForSurveySend,
  markSurveyAbandoned,
  markSurveySent,
  prepareSurveySend,
} from '@premura/agents';
import { type Database, bookings, guestQuizzes } from '@premura/db';
import { sendText } from '@premura/integrations';
import type { Job } from 'bullmq';
import { eq } from 'drizzle-orm';
import pino from 'pino';
import type { SurveyJobData } from './survey-queue';

// Slice B — Handler puro (testabile, no Redis) per i 2 job survey.

const logger = pino({
  name: 'survey-handler',
  level: process.env.LOG_LEVEL ?? 'info',
});

const PUBLIC_BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://premura.it';

export async function processSurveyJob(
  db: Database,
  job: Job<SurveyJobData>,
): Promise<{ status: string; reason?: string }> {
  const data = job.data;
  if (data.type === 'send-link') {
    return processSendLink(db, data.bookingId);
  }
  if (data.type === 'mark-abandon') {
    return processMarkAbandon(db, data.quizId);
  }
  return { status: 'unknown_job_type' };
}

async function processSendLink(
  db: Database,
  bookingId: string,
): Promise<{ status: string; reason?: string }> {
  const all = await findBookingsForSurveySend(db);
  const candidate = all.find((c) => c.bookingId === bookingId);
  if (!candidate) {
    logger.warn({ bookingId }, 'survey send-link: candidate not eligible, skip');
    return { status: 'skipped_not_eligible' };
  }

  const [bookingRow] = await db
    .select({ checkinAt: bookings.checkinAt })
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);
  if (!bookingRow) return { status: 'booking_not_found' };

  const prepared = await prepareSurveySend(db, candidate, PUBLIC_BASE_URL, bookingRow.checkinAt);

  if (prepared.alreadyPrepared) {
    return { status: 'already_sent' };
  }

  try {
    await sendText(candidate.guestPhone, prepared.message);
    await markSurveySent(db, prepared.quizId);
    logger.info(
      {
        bookingId,
        quizId: prepared.quizId,
        language: candidate.language,
        url: prepared.surveyUrl,
        questionCount: prepared.questions.length,
      },
      'survey link sent',
    );
    return { status: 'sent' };
  } catch (err) {
    logger.error({ err, bookingId, quizId: prepared.quizId }, 'survey link send failed');
    // Reset token cosi' al prossimo cron tick si rigenera. La row resta
    // (non droppiamo il plan), giusto unset sent_at e token.
    await db
      .update(guestQuizzes)
      .set({ sentAt: null, token: null })
      .where(eq(guestQuizzes.id, prepared.quizId));
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

// Email Andrea operatore quando survey completata. Lazy import resend.
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
      .map(([k, v]) => {
        const valueStr = Array.isArray(v) ? v.join(', ') : String(v);
        return `<li><strong>${escapeHtml(k)}</strong>: ${escapeHtml(valueStr)}</li>`;
      })
      .join('');
    const body = `<!doctype html><html><body style="font-family:sans-serif;">
<p>Survey pre-arrival completata per il guest <strong>${escapeHtml(input.guestName)}</strong> (host: ${escapeHtml(input.hostName)}).</p>
<p>Risposte:</p>
<ul>${responsesFmt}</ul>
<p>Apri <a href="https://premura.it/dashboard/bookings/${input.bookingId}">il dettaglio booking</a> per generare il kit.</p>
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
