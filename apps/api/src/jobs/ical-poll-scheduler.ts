import pino from 'pino';
import { createServerClient } from '@premura/db';
import { icalPollQueue } from './queues';

/**
 * Logger dedicato allo scheduler iCal.
 * Stesso ragionamento di ical-poll-worker.ts: pino diretto, fuori dalla
 * request lifecycle Fastify.
 */
const logger = pino({
  name: 'ical-poll-scheduler',
  level: process.env.LOG_LEVEL ?? 'info',
});

/**
 * Enqueue di un job per ogni icalSource di ogni property attiva.
 *
 * Slice 2: definisce solo la funzione, non la cabla a un trigger periodico.
 * Slice 3 si occupera' del cron (BullMQ repeatable job o scheduler esterno).
 *
 * Strategia query:
 *  - Filtro su isActive lato DB.
 *  - Filtro su icalSources non vuoto in-app: gli host Livello 1 hanno
 *    1-5 properties, l'overhead di leggere anche le righe vuote e'
 *    trascurabile e tiene la query semplice (jsonb_array_length non
 *    e' immediato in Drizzle senza raw SQL).
 *
 * Lifecycle DB: la funzione apre e chiude il proprio client. Acceptable
 * per slice 2 dove e' chiamata standalone; in slice 3, quando ci sara'
 * un cron, valuteremo se passare un client condiviso.
 */
export async function enqueueIcalPolling(): Promise<void> {
  const client = createServerClient();
  try {
    const rows = await client.db.query.properties.findMany({
      where: (p, { eq }) => eq(p.isActive, true),
      columns: {
        id: true,
        icalSources: true,
      },
    });

    let enqueued = 0;
    for (const row of rows) {
      if (row.icalSources.length === 0) continue;
      for (const src of row.icalSources) {
        await icalPollQueue.add('poll', {
          propertyId: row.id,
          icalUrl: src.url,
          source: src.source,
        });
        enqueued += 1;
      }
    }

    logger.info(
      { enqueued, propertiesScanned: rows.length },
      'ical polling enqueued',
    );
  } finally {
    await client.close();
  }
}
