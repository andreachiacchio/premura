import { findActiveSurvey } from '@premura/agents';
import type { Database } from '@premura/db';
import { parseStatusEvents } from '@premura/integrations';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { enqueueDraftGeneration } from '../../jobs/draft-generation-queue';
import { enqueueSurveyProcessInbound } from '../../jobs/survey-queue';
import { extractInboundMessages, whatsappWebhookPayloadSchema } from './whatsapp-payload';
import { persistInboundMessage } from './whatsapp-persist';
import { verifyMetaSignature } from './whatsapp-signature';
import { applyOutboundStatusUpdate } from './whatsapp-status-persist';

// Webhook WhatsApp Cloud API per messaggi inbound (slice 7a.1, opzione I).
//
// Pipeline 1: ricezione raw + verifica signature + parse + persist.
//
// Setup Meta: vedi docs/META-WEBHOOK-SETUP.md.
//
// Env vars richiesti (prefisso META_* per coerenza con dashboard Meta):
//   - META_APP_SECRET     -> firma HMAC del body POST
//   - META_VERIFY_TOKEN   -> challenge handshake GET
//   - META_APP_ID         -> log only (identifica l'app Meta nella telemetry)
//   - META_WABA_ID        -> log only (per cross-check con entry[].id)
//   - META_PHONE_NUMBER_ID e META_ACCESS_TOKEN sono per l'outbound (fase 4),
//     non usati qui.
//
// Encapsulation Fastify: il content-type parser custom (raw body buffer)
// vive solo dentro questo plugin scope. Il resto dell'app continua a usare
// il JSON parser default.
//
// Logging strutturato (pino, no PII): ogni evento ha un campo `event`
// fisso che facilita ricerca/dashboard Axiom. Niente body messaggio nei
// log, solo metadata (waba, phone_number_id, msg id, dimensioni, esito).

declare module 'fastify' {
  interface FastifyRequest {
    rawBody?: Buffer;
  }
}

const challengeQuerySchema = z.object({
  'hub.mode': z.string().optional(),
  'hub.verify_token': z.string().optional(),
  'hub.challenge': z.string().optional(),
});

export type WhatsappWebhookPluginOptions = {
  db: Database;
};

export const whatsappWebhookRoutes: FastifyPluginAsync<WhatsappWebhookPluginOptions> = async (
  app,
  opts,
) => {
  const { db } = opts;
  // Override JSON parser SOLO per questo plugin: salva rawBody su req per
  // il calcolo HMAC, poi parsa come JSON normale. Encapsulato dal register.
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    (req: FastifyRequest, body: Buffer, done) => {
      req.rawBody = body;
      if (body.length === 0) {
        done(null, {});
        return;
      }
      try {
        const parsed = JSON.parse(body.toString('utf8'));
        done(null, parsed);
      } catch (err) {
        done(err as Error, undefined);
      }
    },
  );

  // GET — challenge handshake. Meta invia hub.mode=subscribe + hub.verify_token
  // + hub.challenge. Se il token combacia, rispondi 200 con il challenge in
  // text/plain. Altrimenti 403.
  app.get('/webhooks/whatsapp', async (req, reply) => {
    const expectedToken = process.env.META_VERIFY_TOKEN;
    if (!expectedToken) {
      req.log.error({ event: 'wa.challenge.unconfigured' }, 'META_VERIFY_TOKEN not configured');
      return reply.code(500).send({ error: 'not_configured' });
    }

    const parsed = challengeQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      req.log.warn({ event: 'wa.challenge.invalid_query' }, 'whatsapp challenge invalid query');
      return reply.code(400).send({ error: 'invalid_query' });
    }
    const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = parsed.data;

    if (mode === 'subscribe' && token === expectedToken && challenge) {
      req.log.info(
        { event: 'wa.challenge.ok', challengeLen: challenge.length },
        'whatsapp challenge handshake OK',
      );
      return reply.code(200).type('text/plain').send(challenge);
    }
    req.log.warn(
      { event: 'wa.challenge.mismatch', mode, hasToken: Boolean(token) },
      'whatsapp challenge mismatch',
    );
    return reply.code(403).send({ error: 'forbidden' });
  });

  // POST — event delivery. Meta invia payload JSON firmato HMAC SHA-256.
  // Verifica signature obbligatoria. Se invalida, 401 e niente log del body.
  app.post('/webhooks/whatsapp', async (req, reply) => {
    const appSecret = process.env.META_APP_SECRET;
    const expectedWabaId = process.env.META_WABA_ID;
    const appId = process.env.META_APP_ID;

    if (!appSecret) {
      req.log.error({ event: 'wa.post.unconfigured' }, 'META_APP_SECRET not configured');
      return reply.code(500).send({ error: 'not_configured' });
    }

    if (!req.rawBody) {
      // Dovrebbe essere impossibile: il content-type parser sopra setta
      // sempre rawBody. Se manca, c'e' un bug di registrazione plugin.
      req.log.error(
        { event: 'wa.post.misconfigured' },
        'rawBody missing on whatsapp POST — content-type parser misconfigured',
      );
      return reply.code(500).send({ error: 'misconfigured' });
    }

    const headerVal = req.headers['x-hub-signature-256'];
    const signature = Array.isArray(headerVal) ? headerVal[0] : headerVal;
    if (!verifyMetaSignature(req.rawBody, signature, appSecret)) {
      req.log.warn(
        {
          event: 'wa.signature.fail',
          hasHeader: Boolean(signature),
          bodyBytes: req.rawBody.length,
        },
        'whatsapp signature mismatch',
      );
      return reply.code(401).send({ error: 'invalid_signature' });
    }

    req.log.debug(
      { event: 'wa.signature.ok', bodyBytes: req.rawBody.length },
      'whatsapp signature verified',
    );

    // Signature OK. Parse + persist.
    const parsed = whatsappWebhookPayloadSchema.safeParse(req.body);
    if (!parsed.success) {
      // Payload non riconosciuto. Ack 200 (Meta non riprova su 4xx
      // se webhook gia' verificato; vogliamo idempotenza) e log warn.
      req.log.warn(
        {
          event: 'wa.parse.fail',
          issues: parsed.error.issues.slice(0, 3).map((i) => ({
            path: i.path.join('.'),
            code: i.code,
          })),
        },
        'whatsapp payload schema mismatch',
      );
      return reply.code(200).send({ received: true, persisted: 0 });
    }

    // Cross-check WABA id se configurato. Mismatch e' suspect (qualcuno
    // ha registrato il webhook su una WABA diversa) ma non blocca: log warn.
    const incomingWabaIds = parsed.data.entry.map((e) => e.id);
    if (expectedWabaId && !incomingWabaIds.includes(expectedWabaId)) {
      req.log.warn(
        {
          event: 'wa.parse.waba_mismatch',
          expected: expectedWabaId,
          incoming: incomingWabaIds,
        },
        'whatsapp payload from unexpected WABA',
      );
    }

    // Slice 7B: status events outbound (sent/delivered/read/failed).
    // Parsiamo l'array "statuses" parallelo a "messages" e aggiorniamo
    // messages.deliveredAt/readAt/failedAt + pending_drafts.status='failed'
    // se applicabile. Idempotente: stesso evento puo' arrivare piu' volte.
    const statusEvents = parseStatusEvents(req.body);
    let statusUpdated = 0;
    let statusUnmatched = 0;
    for (const ev of statusEvents) {
      try {
        const result = await applyOutboundStatusUpdate(db, {
          wamid: ev.wamid,
          status: ev.status,
          timestamp: ev.timestamp,
          errorMessage: ev.errorMessage,
        });
        if (result.matched) {
          statusUpdated++;
          req.log.info(
            {
              event: 'wa.status.applied',
              wamid: ev.wamid,
              status: ev.status,
              messageId: result.messageId,
              draftId: result.draftId,
              applied: result.applied,
            },
            'whatsapp outbound status applied',
          );
        } else {
          statusUnmatched++;
          req.log.debug(
            { event: 'wa.status.unmatched', wamid: ev.wamid, status: ev.status },
            'whatsapp status per outbound non nostro (skip)',
          );
        }
      } catch (err) {
        req.log.error(
          { event: 'wa.status.error', err, wamid: ev.wamid, status: ev.status },
          'whatsapp status apply failed',
        );
      }
    }

    const flatMessages = extractInboundMessages(parsed.data);
    if (flatMessages.length === 0 && statusEvents.length === 0) {
      // Niente messages NE statuses: probabilmente system event. Ack.
      req.log.debug(
        { event: 'wa.parse.no_payload', appId, wabaIds: incomingWabaIds },
        'whatsapp webhook senza messages ne statuses (probabile system event)',
      );
      return reply.code(200).send({ received: true, persisted: 0, status_events: 0 });
    }
    if (flatMessages.length === 0) {
      // Solo statuses, gia' processati sopra.
      return reply.code(200).send({
        received: true,
        persisted: 0,
        status_events: statusEvents.length,
        status_updated: statusUpdated,
        status_unmatched: statusUnmatched,
      });
    }

    let inserted = 0;
    let duplicates = 0;
    let orphans = 0;
    let errors = 0;
    let drafts_enqueued = 0;
    for (const flat of flatMessages) {
      try {
        const result = await persistInboundMessage(db, flat);
        if (result.status === 'inserted') {
          inserted++;
          req.log.info(
            {
              event: 'wa.persist.inserted',
              messageId: flat.message.id,
              messageType: flat.message.type,
              bookingId: result.bookingId,
              conversationId: result.conversationId,
              phoneNumberId: flat.phoneNumberId,
            },
            'whatsapp inbound message persisted',
          );
          // Slice 7a.4 + Slice B: routing inbound.
          // Priorita':
          //  1. Se c'e' una survey attiva per questo booking → enqueue
          //     'process-inbound' su survey-queue (Sonnet 4.6 turn).
          //  2. Altrimenti → enqueue draft-generation (slice 7a.4 default).
          // L'idempotenza e' garantita lato consumer (jobId fissi).
          if (result.messageId && result.bookingId) {
            try {
              const activeSurvey = await findActiveSurvey(db, result.bookingId);
              if (activeSurvey) {
                await enqueueSurveyProcessInbound(result.bookingId, result.messageId);
                req.log.info(
                  {
                    event: 'wa.routing.survey',
                    messageId: result.messageId,
                    bookingId: result.bookingId,
                    quizId: activeSurvey.quizId,
                  },
                  'inbound routed to survey pipeline',
                );
              } else {
                await enqueueDraftGeneration(result.messageId);
                drafts_enqueued++;
              }
            } catch (enqueueErr) {
              req.log.error(
                {
                  event: 'wa.routing.error',
                  err: enqueueErr,
                  messageId: result.messageId,
                  bookingId: result.bookingId,
                },
                'inbound routing failed (message already persisted)',
              );
            }
          }
        } else if (result.status === 'duplicate_skipped') {
          duplicates++;
          req.log.info(
            { event: 'wa.persist.duplicate', messageId: flat.message.id },
            'whatsapp inbound message duplicate (idempotency hit)',
          );
        } else if (result.status === 'orphan_inserted') {
          orphans++;
          req.log.warn(
            {
              event: 'wa.persist.orphan',
              messageId: flat.message.id,
              fromMasked: maskPhone(flat.message.from),
              phoneNumberId: flat.phoneNumberId,
            },
            'whatsapp inbound senza booking match (orphan)',
          );
        }
      } catch (err) {
        errors++;
        // Log e continua: un messaggio fallito non deve bloccare gli altri
        // del batch. Meta riprovera' l'intero batch se torniamo 5xx, ma
        // qui preferiamo 200 + log perche' un retry duplicherebbe gli
        // altri messaggi gia' persistiti.
        req.log.error(
          { event: 'wa.persist.error', err, messageId: flat.message.id },
          'whatsapp persist failed for one message',
        );
      }
    }

    req.log.info(
      {
        event: 'wa.batch.done',
        inserted,
        duplicates,
        orphans,
        errors,
        drafts_enqueued,
        status_events: statusEvents.length,
        status_updated: statusUpdated,
        status_unmatched: statusUnmatched,
        total: flatMessages.length,
        appId,
      },
      'whatsapp webhook batch processed',
    );
    return reply.code(200).send({
      received: true,
      persisted: inserted,
      status_events: statusEvents.length,
    });
  });
};

// Maschera un numero E.164 (no '+') lasciando solo prefisso paese e ultime
// 2 cifre, per logging GDPR-safe degli orphan ("39******67"). Non usata
// per messaggi matchati a un booking (li loggiamo via bookingId).
export function maskPhone(e164noPlus: string): string {
  if (e164noPlus.length <= 4) return '***';
  const prefix = e164noPlus.slice(0, 2);
  const suffix = e164noPlus.slice(-2);
  const masked = '*'.repeat(Math.max(0, e164noPlus.length - 4));
  return `${prefix}${masked}${suffix}`;
}
