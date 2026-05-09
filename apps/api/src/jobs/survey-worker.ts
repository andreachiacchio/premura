import { createServerClient } from '@premura/db';
import { type Job, Worker } from 'bullmq';
import pino from 'pino';
import { getRedisConnection } from './redis-connection';
import { processSurveyJob } from './survey-handler';
import { SURVEY_QUEUE_NAME, type SurveyJobData } from './survey-queue';

// Slice B — Worker BullMQ pre-arrival survey.

const logger = pino({
  name: 'survey-worker',
  level: process.env.LOG_LEVEL ?? 'info',
});

export const surveyWorker = new Worker<SurveyJobData>(
  SURVEY_QUEUE_NAME,
  async (job: Job<SurveyJobData>) => {
    const client = createServerClient();
    try {
      return await processSurveyJob(client.db, job);
    } catch (err) {
      logger.error({ err, jobId: job.id, type: job.data.type }, 'survey worker errored');
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
