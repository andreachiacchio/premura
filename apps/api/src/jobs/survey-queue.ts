import { Queue } from 'bullmq';
import { getRedisConnection } from './redis-connection';

// Slice B — Queue BullMQ pre-arrival survey tap-app.
//
// Job types:
//  - 'send-link': prepara survey + invia WA con link /s/[token]
//  - 'mark-abandon': skip survey dopo 96h timeout

export type SurveyJobData =
  | { type: 'send-link'; bookingId: string }
  | { type: 'mark-abandon'; quizId: string };

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

export async function enqueueSurveySend(bookingId: string): Promise<void> {
  await surveyQueue.add(
    'send-link',
    { type: 'send-link', bookingId },
    { jobId: `survey:send:${bookingId}` },
  );
}

export async function enqueueSurveyAbandon(quizId: string): Promise<void> {
  await surveyQueue.add(
    'mark-abandon',
    { type: 'mark-abandon', quizId },
    { jobId: `survey:abandon:${quizId}` },
  );
}
