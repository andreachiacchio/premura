import { createServerClient } from '@premura/db';
import { type Job, Worker } from 'bullmq';
import pino from 'pino';
import { getRedisConnection } from './redis-connection';
import { processWelcomeJob } from './welcome-message-handler';
import { WELCOME_QUEUE_NAME, type WelcomeJobData } from './welcome-message-queue';

// Slice E — Worker BullMQ welcome message.

const logger = pino({
  name: 'welcome-worker',
  level: process.env.LOG_LEVEL ?? 'info',
});

export const welcomeWorker = new Worker<WelcomeJobData>(
  WELCOME_QUEUE_NAME,
  async (job: Job<WelcomeJobData>) => {
    const client = createServerClient();
    try {
      return await processWelcomeJob(client.db, job);
    } catch (err) {
      logger.error({ err, jobId: job.id, kitId: job.data.kitId }, 'welcome worker errored');
      throw err;
    } finally {
      await client.close();
    }
  },
  {
    connection: getRedisConnection(),
    concurrency: 2,
  },
);
