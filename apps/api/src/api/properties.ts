import { type Database, properties } from '@premura/db';
import { and, eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { icalPollQueue } from '../jobs/queues';
import { requireUser } from '../plugins/jwt-auth';

// Slice 6.5.3: endpoint POST /api/properties/:id/ical-poll-now per
// triggerare un poll iCal one-shot subito dopo la creazione di una
// property. Senza questo endpoint, l'host crea una property nuova e
// deve aspettare fino a 15 min (cron tick) per il primo sync.
//
// Protezione: JWT obbligatorio + ownership check (la property deve
// appartenere all'host autenticato).

export type PropertiesRoutesOptions = {
  db: Database;
};

export const propertiesRoutes: FastifyPluginAsync<PropertiesRoutesOptions> = async (app, opts) => {
  const { db } = opts;

  const paramsSchema = z.object({ id: z.string().uuid() });

  app.post('/:id/ical-poll-now', async (req, reply) => {
    const user = requireUser(req);
    const { id } = paramsSchema.parse(req.params);

    const [row] = await db
      .select({ id: properties.id, icalSources: properties.icalSources })
      .from(properties)
      .where(and(eq(properties.id, id), eq(properties.hostId, user.hostId)))
      .limit(1);

    if (!row) {
      // 404 anche per property di altro host (no leak via 403 vs 404).
      req.log.warn({ event: 'property.poll.not_found', propertyId: id, hostId: user.hostId });
      return reply.code(404).send({ error: 'not_found' });
    }

    const sources = row.icalSources ?? [];
    if (sources.length === 0) {
      req.log.info(
        { event: 'property.poll.no_sources', propertyId: id },
        'no icalSources configured, skip enqueue',
      );
      return reply.code(200).send({ enqueued: 0 });
    }

    let enqueued = 0;
    for (const src of sources) {
      await icalPollQueue.add(
        `oneshot-${id}-${src.source}`,
        { propertyId: row.id, icalUrl: src.url, source: src.source },
        { jobId: `oneshot-${id}-${src.source}-${Date.now()}` },
      );
      enqueued++;
    }

    req.log.info(
      { event: 'property.poll.enqueued', propertyId: id, count: enqueued },
      'enqueued one-shot iCal poll(s)',
    );
    return reply.code(202).send({ enqueued });
  });
};
