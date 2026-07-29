import 'dotenv/config';
import Fastify from 'fastify';
// Import top-level: ogni modulo worker costruisce la propria istanza BullMQ
// Worker a module load e inizia subito ad ascoltare la coda. Stesso pattern
// che questi worker avevano quando vivevano dentro index.ts.
import { draftGenerationWorker } from './jobs/draft-generation-worker';
import { startIcalCron } from './jobs/ical-cron';
import { icalPollWorker } from './jobs/ical-poll-worker';
import { startSurveyCron } from './jobs/survey-cron';
import { surveyWorker } from './jobs/survey-worker';
import { startWelcomeMessageCron } from './jobs/welcome-message-cron';
import { welcomeWorker } from './jobs/welcome-message-worker';

// Processo worker Premura — cron + consumer BullMQ.
//
// PERCHE' ESISTE QUESTO FILE.
//
// Fino a qui cron e worker vivevano dentro apps/api/src/index.ts, cioe'
// dentro il processo che serve l'HTTP. Su Fly quel processo gira con
// auto_stop_machines="stop" e min_machines_running=0: la macchina si
// spegne quando non arrivano richieste. Un timer in-process su una
// macchina scale-to-zero non e' un cron — semplicemente non scatta.
//
// Effetto misurato in produzione il 29/07/2026: ultima prenotazione
// ingerita il 29/04, ultimo aggiornamento il 05/05. Tre mesi di silenzio
// con zero errori nei log, perche' non girava nulla che potesse fallire.
//
// Da qui la separazione in due process group (vedi fly.toml):
//   app    -> solo HTTP, puo' continuare a spegnersi quando idle
//   worker -> questo file, nessun servizio esposto al proxy Fly, quindi
//             la macchina non viene mai fermata dall'autostop
//
// Il server HTTP qui sotto NON e' dietro il proxy: serve solo agli health
// check di Fly e a un `fly ssh console -C 'wget -qO- localhost:8080/health'`
// per capire da fuori se i cron sono vivi. E' esattamente il segnale che
// e' mancato per tre mesi.

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL ?? 'info',
    transport:
      process.env.NODE_ENV === 'development'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
  },
});

const icalCron = startIcalCron();
const surveyCron = startSurveyCron();
const welcomeCron = startWelcomeMessageCron();

// Health del worker: non "il processo risponde" ma "i cron sono ancora
// schedulati". Un croner fermo restituisce nextRun() null, ed e' quello
// che vogliamo vedere prima che passi un altro trimestre.
app.get('/health', () => {
  const crons = {
    ical: icalCron.nextRun()?.toISOString() ?? null,
    survey: surveyCron.nextRun()?.toISOString() ?? null,
    welcome: welcomeCron.nextRun()?.toISOString() ?? null,
  };
  const allScheduled = Object.values(crons).every((next) => next !== null);
  return {
    status: allScheduled ? 'ok' : 'degraded',
    process: 'worker',
    crons,
    timestamp: new Date().toISOString(),
  };
});

const port = Number(process.env.PORT ?? 8080);
await app.listen({ port, host: '0.0.0.0' });

app.log.info({ port }, 'premura worker started');
app.log.info('ical poll worker started');
app.log.info('draft generation worker started');
app.log.info('pre-arrival survey worker started');
app.log.info('welcome message worker started');
app.log.info(
  {
    ical: icalCron.nextRun()?.toISOString() ?? null,
    survey: surveyCron.nextRun()?.toISOString() ?? null,
    welcome: welcomeCron.nextRun()?.toISOString() ?? null,
  },
  'cron schedulati',
);

const shutdown = async (signal: string): Promise<void> => {
  app.log.info({ signal }, 'worker shutdown requested');
  icalCron.stop();
  surveyCron.stop();
  welcomeCron.stop();
  await Promise.all([
    icalPollWorker.close(),
    draftGenerationWorker.close(),
    surveyWorker.close(),
    welcomeWorker.close(),
  ]);
  await app.close();
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
