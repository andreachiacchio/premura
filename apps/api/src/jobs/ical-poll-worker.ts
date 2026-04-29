import { Worker, type Job } from 'bullmq';
import nodeIcal from 'node-ical';
import pino from 'pino';
import { getRedisConnection } from './redis-connection';
import type { IcalPollJobData } from './queues';

/**
 * Logger dedicato al worker iCal.
 *
 * Pino diretto invece di app.log Fastify perche' il worker gira in un
 * lifecycle separato dalla request HTTP: e' un consumer BullMQ a lunga
 * durata, non scoped a una request. Livello allineato a LOG_LEVEL come
 * il logger Fastify in src/index.ts.
 */
const logger = pino({
  name: 'ical-poll-worker',
  level: process.env.LOG_LEVEL ?? 'info',
});

/**
 * Worker BullMQ che processa job dalla coda 'ical-poll'.
 *
 * Comportamento slice 2 (scaffolding):
 *  - Fetcha l'URL iCal con node-ical (API async)
 *  - Conta gli eventi di tipo VEVENT trovati
 *  - Logga il risultato; NESSUN upsert su DB (arriva in slice 3)
 *
 * Concurrency 2: due job in parallelo per istanza worker. Numero conservativo
 * coerente con host Livello 1 (1-5 properties, max 2-3 sorgenti l'una).
 *
 * Error handling: try/catch + log + rethrow. Il rethrow e' essenziale per
 * far scattare il retry BullMQ secondo le opzioni in queues.ts
 * (attempts 3, backoff exponential 2s).
 */
export const icalPollWorker = new Worker<IcalPollJobData>(
  'ical-poll',
  async (job: Job<IcalPollJobData>) => {
    const { propertyId, icalUrl, source } = job.data;
    try {
      const events = await nodeIcal.async.fromURL(icalUrl);
      const veventCount = Object.values(events).filter(
        (event) => event.type === 'VEVENT',
      ).length;
      logger.info(
        { propertyId, source, veventCount },
        `fetched ${veventCount} events from ${source} for property ${propertyId}`,
      );
    } catch (err) {
      // TODO slice 3: redactIcalUrl(icalUrl) prima di loggare. icalUrl puo'
      // contenere token sensibile (es. ical.booking.com/v1/export?t=TOKEN).
      // Helper deve mostrare host + path mascherato, mai query string.
      // Per slice 2 lasciamo log completo: logghiamo solo in dev.
      logger.error(
        { err, propertyId, source, icalUrl },
        'ical poll failed',
      );
      throw err;
    }
  },
  {
    connection: getRedisConnection(),
    concurrency: 2,
  },
);
