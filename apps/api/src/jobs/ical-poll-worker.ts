import { Worker, type Job } from 'bullmq';
import nodeIcal from 'node-ical';
import pino from 'pino';
import { createServerClient } from '@premura/db';
import { getRedisConnection } from './redis-connection';
import type { IcalPollJobData } from './queues';
import { mapIcalEventToBookingShell } from './ical-event-mapper';
import { upsertBookingShell } from './booking-upsert-repository';
import { reconcileMissingEvents } from './feed-reconciliation';
import { recordFeedOutcome } from './feed-sync-state';
import { redactIcalUrl } from './redact-ical-url';

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
 * TODO slice 3.2: test E2E della pipeline completa (fetch -> map -> upsert)
 * con Postgres Testcontainer e URL Booking reale. Slice 3.1 copre solo i
 * passi pure-function via unit test (redactIcalUrl, mapIcalEventToBookingShell);
 * upsertBookingShell non e' unit-testato perche' mockare la chain Drizzle
 * e' fragile e l'integration con DB vero da' segnale piu' utile.
 *
 * Pipeline (slice 3.1):
 *  1. Fetch URL via node-ical (async.fromURL)
 *  2. Per ogni VEVENT chiama mapIcalEventToBookingShell
 *  3. Per ogni shell valida chiama upsertBookingShell (idempotente)
 *  4. Aggrega contatori e logga summary
 *
 * Source 'channel_manager' viene skippato in slice 3.1: il mapper accetta
 * solo 'booking' | 'airbnb'. La logica CM iCal arrivera' con M2b.x quando
 * si decidera' la semantica del data_source per quei feed.
 *
 * Concurrency 2: due job in parallelo per istanza worker. Numero
 * conservativo coerente con host Livello 1 (1-5 properties, max 2-3
 * sorgenti l'una).
 *
 * Lifecycle DB: per ogni job apriamo e chiudiamo un client Drizzle.
 * Allineato al pattern dello scheduler. Se l'overhead di setup pool a ogni
 * job diventa significativo (cron frequente, molte property), in slice 3.2
 * valuteremo un client condiviso a livello di processo worker.
 *
 * Error handling:
 *  - errore di fetch o di setup DB         -> log error + rethrow (BullMQ retry)
 *  - errore upsert su singola shell        -> log warn + counter, NON rethrow:
 *                                              un evento corrotto non deve
 *                                              far perdere progresso sugli altri
 *  - icalUrl nei log error e' redacted via redactIcalUrl per non leakare il
 *    token (chiude il TODO lasciato in slice 2)
 */
export const icalPollWorker = new Worker<IcalPollJobData>(
  'ical-poll',
  async (job: Job<IcalPollJobData>) => {
    const { propertyId, icalUrl, source } = job.data;

    if (source === 'channel_manager') {
      logger.warn(
        { propertyId, source },
        'channel_manager ical skipped (slice 3.1, supportato in M2b.x)',
      );
      return;
    }

    const client = createServerClient();
    try {
      const events = await nodeIcal.async.fromURL(icalUrl);
      const components = Object.values(events);
      const fetched = components.length;

      let mapped = 0;
      let inserted = 0;
      let skipped = 0;
      let dateChanged = 0;
      let errors = 0;
      // UID visti in QUESTO poll (anche di eventi-blocco che il mapper
      // scarta): servono alla riconciliazione cancellazioni.
      const seenRefs = new Set<string>();
      // Le DATE viste, non solo gli UID. Booking riemette la stessa
      // fascia con un UID nuovo ogni notte: senza le date, la riga
      // vecchia sembra sparita e viene marcata come cancellazione
      // mentre l'ospite e' ancora in casa (06/08).
      const seenRanges: Array<{ checkinAt: Date; checkoutAt: Date }> = [];
      let hasVcalendar = false;

      for (const component of components) {
        const type = (component as { type?: string }).type ?? '';
        if (type.toUpperCase() === 'VCALENDAR') hasVcalendar = true;
        if (component.type !== 'VEVENT') continue;
        const rawUid = (component as { uid?: string }).uid;
        if (rawUid) seenRefs.add(rawUid);
        const shell = mapIcalEventToBookingShell(component, propertyId, source);
        if (!shell) continue;
        seenRefs.add(shell.platformBookingRef);
        seenRanges.push({ checkinAt: shell.checkinAt, checkoutAt: shell.checkoutAt });
        mapped += 1;

        try {
          const result = await upsertBookingShell(client.db, shell);
          // MAI sopprimere in silenzio (Andrea 30/07): ogni fascia
          // anonima scartata perche' coperta lascia traccia completa —
          // e' cio' che permettera' di recuperare eventi scartati per
          // errore quando i feed incrociati verranno rimappati.
          if (result.suppressedCoverage) {
            logger.warn(
              {
                propertyId: result.suppressedCoverage.propertyId,
                uid: result.suppressedCoverage.platformBookingRef,
                checkinAt: result.suppressedCoverage.checkinAt.toISOString(),
                checkoutAt: result.suppressedCoverage.checkoutAt.toISOString(),
                coveredBy: result.suppressedCoverage.coveredBy.map((c) => ({
                  bookingId: c.id,
                  guest: c.guestFullName,
                  checkinAt: c.checkinAt.toISOString(),
                  checkoutAt: c.checkoutAt.toISOString(),
                })),
                reason: result.reason,
              },
              'fascia anonima soppressa: coperta da prenotazioni con nome',
            );
          }
          if (result.inserted) {
            inserted += 1;
          } else if (result.skipped) {
            skipped += 1;
            if (result.reason === 'date changed - handled in slice 3.2') {
              dateChanged += 1;
            }
          }
        } catch (err) {
          errors += 1;
          logger.warn(
            {
              err,
              propertyId,
              source,
              platformBookingRef: shell.platformBookingRef,
            },
            'upsert failed for single event, continuing',
          );
        }
      }

      // VINCOLO (Andrea 30/07): "feed risponde e l'evento non c'e'" e'
      // diverso da "feed non risponde". La riconciliazione cancellazioni
      // gira SOLO se il body era un calendario vero (VCALENDAR presente
      // o almeno un evento mappato); un body non parsabile e' un errore
      // feed, mai "zero eventi".
      const parsedOk = hasVcalendar || mapped > 0;
      try {
        await recordFeedOutcome(
          client.db,
          propertyId,
          icalUrl,
          parsedOk
            ? { ok: true, eventsCount: mapped }
            : { ok: false, error: 'body non parsabile: nessun VCALENDAR nel feed' },
        );
      } catch (feedStateErr) {
        logger.warn({ err: feedStateErr, propertyId }, 'recordFeedOutcome fallita (best-effort)');
      }

      let cancellations: Awaited<ReturnType<typeof reconcileMissingEvents>> | null = null;
      if (parsedOk && (source === 'booking' || source === 'airbnb')) {
        try {
          cancellations = await reconcileMissingEvents(
            client.db,
            propertyId,
            source,
            seenRefs,
            new Date(),
            seenRanges,
          );
          for (const flaggedId of cancellations.flagged) {
            logger.warn(
              { propertyId, source, bookingId: flaggedId },
              'possibile cancellazione: evento assente da 2 poll riusciti consecutivi',
            );
          }
        } catch (reconcileErr) {
          logger.warn({ err: reconcileErr, propertyId }, 'riconciliazione cancellazioni fallita');
        }
      }

      logger.info(
        {
          propertyId,
          source,
          fetched,
          mapped,
          inserted,
          skipped,
          dateChanged,
          errors,
          parsedOk,
          cancellations,
        },
        'ical poll completed',
      );
    } catch (err) {
      // Poll fallito: NON incrementa mai il contatore cancellazioni.
      // Si registra come errore feed — e' cio' che alimentera' il
      // "feed da ricollegare" mostrato all'host.
      try {
        await recordFeedOutcome(client.db, propertyId, icalUrl, {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      } catch (feedStateErr) {
        logger.warn({ err: feedStateErr, propertyId }, 'recordFeedOutcome fallita (best-effort)');
      }
      logger.error(
        { err, propertyId, source, icalUrl: redactIcalUrl(icalUrl) },
        'ical poll failed',
      );
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
