import 'dotenv/config';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { createServerClient } from '@premura/db';
import { isDryRun, isKillSwitchOn } from '@premura/integrations';
import { sql } from 'drizzle-orm';
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

// CORS: lista esplicita da CORS_ORIGIN, separata da virgole.
// `origin: true` accettava QUALUNQUE origine, quindi qualsiasi sito
// poteva chiamare l'API dal browser di un host loggato. Il default
// senza la variabile e' `false` — nessuna origine cross-site — perche'
// una configurazione dimenticata deve chiudere, non aprire.
const corsOrigins = (process.env.CORS_ORIGIN ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter((o) => o.length > 0);
if (corsOrigins.length === 0) {
  app.log.warn(
    'CORS_ORIGIN non impostata: nessuna origine cross-site ammessa. ' +
      'Se la dashboard chiama questa API dal browser, impostala.',
  );
}
await app.register(cors, {
  origin: corsOrigins.length > 0 ? corsOrigins : false,
  credentials: true,
});

// Rate limit globale. Era in dependencies ma non registrato: l'API
// stava senza alcun tetto.
//
// I /webhooks/ NON sono esclusi: sono gli endpoint piu' esposti, e
// lasciarli senza limite sarebbe il contrario della protezione. Hanno
// un tetto piu' alto perche' una raffica legittima di eventi Meta o
// WAHA e' normale, mentre un host non fa 120 richieste al minuto.
const RATE_LIMIT_DEFAULT = 120;
const RATE_LIMIT_WEBHOOK = 600;

await app.register(rateLimit, {
  timeWindow: '1 minute',
  keyGenerator: (req) => req.ip,
  // Tetto differenziato in un punto solo: i webhook restano protetti,
  // ma con la soglia giusta per il loro traffico.
  max: (req) => (req.url.startsWith('/webhooks/') ? RATE_LIMIT_WEBHOOK : RATE_LIMIT_DEFAULT),
});

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

// Il database risponde? Meglio non partire affatto che partire e
// fallire su ogni richiesta: un processo sano che restituisce 500 a
// tutti e' piu' difficile da diagnosticare di uno che non si alza.
try {
  await apiClient.db.execute(sql`SELECT 1`);
  app.log.info('database raggiungibile');
} catch (err) {
  app.log.fatal({ err }, 'database NON raggiungibile: non avvio il server');
  await apiClient.close().catch(() => {});
  process.exit(1);
}

// In che modalita' di invio siamo partiti davvero.
//
// Le due funzioni chiamate qui sono LE STESSE che chiamano i mittenti
// prima di ogni sendText/sendImage: quello che si legge nei log e'
// l'esito su cui il codice agisce, non una rilettura per conto proprio
// delle variabili d'ambiente. Rileggerle qui vorrebbe dire avere due
// interpretazioni della stessa configurazione, e prima o poi diverse.
//
// Serve perche' i secret di Fly sono write-only: `secrets list` mostra
// nomi e digest, mai valori, quindi da fuori si sa che una variabile
// esiste ma non a cosa e' impostata. Questa riga e' l'unico modo di
// sapere se il freno e' tirato senza esporre niente: stampa la
// conclusione, non il valore.
const killSwitch = isKillSwitchOn();
const dryRun = isDryRun();
app.log.info(
  { killSwitch, dryRun, invii: killSwitch ? 'BLOCCATI' : dryRun ? 'simulati' : 'REALI' },
  'modalita invio WhatsApp',
);

const port = Number(process.env.PORT ?? 3000);
await app.listen({ port, host: '0.0.0.0' });
app.log.info(`Premura listening on :${port}`);

// Chiusura: se qualcosa fallisce si esce con 1, non con 0. Uscire
// sempre a 0 diceva a Fly che la chiusura era pulita anche quando una
// connessione restava appesa.
const shutdown = async (signal: string): Promise<void> => {
  app.log.info({ signal }, 'shutdown requested');
  let uscita = 0;
  try {
    await app.close();
  } catch (err) {
    app.log.error({ err }, 'chiusura del server fallita');
    uscita = 1;
  }
  try {
    await apiClient.close();
  } catch (err) {
    app.log.error({ err }, 'chiusura della connessione al database fallita');
    uscita = 1;
  }
  process.exit(uscita);
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
