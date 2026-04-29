import { Cron } from 'croner';
import pino from 'pino';
import { enqueueIcalPolling } from './ical-poll-scheduler';

/**
 * Logger dedicato al cron iCal.
 * Stesso pattern di ical-poll-worker / ical-poll-scheduler: pino diretto,
 * non scoped alla request HTTP Fastify.
 */
const logger = pino({
  name: 'ical-cron',
  level: process.env.LOG_LEVEL ?? 'info',
});

/**
 * Cron scheduler per il polling iCal (M2a.4 slice 3.2).
 *
 * Cadenza: ogni 15 minuti (`*\/15 * * * *`).
 * Razionale: gli host Livello 1 hanno 1-5 properties con 1-3 sorgenti l'una;
 * 15 min e' un compromesso tra freschezza dati (utile per Studio T-48h) e
 * carico su Booking/Airbnb iCal endpoint. Tunabile in seguito.
 *
 * Error handling:
 *  - try/catch attorno a enqueueIcalPolling per evitare che un errore di
 *    enqueue (DB down, Redis down) ammazzi il processo. Il cron continua a
 *    girare ai tick successivi.
 *  - Errori transient (connessione DB) si risolvono al tick successivo;
 *    errori persistenti restano visibili in log per ops.
 *
 * Lifecycle: l'istanza Cron viene ritornata cosi' index.ts puo' chiamare
 * .stop() durante lo shutdown SIGTERM/SIGINT prima di chiudere worker e
 * Fastify.
 */
export function startIcalCron(): Cron {
  const cron = new Cron('*/15 * * * *', async () => {
    try {
      await enqueueIcalPolling();
    } catch (err) {
      logger.error({ err }, 'ical cron tick failed');
    }
  });

  const next = cron.nextRun();
  logger.info(
    { nextRun: next?.toISOString() ?? null },
    'ical cron started, next run at <date>',
  );

  return cron;
}
