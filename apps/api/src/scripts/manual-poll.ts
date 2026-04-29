import { config as loadEnv } from 'dotenv';

/**
 * Smoke test E2E manuale della pipeline iCal (M2a.4 slice 3.2).
 *
 * Lancia enqueueIcalPolling() una volta, attende 30s che il worker processi
 * i job, stampa i contatori finali e termina. NON e' un test automatizzato:
 * richiede DB + Redis live e i feed iCal reali sui properties.icalSources
 * delle property attive.
 *
 * Uso:
 *   pnpm --filter @premura/api manual-poll
 *
 * Path-resolution di .env.local: dotenv risolve relativo a process.cwd().
 * Quando lo script parte via pnpm filter, la cwd e' apps/api/, quindi
 * '.env.local' -> apps/api/.env.local (dove il prereq slice 3.1 ha
 * configurato REDIS_URL). Se lanciato da altra cwd, REDIS_URL deve essere
 * gia' nell'env del processo chiamante.
 *
 * Perche' dynamic import:
 *  queues.ts e ical-poll-worker.ts costruiscono Queue/Worker a module load
 *  chiamando getRedisConnection(), che legge process.env.REDIS_URL UNA volta
 *  e cacha la connessione. Quindi loadEnv() deve girare PRIMA di importare
 *  quei moduli, altrimenti la connection cade sul fallback localhost.
 *  Le static import ESM sono hoisted: l'unico modo deterministico e'
 *  await import().
 */
loadEnv({ path: '.env.local' });

const { enqueueIcalPolling } = await import('../jobs/ical-poll-scheduler');
const { icalPollQueue } = await import('../jobs/queues');
const { icalPollWorker } = await import('../jobs/ical-poll-worker');

const COUNT_KEYS = ['waiting', 'active', 'completed', 'failed', 'delayed'] as const;

const sumCounts = (counts: Record<string, number>): number =>
  Object.values(counts).reduce((acc, n) => acc + n, 0);

const before = await icalPollQueue.getJobCounts(...COUNT_KEYS);
await enqueueIcalPolling();
const afterEnqueue = await icalPollQueue.getJobCounts(...COUNT_KEYS);

const enqueued = sumCounts(afterEnqueue) - sumCounts(before);
console.log(`enqueued ${enqueued} jobs, waiting 30s for processing...`);

await new Promise<void>((resolve) => setTimeout(resolve, 30_000));

const final = await icalPollQueue.getJobCounts(...COUNT_KEYS);
console.log('final job counts:', final);

await icalPollWorker.close();
await icalPollQueue.close();
process.exit(0);
