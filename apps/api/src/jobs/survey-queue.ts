import { Queue } from 'bullmq';
import { getRedisConnection } from './redis-connection';

// Slice B — Queue BullMQ per pre-arrival survey send + nudge.
//
// Job types:
//  - 'send-first':   primo messaggio template, inserts guest_quizzes
//  - 'send-nudge':   nudge dopo 48h se guest non ha risposto
//  - 'mark-abandon': skip survey dopo 96h timeout

export type SurveyJobData =
  | { type: 'send-first'; bookingId: string }
  | { type: 'send-nudge'; quizId: string }
  | { type: 'mark-abandon'; quizId: string }
  | { type: 'process-inbound'; bookingId: string; messageId: string };

export const SURVEY_QUEUE_NAME = 'pre-arrival-survey';

export const surveyQueue = new Queue<SurveyJobData>(SURVEY_QUEUE_NAME, {
  connection: getRedisConnection(),
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 },
  },
});

// Idempotenza:
//  - send-first: jobId fisso `survey:first:${bookingId}` — un solo
//    invio mai duplicato per booking.
//  - send-nudge: jobId fisso per quiz (max 1 nudge per survey).
//  - mark-abandon: jobId fisso per quiz.
export async function enqueueSurveyFirst(bookingId: string): Promise<void> {
  await surveyQueue.add(
    'send-first',
    { type: 'send-first', bookingId },
    { jobId: `survey:first:${bookingId}` },
  );
}

export async function enqueueSurveyNudge(quizId: string): Promise<void> {
  await surveyQueue.add(
    'send-nudge',
    { type: 'send-nudge', quizId },
    { jobId: `survey:nudge:${quizId}` },
  );
}

export async function enqueueSurveyAbandon(quizId: string): Promise<void> {
  await surveyQueue.add(
    'mark-abandon',
    { type: 'mark-abandon', quizId },
    { jobId: `survey:abandon:${quizId}` },
  );
}

// Inbound message processing per survey attiva. JobId per messaggio
// inbound (= messageId DB) garantisce idempotency: stesso messaggio
// non viene processato due volte anche se Meta lo rimanda.
export async function enqueueSurveyProcessInbound(
  bookingId: string,
  messageId: string,
): Promise<void> {
  await surveyQueue.add(
    'process-inbound',
    { type: 'process-inbound', bookingId, messageId },
    { jobId: `survey:inbound:${messageId}` },
  );
}
