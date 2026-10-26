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
//
// BUG 30/07 (invito Julian, slot failed con "expected string received
// object, path: [id]"): con l'engine WEBJS l'id NON e' una stringa ma
// l'oggetto MessageID di whatsapp-web.js:
//   { fromMe, remote, id: "3EB0...", _serialized: "true_39...@c.us_3EB0..." }
// L'HTTP era gia' 200: il messaggio ERA PARTITO, e il parse della
// risposta lo marcava failed — un audit bugiardo su un invio riuscito.
// Accettiamo entrambe le forme e normalizziamo a stringa.
const wahaMessageIdSchema = z.union([
  z.string(),
  z
    .object({ _serialized: z.string().optional(), id: z.string().optional() })
    .passthrough(),
]);
const wahaMessageSchema = z.object({ id: wahaMessageIdSchema }).passthrough();

export function extractWahaMessageId(id: z.infer<typeof wahaMessageIdSchema>): string {
  if (typeof id === 'string') return id;
  return id._serialized ?? id.id ?? 'waha-unknown-id';
}

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
  return { messageId: extractWahaMessageId(msg.id) };
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
  return { messageId: extractWahaMessageId(msg.id) };
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
//
// 26/10, prova reale (WEBJS, immagine 2026-10-02): il messaggio arrivava
// e veniva scartato in silenzio. WAHA manda null — non "assente" — per i
// campi che non hanno valore (media: null, location: null), e .optional()
// non accetta null. Ogni campo facoltativo qui e' quindi .nullish().

/** Gli unici eventi che portano un messaggio dell'ospite. */
const MESSAGE_EVENTS = new Set(['message', 'message.any']);

/** Chat che non sono un ospite: gruppi, stati, canali. */
const IGNORED_CHAT_SUFFIXES = ['@g.us', '@newsletter'];
const STATUS_BROADCAST = 'status@broadcast';

const wahaWebhookSchema = z
  .object({
    event: z.string(),
    session: z.string().nullish(),
    payload: z
      .object({
        id: z.string(),
        timestamp: z.number().nullish(),
        from: z.string(),
        to: z.string().nullish(),
        fromMe: z.boolean().nullish(),
        body: z.string().nullish(),
        hasMedia: z.boolean().nullish(),
        ack: z.number().nullish(),
        media: z.object({ url: z.string().nullish() }).passthrough().nullish(),
      })
      // Tutto cio' che non leggiamo (location, vCards, _data...) passa
      // com'e': dichiararlo vorrebbe dire solo un modo in piu' di fallire.
      .passthrough(),
  })
  .passthrough();

export type WahaInboundMessage = {
  event: string;
  session: string | null;
  messageId: string;
  /**
   * Mittente: il numero in cifre senza '@c.us' (allineato al formato
   * Meta) quando e' noto. Se WhatsApp manda solo un LID e il payload non
   * porta il numero, resta il LID intero ('163505126793314@lid'): non
   * sembra un telefono e non puo' agganciare una prenotazione per errore.
   */
  from: string;
  /** LID del mittente quando WhatsApp nasconde il numero, altrimenti null. */
  senderLid: string | null;
  fromMe: boolean;
  timestamp: Date;
  text: string | null;
  hasMedia: boolean;
  mediaUrl: string | null;
  ack: number | null;
};

/**
 * Esito del parsing. Un payload non letto NON e' null (R2, 26/10): era
 * cosi' che un messaggio vero spariva a livello debug. Il chiamante deve
 * distinguere "non ci riguarda" da "non lo so leggere", e il secondo
 * porta con se' cosa non andava.
 */
export type WahaWebhookParse =
  | { kind: 'message'; message: WahaInboundMessage }
  | { kind: 'ignored'; reason: string }
  | { kind: 'invalid'; event: string | null; payloadKeys: string[]; issues: string[] };

/** Estrae il numero da un chatId WAHA: '393514512070@c.us' -> '393514512070'. */
export function chatIdToPhone(chatId: string): string {
  return chatId.split('@')[0] ?? chatId;
}

function isLid(chatId: string): boolean {
  return chatId.endsWith('@lid');
}

function isPhoneJid(value: unknown): value is string {
  return (
    typeof value === 'string' && (value.endsWith('@c.us') || value.endsWith('@s.whatsapp.net'))
  );
}

/** Un Wid di whatsapp-web.js arriva come stringa o come { _serialized }. */
function widToString(value: unknown): unknown {
  if (value && typeof value === 'object' && '_serialized' in value) {
    return (value as { _serialized: unknown })._serialized;
  }
  return value;
}

/**
 * Il numero del mittente, se il payload lo porta gia' accanto al LID.
 * Si guardano SOLO campi del mittente (mai 'to', che e' il numero della
 * struttura) e si accetta solo un chatId da telefono.
 */
function phoneFromPayload(p: Record<string, unknown>): string | null {
  const data = (p._data ?? {}) as Record<string, unknown>;
  const key = (data.key ?? {}) as Record<string, unknown>;
  const candidates = [
    p.pn,
    p.author,
    data.pn,
    data.senderPn,
    data.author,
    data.from,
    key.senderPn,
    key.participantPn,
  ].map(widToString);
  const found = candidates.find(isPhoneJid);
  return found ? chatIdToPhone(found) : null;
}

function ignoredChat(chatId: string | null | undefined): boolean {
  if (!chatId) return false;
  return chatId === STATUS_BROADCAST || IGNORED_CHAT_SUFFIXES.some((s) => chatId.endsWith(s));
}

export function parseWahaWebhook(payload: unknown): WahaWebhookParse {
  const raw = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>;
  const rawEvent = typeof raw.event === 'string' ? raw.event : null;
  const rawPayload = raw.payload && typeof raw.payload === 'object' ? raw.payload : {};
  const payloadKeys = Object.keys(rawPayload);

  // Il filtro sull'evento viene PRIMA dello schema: session.status o
  // presence.update non hanno id e from, e non sono payload "rotti".
  if (rawEvent && !MESSAGE_EVENTS.has(rawEvent)) {
    return { kind: 'ignored', reason: `evento ${rawEvent}` };
  }

  const parsed = wahaWebhookSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      kind: 'invalid',
      event: rawEvent,
      payloadKeys,
      issues: parsed.error.issues.map((i) => `${i.path.join('.') || '(radice)'}: ${i.message}`),
    };
  }

  const { event, session, payload: p } = parsed.data;
  if (ignoredChat(p.from) || ignoredChat(p.to)) {
    return {
      kind: 'ignored',
      reason: `chat ${p.from === STATUS_BROADCAST ? 'stati' : 'non individuale'}`,
    };
  }

  const senderLid = isLid(p.from) ? p.from : null;
  const from = senderLid ? (phoneFromPayload(p) ?? senderLid) : chatIdToPhone(p.from);

  return {
    kind: 'message',
    message: {
      event,
      session: session ?? null,
      messageId: p.id,
      from,
      senderLid,
      fromMe: p.fromMe ?? false,
      // WAHA usa secondi epoch come Meta. Se manca, il momento di arrivo e'
      // l'approssimazione migliore che abbiamo.
      timestamp: p.timestamp ? new Date(p.timestamp * 1000) : new Date(),
      text: p.body ?? null,
      hasMedia: p.hasMedia ?? false,
      mediaUrl: p.media?.url ?? null,
      ack: p.ack ?? null,
    },
  };
}

// ─── LID -> numero ──────────────────────────────────────────────────
//
// Con i LID WhatsApp nasconde il numero del mittente: '163505126793314@lid'
// invece di '393383963307@c.us'. Senza il numero non si aggancia nessuna
// prenotazione, quindi si chiede a WAHA: GET /api/{session}/lids/{lid}
// risponde { lid, pn }. Il legame non cambia: si tiene in memoria per
// sessione, cosi' ogni messaggio successivo non paga la chiamata.

const LID_LOOKUP_TIMEOUT_MS = 3_000;
const lidCache = new Map<string, string>();

const lidLookupSchema = z.object({ pn: z.string().nullish() }).passthrough();

/**
 * Numero (cifre, senza '@c.us') dietro un LID, o null se WAHA non lo sa
 * o non risponde. Non lancia MAI: un LID non risolto non deve fermare
 * l'inbound, il messaggio si salva comunque.
 */
export async function resolveLidToPhone(
  lid: string,
  session?: string | null,
): Promise<string | null> {
  try {
    const config = getConfig();
    const sessionName = session || config.session;
    const cacheKey = `${sessionName}:${lid}`;
    const cached = lidCache.get(cacheKey);
    if (cached) return cached;

    const url = `${config.baseUrl}/api/${encodeURIComponent(sessionName)}/lids/${encodeURIComponent(lid)}`;
    const res = await fetch(url, {
      headers: { 'X-Api-Key': config.apiKey },
      signal: AbortSignal.timeout(LID_LOOKUP_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const { pn } = lidLookupSchema.parse(await res.json());
    if (!isPhoneJid(pn)) return null;

    const phone = chatIdToPhone(pn);
    lidCache.set(cacheKey, phone);
    return phone;
  } catch {
    return null;
  }
}

/** Solo per i test: la cache vive quanto il processo. */
export function clearLidCache(): void {
  lidCache.clear();
}
