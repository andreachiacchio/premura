import { findKitsForWelcomeMessage } from '@premura/agents';
import { createServerClient } from '@premura/db';
import { Cron } from 'croner';
import pino from 'pino';
import { enqueueWelcomeSend } from './welcome-message-queue';
import { runEarlyStaleCheck, runEscalationCheck } from './welcome-stale-alerts';

// Slice E — Cron welcome message check-in.
//
// Tick: ogni 30 minuti tra 08:00 e 12:00 Europe/Rome (8 tick massimi/giorno).
// Pattern: '*/30 8-11 * * *' → 8:00, 8:30, 9:00, ..., 11:30.
//
// Logica per tick:
//  - Tutti i tick: findKitsForWelcomeMessage → enqueue uno per candidato.
//  - Tick 08:00 (hour=8 minute=0): runEarlyStaleCheck → reminder cleaner +
//    soft alert founder se foto manca.
//  - Tick 09:00 (hour=9 minute=0): runEscalationCheck → escalation founder
//    se kit non set_up.
//
// Idempotenza:
//  - jobId welcome:send:{kitId} dedup BullMQ (riusa ID se gia' enqueued).
//  - handler ricontrolla welcomeMessageSentAt prima di inviare.
//  - Edge alerts: fire one-shot al tick specifico, prossimo utile = domani.

const logger = pino({
  name: 'welcome-cron',
  level: process.env.LOG_LEVEL ?? 'info',
});

export function startWelcomeMessageCron(): Cron {
  return new Cron('*/30 8-11 * * *', { timezone: 'Europe/Rome' }, async () => {
    const client = createServerClient();
    const now = new Date();
    try {
      const candidates = await findKitsForWelcomeMessage(client.db, now);
      let enqueued = 0;
      for (const c of candidates) {
        try {
          await enqueueWelcomeSend(c.kitId);
          enqueued++;
        } catch (err) {
          logger.error({ err, kitId: c.kitId }, 'welcome cron: enqueue failed');
        }
      }

      // Edge case checks one-shot al tick di riferimento.
      // now riflette Europe/Rome perche' croner gia' applica timezone.
      const localHour = now.getHours();
      const localMin = now.getMinutes();
      let earlyAlert: Awaited<ReturnType<typeof runEarlyStaleCheck>> | null = null;
      let escalationAlert: Awaited<ReturnType<typeof runEscalationCheck>> | null = null;
      if (localHour === 8 && localMin === 0) {
        earlyAlert = await runEarlyStaleCheck(client.db, now);
      }
      if (localHour === 9 && localMin === 0) {
        escalationAlert = await runEscalationCheck(client.db, now);
      }

      logger.info(
        { candidates: candidates.length, enqueued, earlyAlert, escalationAlert },
        'welcome cron tick done',
      );
    } catch (err) {
      logger.error({ err }, 'welcome cron tick failed');
    } finally {
      await client.close();
    }
  });
}
