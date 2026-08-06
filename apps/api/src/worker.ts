import 'dotenv/config';
import { createServerClient } from '@premura/db';
import { isDryRun, isKillSwitchOn } from '@premura/integrations';
import Fastify from 'fastify';
import { wahaWebhookRoutes } from './api/webhooks/waha';
import { startBookingWelcomeCron } from './jobs/booking-welcome-cron';
// Import top-level: ogni modulo worker costruisce la propria istanza BullMQ
// Worker a module load e inizia subito ad ascoltare la coda. Stesso pattern
// che questi worker avevano quando vivevano dentro index.ts.
import { draftGenerationWorker } from './jobs/draft-generation-worker';
import { startGmailSyncCron } from './jobs/gmail-sync-cron';
import { startGuestAppInviteCron } from './jobs/guest-app-invite-cron';
import { startIcalCron } from './jobs/ical-cron';
import { icalPollWorker } from './jobs/ical-poll-worker';
import { startOutboundQueueCron } from './jobs/outbound-queue-worker';
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

// Client Drizzle long-lived per il webhook WAHA. Il worker e' sempre
// acceso, quindi la pool resta aperta a vita processo (chiusa nello
// shutdown), come fa index.ts per le sue route.
const apiClient = createServerClient();

// Webhook inbound WAHA SUL WORKER, non sul processo app: l'app fa
// scale-to-zero e il primo messaggio dell'ospite dopo un periodo idle
// pagherebbe 3-5s di cold start. Il worker e' sempre acceso — il
// messaggio inbound arriva senza attese. Esposto su porta pubblica
// dedicata (8443, vedi fly.toml [[services]]): la 443 appartiene al
// process group app. La stessa route resta registrata anche su app come
// URL di riserva.
await app.register(wahaWebhookRoutes, { db: apiClient.db });

// In che modalita' di invio parte IL PROCESSO CHE INVIA.
//
// La stessa riga esiste in index.ts, ma index.ts e' il process group
// `app`: una macchina che Fly ferma quando nessuno chiama l'HTTP, e che
// non manda messaggi a nessuno. I cron e la coda outbound vivono QUI, e
// qui la riga serve — cercarla nei log e non trovarla e' esattamente
// quello che e' successo il 06/08.
//
// Le due funzioni sono quelle che i mittenti chiamano prima di ogni
// invio: si stampa l'esito su cui il codice agisce, non una rilettura
// per conto proprio delle variabili. E' l'unico modo di sapere da fuori
// se il freno e' tirato, visto che i secret di Fly sono write-only.
const killSwitch = isKillSwitchOn();
const dryRun = isDryRun();
app.log.info(
  { killSwitch, dryRun, invii: killSwitch ? 'BLOCCATI' : dryRun ? 'simulati' : 'REALI' },
  'modalita invio WhatsApp',
);

const icalCron = startIcalCron();
const surveyCron = startSurveyCron();
const welcomeCron = startWelcomeMessageCron();
// Benvenuto per prenotazioni senza kit — il percorso di Julian (1 ago).
const bookingWelcomeCron = startBookingWelcomeCron();
const gmailSyncCron = startGmailSyncCron();
// Invito guest app appena compare il numero (flusso canonico §2b).
const guestAppInviteCron = startGuestAppInviteCron();
// Coda outbound (Fase 4): unico punto che invia i messaggi approvati.
const outboundQueueCron = startOutboundQueueCron();

// Health del worker: non "il processo risponde" ma "i cron sono ancora
// schedulati". Un croner fermo restituisce nextRun() null, ed e' quello
// che vogliamo vedere prima che passi un altro trimestre.
app.get('/health', () => {
  const crons = {
    ical: icalCron.nextRun()?.toISOString() ?? null,
    survey: surveyCron.nextRun()?.toISOString() ?? null,
    welcome: welcomeCron.nextRun()?.toISOString() ?? null,
    bookingWelcome: bookingWelcomeCron.nextRun()?.toISOString() ?? null,
    gmailSync: gmailSyncCron.nextRun()?.toISOString() ?? null,
    guestAppInvite: guestAppInviteCron.nextRun()?.toISOString() ?? null,
    outboundQueue: outboundQueueCron.nextRun()?.toISOString() ?? null,
  };
  const allScheduled = Object.values(crons).every((next) => next !== null);

  // In che modalita' di invio si trova il worker ADESSO.
  //
  // La riga di avvio non basta: `flyctl logs` tiene una finestra di
  // una ventina di minuti, e un worker riavviato mezz'ora prima ha gia'
  // perso il suo log — e' successo il 06/08, due volte. Qui la domanda
  // si puo' fare quando serve, e la risposta non scade.
  //
  // Le funzioni sono quelle che i mittenti chiamano prima di ogni
  // invio, e leggono l'ambiente a ogni chiamata: quindi questo e' lo
  // stato corrente, non quello del boot. Nessun valore di secret esce:
  // solo la conclusione.
  const killSwitch = isKillSwitchOn();
  const dryRun = isDryRun();

  return {
    status: allScheduled ? 'ok' : 'degraded',
    process: 'worker',
    crons,
    invii: {
      killSwitch,
      dryRun,
      modo: killSwitch ? 'BLOCCATI' : dryRun ? 'simulati' : 'REALI',
    },
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
    bookingWelcome: bookingWelcomeCron.nextRun()?.toISOString() ?? null,
    gmailSync: gmailSyncCron.nextRun()?.toISOString() ?? null,
    guestAppInvite: guestAppInviteCron.nextRun()?.toISOString() ?? null,
    outboundQueue: outboundQueueCron.nextRun()?.toISOString() ?? null,
  },
  'cron schedulati',
);

const shutdown = async (signal: string): Promise<void> => {
  app.log.info({ signal }, 'worker shutdown requested');
  icalCron.stop();
  surveyCron.stop();
  welcomeCron.stop();
  bookingWelcomeCron.stop();
  gmailSyncCron.stop();
  guestAppInviteCron.stop();
  outboundQueueCron.stop();
  await Promise.all([
    icalPollWorker.close(),
    draftGenerationWorker.close(),
    surveyWorker.close(),
    welcomeWorker.close(),
  ]);
  await app.close();
  await apiClient.close();
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
