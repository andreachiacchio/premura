import { Queue } from 'bullmq';
import { getRedisConnection } from './redis-connection';

// Slice E — Queue BullMQ welcome message check-in.

export type WelcomeJobData = { type: 'send-welcome'; kitId: string };

export const WELCOME_QUEUE_NAME = 'welcome-message';

export const welcomeQueue = new Queue<WelcomeJobData>(WELCOME_QUEUE_NAME, {
  connection: getRedisConnection(),
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 },
  },
});

export async function enqueueWelcomeSend(kitId: string): Promise<void> {
  await welcomeQueue.add(
    'send-welcome',
    { type: 'send-welcome', kitId },
    { jobId: `welcome:send:${kitId}` },
  );
}
