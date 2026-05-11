import { findKitsForWelcomeMessage } from '@premura/agents';
import { createServerClient } from '@premura/db';
import { Cron } from 'croner';
import pino from 'pino';
import { enqueueWelcomeSend } from './welcome-message-queue';

// Slice E — Cron welcome message check-in.
//
// Tick: ogni 30 minuti tra 08:00 e 12:00 Europe/Rome (8 tick massimi/giorno).
// Pattern: '*/30 8-11 * * *' → :00, :30 → 8:00, 8:30, 9:00, ..., 11:30.
// (12:00 escluso, ultimo tick è 11:30.)
//
// Logic per tick: findKitsForWelcomeMessage → enqueue uno per candidato.
// Idempotenza:
//  - jobId = welcome:send:{kitId} dedup BullMQ.
//  - handler ricontrolla welcomeMessageSentAt prima di inviare.

const logger = pino({
  name: 'welcome-cron',
  level: process.env.LOG_LEVEL ?? 'info',
});

export function startWelcomeMessageCron(): Cron {
  return new Cron('*/30 8-11 * * *', { timezone: 'Europe/Rome' }, async () => {
    const client = createServerClient();
    try {
      const candidates = await findKitsForWelcomeMessage(client.db);
      let enqueued = 0;
      for (const c of candidates) {
        try {
          await enqueueWelcomeSend(c.kitId);
          enqueued++;
        } catch (err) {
          logger.error({ err, kitId: c.kitId }, 'welcome cron: enqueue failed');
        }
      }
      logger.info({ candidates: candidates.length, enqueued }, 'welcome cron tick done');
    } catch (err) {
      logger.error({ err }, 'welcome cron tick failed');
    } finally {
      await client.close();
    }
  });
}
