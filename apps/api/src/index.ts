import 'dotenv/config';
import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
// Import top-level: l'istanza Worker viene creata nel modulo importato e
// inizia subito ad ascoltare la queue 'ical-poll'. Niente lazy load.
import { icalPollWorker } from './jobs/ical-poll-worker';
import { icalPollQueue } from './jobs/queues';

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

// TODO: register webhooks, dashboard API, cleaner endpoints

const port = Number(process.env.PORT ?? 3000);
await app.listen({ port, host: '0.0.0.0' });
app.log.info(`Premura listening on :${port}`);
app.log.info('ical poll worker started');

// Graceful shutdown: chiudo il worker (drain dei job in-flight + disconnect
// Redis) PRIMA di Fastify, cosi' eventuali handler che enqueuano job non
// trovano connessioni gia' chiuse.
const shutdown = async (signal: string): Promise<void> => {
  app.log.info({ signal }, 'shutdown requested');
  await icalPollWorker.close();
  await app.close();
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
