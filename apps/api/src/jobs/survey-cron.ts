import { findBookingsForSurveySend, findStaleSurveys } from '@premura/agents';
import { createServerClient } from '@premura/db';
import { Cron } from 'croner';
import pino from 'pino';
import { enqueueSurveyAbandon, enqueueSurveyFirst, enqueueSurveyNudge } from './survey-queue';

// Slice B — Cron scheduler pre-arrival survey.
//
// Tick 1: 09:00 Europe/Rome ogni giorno.
//  - findBookingsForSurveySend (window 7gg pre-checkin) → enqueue 'send-first'
//  - findStaleSurveys → enqueue 'send-nudge' (48h) o 'mark-abandon' (96h)
//
// Tick singolo per entrambi: la pipeline e' light (DB query + enqueue),
// niente ragione di splittare in due cron diversi.

const logger = pino({
  name: 'survey-cron',
  level: process.env.LOG_LEVEL ?? 'info',
});

export function startSurveyCron(): Cron {
  // Cron expression "0 9 * * *" = 09:00 ogni giorno.
  // Timezone Europe/Rome via croner option (host pilot italiano).
  const cron = new Cron('0 9 * * *', { timezone: 'Europe/Rome' }, async () => {
    const client = createServerClient();
    try {
      const candidates = await findBookingsForSurveySend(client.db);
      let firstEnqueued = 0;
      for (const c of candidates) {
        try {
          await enqueueSurveyFirst(c.bookingId);
          firstEnqueued++;
        } catch (err) {
          logger.error({ err, bookingId: c.bookingId }, 'survey cron: enqueue send-first failed');
        }
      }

      const stale = await findStaleSurveys(client.db);
      let nudgeEnqueued = 0;
      let abandonEnqueued = 0;
      for (const s of stale) {
        try {
          if (s.action === 'nudge') {
            await enqueueSurveyNudge(s.quizId);
            nudgeEnqueued++;
          } else {
            await enqueueSurveyAbandon(s.quizId);
            abandonEnqueued++;
          }
        } catch (err) {
          logger.error(
            { err, quizId: s.quizId, action: s.action },
            'survey cron: enqueue stale failed',
          );
        }
      }

      logger.info(
        {
          firstCandidates: candidates.length,
          firstEnqueued,
          staleNudge: nudgeEnqueued,
          staleAbandon: abandonEnqueued,
        },
        'survey cron tick done',
      );
    } catch (err) {
      logger.error({ err }, 'survey cron tick failed');
    } finally {
      await client.close();
    }
  });

  const next = cron.nextRun();
  logger.info({ nextRun: next?.toISOString() ?? null }, 'survey cron started');

  return cron;
}
