import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Database } from '@premura/db';
import {
  type WahaInboundMessage,
  parseWahaWebhook,
  resolveLidToPhone,
} from '@premura/integrations';
import type { FastifyBaseLogger, FastifyPluginAsync, FastifyRequest } from 'fastify';
import { enqueueDraftOrMarkFailed } from '../../jobs/draft-enqueue';
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

/**
 * Il mittente da usare per l'attribuzione: il numero, se si conosce.
 *
 * Quando WhatsApp manda solo il LID e il payload non porta il numero, lo
 * si chiede a WAHA. Se nemmeno WAHA lo sa, il messaggio si salva lo
 * stesso con il LID come mittente (conversazione non attribuita) e lo si
 * dice a WARN: mai bloccare l'inbound per questo.
 */
export async function resolveSender(
  msg: WahaInboundMessage,
  log: Pick<FastifyBaseLogger, 'info' | 'warn'>,
): Promise<string> {
  if (!msg.senderLid || msg.from !== msg.senderLid) return msg.from;

  const phone = await resolveLidToPhone(msg.senderLid, msg.session);
  if (phone) {
    log.info({ event: 'waha.lid.resolved', messageId: msg.messageId }, 'lid risolto');
    return phone;
  }
  log.warn(
    { event: 'waha.lid.unresolved', messageId: msg.messageId, lidMasked: maskPhone(msg.senderLid) },
    'lid non risolto: messaggio salvato senza attribuzione',
  );
  return msg.senderLid;
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

    const parsed = parseWahaWebhook(req.body);

    // Gruppi, stati, canali, eventi che non sono messaggi: non ci
    // riguardano, e lo si dice a debug col motivo.
    if (parsed.kind === 'ignored') {
      req.log.debug({ event: 'waha.skip', reason: parsed.reason }, 'evento WAHA ignorato');
      return reply.code(200).send({ received: true, persisted: 0, reason: parsed.reason });
    }

    // Un payload che non sappiamo leggere e' un messaggio perso: a WARN,
    // con cosa non andava (26/10: media null scartava ogni messaggio a
    // livello debug, cioe' in silenzio). Chiavi del payload e problemi
    // Zod, mai i valori: il testo dell'ospite non finisce nei log.
    // Resta 200: WAHA riprova sui non-2xx, e lo stesso payload non
    // migliora al secondo tentativo.
    if (parsed.kind === 'invalid') {
      req.log.warn(
        {
          event: 'waha.parse.invalid',
          wahaEvent: parsed.event,
          payloadKeys: parsed.payloadKeys,
          issues: parsed.issues,
        },
        'payload WAHA non letto: messaggio NON salvato',
      );
      return reply.code(200).send({ received: true, persisted: 0, error: 'invalid_payload' });
    }

    const msg = parsed.message;

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

    try {
      const sender = await resolveSender(msg, req.log);
      const result = await persistInboundMessage(db, toFlatInbound({ ...msg, from: sender }));

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
        // Il messaggio e' salvato: un enqueue fallito non vale un 5xx che
        // farebbe ritentare tutto. Ma non resta muto (R2): un secondo
        // tentativo subito, poi lo stato scritto sul messaggio.
        const enqueued = await enqueueDraftOrMarkFailed(
          db,
          result.messageId,
          enqueueDraftGeneration,
        );
        if (enqueued.status === 'failed') {
          req.log.error(
            {
              event: 'waha.draft.enqueue_error',
              err: enqueued.error,
              messageId: result.messageId,
              marked: enqueued.marked,
            },
            enqueued.marked
              ? 'enqueue draft-generation fallito due volte: segnato sul messaggio'
              : 'enqueue draft-generation fallito due volte e segno NON scritto sul messaggio',
          );
        }
      } else if (result.status === 'orphan_inserted') {
        req.log.warn(
          { event: 'waha.persist.orphan', fromMasked: maskPhone(sender) },
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
