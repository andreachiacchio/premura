import { z } from 'zod';

/**
 * Client WAHA (WhatsApp HTTP API self-hosted).
 *
 * WAHA gira sul Beelink di casa e pilota il numero reale della struttura
 * via WhatsApp Web. Nessuna finestra 24h, nessun template da far approvare:
 * si scrive per primi. In cambio serve una sessione agganciata a un
 * telefono, quindi vale per il pilot interno e non per gli host terzi.
 *
 * IMPORTANTE: nessuno deve importare questo file direttamente. L'unica
 * porta e' whatsapp-transport.ts. Vedi il commento in testa a quel file.
 *
 * Riferimenti verificati sui DTO del repo devlikeapro/waha (branch core):
 *  - src/api/chatting.controller.ts     -> POST /api/sendText, /api/sendImage,
 *                                          GET  /api/checkNumberStatus
 *  - src/structures/chatting.dto.ts     -> MessageTextRequest, MessageImageRequest
 *  - src/structures/base.dto.ts         -> SessionBaseRequest.session
 *  - src/structures/webhooks.config.dto.ts -> WebhookConfig
 */

const DEFAULT_SESSION = 'default';

export class WahaSendError extends Error {
  readonly status: number;
  readonly body: string;
  readonly retryable: boolean;

  constructor(status: number, body: string) {
    super(`WAHA send failed ${status}: ${body.slice(0, 500)}`);
    this.name = 'WahaSendError';
    this.status = status;
    this.body = body;
    // Stessa politica di WhatsappSendError: 4xx permanente, 5xx e 429
    // transienti. In piu' il 502/504: WAHA sta dietro Cloudflare Tunnel e
    // un tunnel che si riconnette produce esattamente quelli.
    this.retryable = status >= 500 || status === 429;
  }
}

function getConfig(): { baseUrl: string; apiKey: string; session: string } {
  // Lettura a ogni chiamata e non al module load: i test usano vi.stubEnv
  // e il worker legge i secret Fly dopo l'import. Stesso motivo per cui
  // whatsapp-business.ts fa lazy-read.
  const baseUrl = process.env.WAHA_URL?.trim();
  const apiKey = process.env.WAHA_API_KEY?.trim();
  if (!baseUrl || !apiKey) {
    throw new Error('WAHA non configurato: mancano WAHA_URL o WAHA_API_KEY');
  }
  return {
    baseUrl: baseUrl.replace(/\/+$/, ''),
    apiKey,
    session: process.env.WAHA_SESSION?.trim() || DEFAULT_SESSION,
  };
}

/**
 * Da numero E.164 a chatId WAHA: '+39 351 451 2070' -> '393514512070@c.us'.
 *
 * WhatsApp vuole il numero internazionale senza '+' e senza separatori,
 * con il suffisso '@c.us' per le chat individuali (i gruppi usano '@g.us',
 * che qui non ci serve). Un numero gia' in forma di chatId viene lasciato
 * stare: capita di ricevere il 'from' di un webhook e rimandarlo indietro.
 */
export function toChatId(raw: string): string {
  if (raw.endsWith('@c.us') || raw.endsWith('@s.whatsapp.net')) return raw;
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 8) {
    throw new Error(`Numero non valido per WhatsApp: "${raw}" (${digits.length} cifre)`);
  }
  return `${digits}@c.us`;
}

// La risposta di sendText/sendImage e' un WAMessage. A noi interessa solo
// l'id, ma passthrough() perche' WAHA aggiunge campi tra le versioni e non
// vogliamo che un campo nuovo faccia fallire il parse di un invio riuscito.
const wahaMessageSchema = z.object({ id: z.string() }).passthrough();

async function wahaPost<T>(path: string, payload: unknown, parse: (j: unknown) => T): Promise<T> {
  const { baseUrl, apiKey } = getConfig();

  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'X-Api-Key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new WahaSendError(res.status, await res.text());
  }
  return parse(await res.json());
}

export async function sendTextViaWaha(to: string, body: string): Promise<{ messageId: string }> {
  const { session } = getConfig();
  const msg = await wahaPost(
    '/api/sendText',
    {
      session,
      chatId: toChatId(to),
      text: body,
      // I link alla guest app non devono generare anteprima: l'anteprima
      // di un dominio sconosciuto in un messaggio che finge di venire
      // dall'host peggiora la percezione, e su alcuni client rompe il
      // layout del messaggio.
      linkPreview: false,
    },
    (j) => wahaMessageSchema.parse(j),
  );
  return { messageId: msg.id };
}

export async function sendImageViaWaha(params: {
  to: string;
  imageUrl: string;
  caption?: string;
}): Promise<{ messageId: string }> {
  const { session } = getConfig();
  const msg = await wahaPost(
    '/api/sendImage',
    {
      session,
      chatId: toChatId(params.to),
      // MessageImageRequest estende FileRequest: il file e' un oggetto,
      // non una stringa. Con { url } WAHA scarica lui l'immagine.
      file: { url: params.imageUrl },
      ...(params.caption ? { caption: params.caption } : {}),
    },
    (j) => wahaMessageSchema.parse(j),
  );
  return { messageId: msg.id };
}

const numberStatusSchema = z
  .object({ numberExists: z.boolean(), chatId: z.string().optional() })
  .passthrough();

/**
 * Verifica preventiva che il numero esista su WhatsApp.
 *
 * Serve a non bruciare uno slot di invio (e a non insospettire WhatsApp)
 * su un numero che non ha l'app. L'esito finisce in
 * outbound_sends.phone_on_whatsapp.
 *
 * Ritorna null se la verifica stessa fallisce: un errore del check non
 * deve bloccare l'invio, e distinguere "non su WhatsApp" da "non l'ho
 * potuto sapere" e' esattamente il punto (nel DB la colonna e' nullable).
 */
export async function checkNumberOnWhatsapp(phone: string): Promise<boolean | null> {
  const { baseUrl, apiKey, session } = getConfig();
  const digits = phone.replace(/\D/g, '');
  const url = `${baseUrl}/api/checkNumberStatus?phone=${encodeURIComponent(digits)}&session=${encodeURIComponent(session)}`;

  try {
    const res = await fetch(url, { headers: { 'X-Api-Key': apiKey } });
    if (!res.ok) return null;
    return numberStatusSchema.parse(await res.json()).numberExists;
  } catch {
    return null;
  }
}

// ─── Webhook inbound ────────────────────────────────────────────────
//
// WAHA manda un POST per ogni evento configurato in
// config.webhooks[].events. La forma dell'inviluppo e' la stessa per tutti
// gli eventi: {event, session, payload, ...}. Il payload di 'message' e'
// un WAMessage (src/structures/responses.dto.ts).
//
// Niente a che vedere con Meta: nessun array entry[].changes[], nessun
// hub.challenge da rimbalzare. Un evento, un POST.

const wahaWebhookSchema = z
  .object({
    event: z.string(),
    session: z.string().optional(),
    payload: z
      .object({
        id: z.string(),
        timestamp: z.number().optional(),
        from: z.string(),
        to: z.string().optional(),
        fromMe: z.boolean().optional(),
        body: z.string().optional(),
        hasMedia: z.boolean().optional(),
        // Presente sugli eventi message.ack.
        ack: z.number().optional(),
        ackName: z.string().optional(),
        media: z.object({ url: z.string().optional() }).passthrough().optional(),
      })
      .passthrough(),
  })
  .passthrough();

export type WahaInboundMessage = {
  event: string;
  session: string | null;
  messageId: string;
  /** Numero mittente in cifre, senza '@c.us'. Allineato al formato Meta. */
  from: string;
  fromMe: boolean;
  timestamp: Date;
  text: string | null;
  hasMedia: boolean;
  mediaUrl: string | null;
  ack: number | null;
};

/** Estrae il numero da un chatId WAHA: '393514512070@c.us' -> '393514512070'. */
export function chatIdToPhone(chatId: string): string {
  return chatId.split('@')[0] ?? chatId;
}

export function parseWahaWebhook(payload: unknown): WahaInboundMessage | null {
  const parsed = wahaWebhookSchema.safeParse(payload);
  if (!parsed.success) return null;

  const { event, session, payload: p } = parsed.data;
  return {
    event,
    session: session ?? null,
    messageId: p.id,
    from: chatIdToPhone(p.from),
    fromMe: p.fromMe ?? false,
    // WAHA usa secondi epoch come Meta. Se manca, il momento di arrivo e'
    // l'approssimazione migliore che abbiamo.
    timestamp: p.timestamp ? new Date(p.timestamp * 1000) : new Date(),
    text: p.body ?? null,
    hasMedia: p.hasMedia ?? false,
    mediaUrl: p.media?.url ?? null,
    ack: p.ack ?? null,
  };
}
