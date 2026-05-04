import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { verifyMetaSignature } from './whatsapp-signature';

// Webhook WhatsApp Cloud API per messaggi inbound (slice 7a.1, opzione I).
//
// Pipeline 1 step 1: ricezione raw + verifica signature + ack 200.
// La persistenza in conversations + messages arriva nei commit successivi
// di slice 7a.1 (lookup booking via guestPhone, dedup platformMessageId).
//
// Setup Meta: vedi docs/SLICE7A-WHATSAPP-SETUP.md.
//
// Env vars richiesti:
//   - WHATSAPP_APP_SECRET           -> firma HMAC del body
//   - WHATSAPP_WEBHOOK_VERIFY_TOKEN -> challenge handshake (GET)
//
// Encapsulation Fastify: il content-type parser custom (raw body buffer)
// vive solo dentro questo plugin scope. Il resto dell'app continua a usare
// il JSON parser default.

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

export const whatsappWebhookRoutes: FastifyPluginAsync = async (app) => {
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
    const expectedToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
    if (!expectedToken) {
      req.log.error('WHATSAPP_WEBHOOK_VERIFY_TOKEN not configured');
      return reply.code(500).send({ error: 'not_configured' });
    }

    const parsed = challengeQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_query' });
    }
    const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = parsed.data;

    if (mode === 'subscribe' && token === expectedToken && challenge) {
      return reply.code(200).type('text/plain').send(challenge);
    }
    req.log.warn({ mode, hasToken: Boolean(token) }, 'whatsapp challenge mismatch');
    return reply.code(403).send({ error: 'forbidden' });
  });

  // POST — event delivery. Meta invia payload JSON firmato HMAC SHA-256.
  // Verifica signature obbligatoria. Se invalida, 401 e niente log del body.
  app.post('/webhooks/whatsapp', async (req, reply) => {
    const appSecret = process.env.WHATSAPP_APP_SECRET;
    if (!appSecret) {
      req.log.error('WHATSAPP_APP_SECRET not configured');
      return reply.code(500).send({ error: 'not_configured' });
    }

    if (!req.rawBody) {
      // Dovrebbe essere impossibile: il content-type parser sopra setta
      // sempre rawBody. Se manca, c'e' un bug di registrazione plugin.
      req.log.error('rawBody missing on whatsapp POST — content-type parser misconfigured');
      return reply.code(500).send({ error: 'misconfigured' });
    }

    const headerVal = req.headers['x-hub-signature-256'];
    const signature = Array.isArray(headerVal) ? headerVal[0] : headerVal;
    if (!verifyMetaSignature(req.rawBody, signature, appSecret)) {
      req.log.warn({ hasHeader: Boolean(signature) }, 'whatsapp signature mismatch');
      return reply.code(401).send({ error: 'invalid_signature' });
    }

    // Signature OK. Per ora ack 200 + log "received". Persistenza dei
    // messaggi in DB arriva nei commit successivi di slice 7a.1.
    const body = req.body as Record<string, unknown> | undefined;
    req.log.info(
      { object: body?.object, entryCount: Array.isArray(body?.entry) ? body.entry.length : 0 },
      'whatsapp webhook event received (signature OK, persistence pending)',
    );
    return reply.code(200).send({ received: true });
  });
};
