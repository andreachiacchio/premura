import 'dotenv/config';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { createServerClient } from '@premura/db';
import Fastify from 'fastify';
import { bookingsRoutes } from './api/bookings';
import { propertiesRoutes } from './api/properties';
import { wahaWebhookRoutes } from './api/webhooks/waha';
import { whatsappWebhookRoutes } from './api/webhooks/whatsapp';
// Solo i produttori di coda: questo processo enqueue (webhook -> draft
// generation) e legge i contatori per /health/jobs. I consumer BullMQ e i
// cron vivono in src/worker.ts, su un process group Fly che non si spegne
// mai — vedi il commento in testa a quel file.
import { draftGenerationQueue } from './jobs/draft-generation-queue';
import { icalPollQueue } from './jobs/queues';
import { surveyQueue } from './jobs/survey-queue';
import { attachJwtAuth, makeDbHostResolver } from './plugins/jwt-auth';

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

// Stats delle queue. Probe ops + dashboard health.
// getJobCounts(...keys) ritorna esattamente i contatori richiesti.
app.get('/health/jobs', async () => {
  const [icalCounts, draftCounts, surveyCounts] = await Promise.all([
    icalPollQueue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed'),
    draftGenerationQueue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed'),
    surveyQueue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed'),
  ]);
  return {
    queues: [
      { name: 'ical-poll', counts: icalCounts },
      { name: 'draft-generation', counts: draftCounts },
      { name: 'pre-arrival-survey', counts: surveyCounts },
    ],
  };
});

// Client Drizzle long-lived per le routes HTTP. Diversamente dal worker
// iCal (che apre/chiude per job), le routes condividono una sola pool
// Postgres a vita app. Chiusa nello shutdown gracieful.
const apiClient = createServerClient();

// Slice 6.5.2: JWT validation Fastify per route protette. attachJwtAuth
// (non plugin: deve agire sul context root) intercetta tutte le route
// registrate DOPO. Esclude /health* e /webhooks/* dove la sicurezza
// e' delegata a signature verify (es. WhatsApp HMAC).
attachJwtAuth(app, {
  excludePaths: ['/health', '/webhooks/'],
  // Parte A (04/08): il sub del JWT e' auth.users.id, l'hostId vero
  // si risolve via hosts.auth_user_id (mini-cache nel plugin).
  resolveHostId: makeDbHostResolver(apiClient.db),
});

// Routes M2a.4: completion form Booking + skip.
await app.register(bookingsRoutes, { prefix: '/api/bookings', db: apiClient.db });

// Slice 6.5.3: trigger one-shot iCal poll dopo creazione property.
await app.register(propertiesRoutes, { prefix: '/api/properties', db: apiClient.db });

// Slice 7a.1: webhook WhatsApp Cloud API (opzione I, bootstrap su numero
// Business esistente Andrea). Il plugin registra un content-type parser
// custom per esporre rawBody (necessario per HMAC) — l'encapsulation
// Fastify lo isola dal resto dell'app.
await app.register(whatsappWebhookRoutes, { db: apiClient.db });

// Webhook inbound WAHA. Registrato in un plugin separato perche' ha il
// suo content-type parser (rawBody per l'HMAC) e l'encapsulation Fastify
// non permette di condividerlo con quello di Meta senza che uno dei due
// vinca sull'altro.
await app.register(wahaWebhookRoutes, { db: apiClient.db });

// TODO: register dashboard API, cleaner endpoints

const port = Number(process.env.PORT ?? 3000);
await app.listen({ port, host: '0.0.0.0' });
app.log.info(`Premura listening on :${port}`);

const shutdown = async (signal: string): Promise<void> => {
  app.log.info({ signal }, 'shutdown requested');
  await app.close();
  await apiClient.close();
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
