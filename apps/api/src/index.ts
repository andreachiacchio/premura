import 'dotenv/config';
import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import { createServerClient } from '@premura/db';
// Import top-level: l'istanza Worker viene creata nel modulo importato e
// inizia subito ad ascoltare la queue 'ical-poll'. Niente lazy load.
import { icalPollWorker } from './jobs/ical-poll-worker';
import { icalPollQueue } from './jobs/queues';
import { startIcalCron } from './jobs/ical-cron';
import { bookingsRoutes } from './api/bookings';
import { whatsappWebhookRoutes } from './api/webhooks/whatsapp';

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL ?? 'info',
    transport:
      process.env.NODE_ENV === 'development'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
  },
});

await app.register(helmet);
await app.register(cors, { origin: true });

app.get('/health', () => ({
  status: 'ok',
  version: '0.1.0',
  timestamp: new Date().toISOString(),
}));

// Stats della queue iCal poll. Probe ops + dashboard health.
// getJobCounts(...keys) ritorna esattamente i contatori richiesti.
app.get('/health/jobs', async () => {
  const counts = await icalPollQueue.getJobCounts(
    'waiting',
    'active',
    'completed',
    'failed',
    'delayed',
  );
  return { queue: 'ical-poll', counts };
});

// Client Drizzle long-lived per le routes HTTP. Diversamente dal worker
// iCal (che apre/chiude per job), le routes condividono una sola pool
// Postgres a vita app. Chiusa nello shutdown gracieful.
const apiClient = createServerClient();

// Routes M2a.4: completion form Booking + skip. Auth host JWT verra' in slice 6.
await app.register(bookingsRoutes, { prefix: '/api/bookings', db: apiClient.db });

// Slice 7a.1: webhook WhatsApp Cloud API (opzione I, bootstrap su numero
// Business esistente Andrea). Il plugin registra un content-type parser
// custom per esporre rawBody (necessario per HMAC) — l'encapsulation
// Fastify lo isola dal resto dell'app.
await app.register(whatsappWebhookRoutes);

// TODO: register dashboard API, cleaner endpoints

// Cron iCal avviato dopo il worker (worker gia' importato top-level) e prima
// di app.listen, cosi' eventuali tick che partono mentre l'app sta per andare
// online trovano la pipeline di processing pronta.
const icalCron = startIcalCron();

const port = Number(process.env.PORT ?? 3000);
await app.listen({ port, host: '0.0.0.0' });
app.log.info(`Premura listening on :${port}`);
app.log.info('ical poll worker started');

// Graceful shutdown: prima fermo il cron (niente nuovi enqueue), poi il
// worker (drain dei job in-flight + disconnect Redis), poi Fastify. L'ordine
// evita che enqueue partiti dal cron trovino connessioni gia' chiuse.
const shutdown = async (signal: string): Promise<void> => {
  app.log.info({ signal }, 'shutdown requested');
  icalCron.stop();
  await icalPollWorker.close();
  await app.close();
  await apiClient.close();
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
