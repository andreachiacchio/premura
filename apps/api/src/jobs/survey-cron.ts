import { findBookingsForSurveySend, findStaleSurveys } from '@premura/agents';
import { createServerClient } from '@premura/db';
import { Cron } from 'croner';
import pino from 'pino';
import { enqueueSurveyAbandon, enqueueSurveySend } from './survey-queue';

// Slice B — Cron pre-arrival survey.
// Tick: 09:00 ogni giorno Europe/Rome.

const logger = pino({
  name: 'survey-cron',
  level: process.env.LOG_LEVEL ?? 'info',
});

export function startSurveyCron(): Cron {
  return new Cron('0 9 * * *', { timezone: 'Europe/Rome' }, async () => {
    const client = createServerClient();
    try {
      const candidates = await findBookingsForSurveySend(client.db);
      let sendEnqueued = 0;
      for (const c of candidates) {
        try {
          await enqueueSurveySend(c.bookingId);
          sendEnqueued++;
        } catch (err) {
          logger.error({ err, bookingId: c.bookingId }, 'survey cron: enqueue send failed');
        }
      }

      const stale = await findStaleSurveys(client.db);
      let abandonEnqueued = 0;
      for (const s of stale) {
        try {
          await enqueueSurveyAbandon(s.quizId);
          abandonEnqueued++;
        } catch (err) {
          logger.error({ err, quizId: s.quizId }, 'survey cron: enqueue abandon failed');
        }
      }

      logger.info({ sendEnqueued, abandonEnqueued }, 'survey cron tick done');
    } catch (err) {
      logger.error({ err }, 'survey cron tick failed');
    } finally {
      await client.close();
    }
  });
}
