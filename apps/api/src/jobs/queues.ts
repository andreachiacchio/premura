import { Queue } from 'bullmq';
import { getRedisConnection } from './redis-connection';

/**
 * Payload del job iCal poll.
 *
 * `source` riflette il tipo di sorgente iCal definita su properties.icalSources
 * (vedi packages/db/src/schema/properties.ts). Il valore 'channel_manager'
 * copre Smoobu, Hostaway e simili: la distinzione fine (nome del CM) sta
 * sulla property, non sul job.
 */
export type IcalPollJobData = {
  propertyId: string;
  icalUrl: string;
  source: 'booking' | 'airbnb' | 'channel_manager';
};

/**
 * Queue per il polling iCal (M2a.4 slice 2).
 *
 * Default job options:
 *  - attempts 3: tre tentativi totali prima di fallimento definitivo
 *  - backoff exponential delay 2s: ritento dopo 2s, poi 4s, poi 8s
 *  - removeOnComplete keep 100: tengo gli ultimi 100 job completati per
 *    debug recente, gli altri vengono eliminati dal Redis
 *  - removeOnFail keep 500: i fallimenti durano di piu' per analisi
 *    post-mortem; storage extra acceptable, sono comunque pochi
 */
export const icalPollQueue = new Queue<IcalPollJobData>('ical-poll', {
  connection: getRedisConnection(),
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 },
  },
});
