import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Database } from '@premura/db';
import { type WahaInboundMessage, parseWahaWebhook } from '@premura/integrations';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { enqueueDraftGeneration } from '../../jobs/draft-generation-queue';
import { maskPhone } from './whatsapp';
import type { FlatInboundMessage } from './whatsapp-payload';
import { persistInboundMessage } from './whatsapp-persist';

// Webhook inbound WAHA.
//
// Differenze rispetto al webhook Meta (./whatsapp.ts):
//  - un evento per POST, niente entry[].changes[] da appiattire
//  - nessun handshake GET con hub.challenge: WAHA non lo fa
//  - la firma e' HMAC-SHA512 della sola stringa del body, non
//    'sha256=' + HMAC come Meta
//
// Uguale invece tutto cio' che viene dopo il parsing: adattiamo il
// messaggio WAHA alla forma FlatInboundMessage e riusiamo
// persistInboundMessage. Duplicare quella logica significherebbe
// duplicare il match con la prenotazione, la dedup per platformMessageId
// e la creazione della conversazione — con la garanzia che le due copie
// divergano al primo fix applicato solo da una parte.

/** Header con cui WAHA firma il body quando config.webhooks[].hmac.key e' valorizzata. */
const HMAC_HEADER = 'x-webhook-hmac';
const HMAC_ALGO_HEADER = 'x-webhook-hmac-algorithm';

declare module 'fastify' {
  interface FastifyRequest {
    wahaRawBody?: Buffer;
  }
}

export type WahaWebhookPluginOptions = { db: Database };

/**
 * Verifica la firma HMAC del body.
 *
 * Ritorna true anche quando il segreto non e' configurato: in quel caso
 * la protezione e' l'URL non indovinabile del tunnel. E' una scelta
 * esplicita per non bloccare il pilot, ed e' loggata come warn a ogni
 * richiesta cosi' non passa inosservata.
 */
export function verifyWahaSignature(
  raw: Buffer,
  signature: string | undefined,
  algorithm: string | undefined,
  secret: string,
): boolean {
  if (!signature) return false;
  // WAHA dichiara l'algoritmo in un header separato. Default sha512.
  const algo = (algorithm ?? 'sha512').toLowerCase();
  if (!['sha256', 'sha512'].includes(algo)) return false;

  const expected = createHmac(algo, secret).update(raw).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signature.trim().toLowerCase(), 'utf8');
  // timingSafeEqual pretende lunghezze uguali: confrontarle prima non e'
  // una scorciatoia, e' l'unico modo di non farla sollevare.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Adatta un messaggio WAHA alla forma che persistInboundMessage conosce.
 *
 * wabaId e phoneNumberId non esistono in WAHA: al loro posto mettiamo il
 * nome della sessione, cosi' l'audit trail dice da quale numero e'
 * arrivato senza inventare un identificatore Meta che non esiste.
 */
export function toFlatInbound(msg: WahaInboundMessage): FlatInboundMessage {
  return {
    message: {
      from: msg.from,
      id: msg.messageId,
      timestamp: String(Math.floor(msg.timestamp.getTime() / 1000)),
      ...(msg.hasMedia
        ? { type: 'image' as const }
        : { type: 'text' as const, text: { body: msg.text ?? '' } }),
    },
    contactName: undefined,
    wabaId: `waha:${msg.session ?? 'default'}`,
    phoneNumberId: `waha:${msg.session ?? 'default'}`,
  };
}

export const wahaWebhookRoutes: FastifyPluginAsync<WahaWebhookPluginOptions> = async (
  app,
  opts,
) => {
  const { db } = opts;

  // Stesso pattern del webhook Meta: rawBody serve per l'HMAC, e
  // l'encapsulation Fastify tiene il parser custom dentro questo plugin.
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    (req: FastifyRequest, body: Buffer, done) => {
      req.wahaRawBody = body;
      if (body.length === 0) return done(null, {});
      try {
        done(null, JSON.parse(body.toString('utf8')));
      } catch (err) {
        done(err as Error, undefined);
      }
    },
  );

  app.post('/webhooks/waha', async (req, reply) => {
    const secret = process.env.WAHA_WEBHOOK_HMAC_SECRET;

    if (secret) {
      const sig = req.headers[HMAC_HEADER];
      const algo = req.headers[HMAC_ALGO_HEADER];
      const ok = verifyWahaSignature(
        req.wahaRawBody ?? Buffer.alloc(0),
        Array.isArray(sig) ? sig[0] : sig,
        Array.isArray(algo) ? algo[0] : algo,
        secret,
      );
      if (!ok) {
        req.log.warn({ event: 'waha.signature.fail' }, 'firma webhook WAHA non valida');
        return reply.code(401).send({ error: 'invalid_signature' });
      }
    } else {
      req.log.warn(
        { event: 'waha.signature.unconfigured' },
        'WAHA_WEBHOOK_HMAC_SECRET non impostato: il webhook accetta chiunque conosca l URL',
      );
    }

    const msg = parseWahaWebhook(req.body);
    if (!msg) {
      // Ack comunque: WAHA riprova sui non-2xx, e un payload che non
      // sappiamo leggere non migliora al secondo tentativo.
      req.log.debug({ event: 'waha.parse.skip' }, 'payload WAHA non riconosciuto');
      return reply.code(200).send({ received: true, persisted: 0 });
    }

    // I messaggi che abbiamo mandato noi tornano indietro su 'message.any'.
    // Non vanno persistiti come inbound: creerebbero un doppione outbound
    // e, peggio, farebbero rispondere l'agente a se stesso.
    if (msg.fromMe) {
      req.log.debug(
        { event: 'waha.skip.from_me', messageId: msg.messageId },
        'eco di un nostro invio',
      );
      return reply.code(200).send({ received: true, persisted: 0, reason: 'from_me' });
    }

    // Gli ack (message.ack) non sono messaggi: hanno il loro percorso e
    // qui non c'e' niente da persistire.
    if (msg.event === 'message.ack') {
      return reply.code(200).send({ received: true, persisted: 0, reason: 'ack' });
    }

    try {
      const result = await persistInboundMessage(db, toFlatInbound(msg));

      if (result.status === 'inserted' && result.messageId) {
        req.log.info(
          {
            event: 'waha.persist.inserted',
            messageId: msg.messageId,
            bookingId: result.bookingId,
            conversationId: result.conversationId,
          },
          'messaggio WAHA persistito',
        );
        try {
          await enqueueDraftGeneration(result.messageId);
        } catch (err) {
          // Il messaggio e' salvato: un enqueue fallito si recupera a
          // mano, non vale un 5xx che farebbe ritentare tutto il batch.
          req.log.error(
            { event: 'waha.draft.enqueue_error', err, messageId: result.messageId },
            'enqueue draft-generation fallito',
          );
        }
      } else if (result.status === 'orphan_inserted') {
        req.log.warn(
          { event: 'waha.persist.orphan', fromMasked: maskPhone(msg.from) },
          'messaggio WAHA senza prenotazione corrispondente',
        );
      }

      return reply.code(200).send({ received: true, persisted: 1, status: result.status });
    } catch (err) {
      req.log.error({ event: 'waha.persist.error', err }, 'persist messaggio WAHA fallito');
      return reply.code(200).send({ received: true, persisted: 0, error: true });
    }
  });
};
