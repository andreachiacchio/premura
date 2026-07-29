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
 * Run immediato al boot: il pattern `*\/15` allinea i tick ai minuti :00
 * :15 :30 :45, quindi un processo appena avviato resta fermo fino a 15
 * minuti prima di guardare i feed. Con il worker che puo' riavviarsi per
 * deploy o crash, quella finestra cieca si ripete a ogni restart. Il tick
 * di boot la chiude. E' sicuro perche' il polling iCal e' sola lettura +
 * upsert idempotente (vedi booking-upsert-repository): rieseguirlo non
 * duplica prenotazioni e non manda niente a nessuno.
 *
 * Error handling:
 *  - try/catch attorno a enqueueIcalPolling per evitare che un errore di
 *    enqueue (DB down, Redis down) ammazzi il processo. Il cron continua a
 *    girare ai tick successivi.
 *  - Errori transient (connessione DB) si risolvono al tick successivo;
 *    errori persistenti restano visibili in log per ops.
 *
 * Lifecycle: l'istanza Cron viene ritornata cosi' worker.ts puo' chiamare
 * .stop() durante lo shutdown SIGTERM/SIGINT prima di chiudere i worker.
 */
export function startIcalCron(): Cron {
  const tick = async (trigger: 'boot' | 'schedule'): Promise<void> => {
    try {
      await enqueueIcalPolling();
    } catch (err) {
      logger.error({ err, trigger }, 'ical cron tick failed');
    }
  };

  const cron = new Cron('*/15 * * * *', () => tick('schedule'));

  // Fire-and-forget: non blocchiamo l'avvio del worker sul primo poll.
  void tick('boot');

  const next = cron.nextRun();
  logger.info(
    { nextRun: next?.toISOString() ?? null },
    'ical cron started (tick di boot lanciato), next run at <date>',
  );

  return cron;
}
