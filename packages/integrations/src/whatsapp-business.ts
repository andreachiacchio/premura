import { z } from 'zod';

/**
 * WhatsApp Business Cloud API wrapper.
 *
 * Used for two flows:
 *  1. Cleaner briefing (outbound template + free-form in 24h window)
 *  2. Guest messaging (slice 7B): host approva draft → manda al guest
 *
 * Slice 7B: env vars rinominate da WHATSAPP_* a META_* per coerenza
 * con le secrets su Fly e con le label del Meta Developer Portal.
 * Bumped da v21.0 a v25.0 (latest stable di maggio 2026, supporta
 * status events + media uploads). Phone normalize unchanged.
 *
 * Docs: https://developers.facebook.com/docs/whatsapp/cloud-api
 */

const API_VERSION = 'v25.0';
const BASE_URL = `https://graph.facebook.com/${API_VERSION}`;

function getEnv(): { phoneNumberId: string; accessToken: string } {
  // Lazy-read: i process.env vengono popolati dopo l'import in alcuni
  // contesti test (vi.stubEnv). Read-time lookup invece di module-load.
  // Fallback ai vecchi WHATSAPP_* per compat durante migrazione.
  const phoneNumberId = process.env.META_PHONE_NUMBER_ID ?? process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.META_ACCESS_TOKEN ?? process.env.WHATSAPP_ACCESS_TOKEN;
  if (!phoneNumberId || !accessToken) {
    throw new Error('WhatsApp not configured: missing META_PHONE_NUMBER_ID or META_ACCESS_TOKEN');
  }
  return { phoneNumberId, accessToken };
}

// Errore strutturato per distinguere 4xx (permanente, no retry) da 5xx
// (transiente, retry). Il caller (approveAndSendReplyDraft) usa lo
// status per decidere se enqueue retry o segnare 'failed' subito.
export class WhatsappSendError extends Error {
  readonly status: number;
  readonly body: string;
  readonly retryable: boolean;

  constructor(status: number, body: string) {
    super(`WhatsApp send failed ${status}: ${body.slice(0, 500)}`);
    this.name = 'WhatsappSendError';
    this.status = status;
    this.body = body;
    // 4xx = permanente (auth, payload invalido, recipient invalid).
    // 5xx + 429 = transiente, retry.
    this.retryable = status >= 500 || status === 429;
  }
}

// ===== SEND TEXT MESSAGE (free-form, requires active 24h window) =====

export async function sendText(to: string, body: string): Promise<{ messageId: string }> {
  const { phoneNumberId, accessToken } = getEnv();

  const res = await fetch(`${BASE_URL}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: normalizePhone(to),
      type: 'text',
      text: { body },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new WhatsappSendError(res.status, err);
  }

  const json = (await res.json()) as { messages: [{ id: string }] };
  return { messageId: json.messages[0].id };
}

// ===== SEND TEMPLATE (approved template, can initiate new conversation) =====

export async function sendTemplate(params: {
  to: string;
  templateName: string;
  languageCode: string;
  variables: string[];
}): Promise<{ messageId: string }> {
  const { phoneNumberId, accessToken } = getEnv();

  const res = await fetch(`${BASE_URL}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: normalizePhone(params.to),
      type: 'template',
      template: {
        name: params.templateName,
        language: { code: params.languageCode },
        components: params.variables.length
          ? [
              {
                type: 'body',
                parameters: params.variables.map((v) => ({ type: 'text', text: v })),
              },
            ]
          : [],
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`WhatsApp template failed ${res.status}: ${err}`);
  }

  const json = (await res.json()) as { messages: [{ id: string }] };
  return { messageId: json.messages[0].id };
}

// ===== WEBHOOK INBOUND MESSAGE =====
// Parses incoming messages from cleaners (OK confirmations, photos).

const inboundMessageSchema = z.object({
  entry: z.array(
    z.object({
      changes: z.array(
        z.object({
          value: z.object({
            messages: z
              .array(
                z.object({
                  from: z.string(),
                  id: z.string(),
                  timestamp: z.string(),
                  type: z.string(),
                  text: z.object({ body: z.string() }).optional(),
                  image: z
                    .object({
                      id: z.string(),
                      mime_type: z.string(),
                      sha256: z.string(),
                    })
                    .optional(),
                }),
              )
              .optional(),
          }),
        }),
      ),
    }),
  ),
});

export type InboundMessage = {
  from: string;
  messageId: string;
  timestamp: Date;
  type: 'text' | 'image' | 'other';
  text?: string;
  imageMediaId?: string;
};

export function parseInboundWebhook(payload: unknown): InboundMessage[] {
  const parsed = inboundMessageSchema.safeParse(payload);
  if (!parsed.success) return [];

  const messages: InboundMessage[] = [];
  for (const entry of parsed.data.entry) {
    for (const change of entry.changes) {
      for (const msg of change.value.messages ?? []) {
        messages.push({
          from: msg.from,
          messageId: msg.id,
          timestamp: new Date(Number(msg.timestamp) * 1000),
          type: msg.type === 'text' ? 'text' : msg.type === 'image' ? 'image' : 'other',
          text: msg.text?.body,
          imageMediaId: msg.image?.id,
        });
      }
    }
  }
  return messages;
}

// ===== DOWNLOAD MEDIA (cleaner photos) =====

export async function downloadMedia(
  mediaId: string,
): Promise<{ buffer: Buffer; mimeType: string }> {
  const { accessToken } = getEnv();

  // Step 1: get media URL
  const urlRes = await fetch(`${BASE_URL}/${mediaId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!urlRes.ok) throw new Error(`WhatsApp media URL fetch failed: ${urlRes.status}`);
  const urlData = (await urlRes.json()) as { url: string; mime_type: string };

  // Step 2: download binary
  const mediaRes = await fetch(urlData.url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!mediaRes.ok) throw new Error(`WhatsApp media download failed: ${mediaRes.status}`);

  return {
    buffer: Buffer.from(await mediaRes.arrayBuffer()),
    mimeType: urlData.mime_type,
  };
}

// ===== STATUS WEBHOOK PARSER (slice 7B) =====
//
// Meta invia status events ("statuses" payload) per ogni outbound message:
// sent → delivered → read (o failed). Il webhook /webhooks/whatsapp gia'
// esistente filtra i payload per "messages" (inbound). Qui parsiamo
// l'array "statuses" parallelo.

const statusEventSchema = z
  .object({
    id: z.string(), // wamid del messaggio outbound (= meta_message_id su pending_drafts)
    status: z.enum(['sent', 'delivered', 'read', 'failed']),
    timestamp: z.string(), // unix epoch seconds
    recipient_id: z.string().optional(),
    errors: z
      .array(
        z
          .object({
            code: z.number().optional(),
            title: z.string().optional(),
            message: z.string().optional(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();

const statusesPayloadSchema = z
  .object({
    entry: z.array(
      z
        .object({
          id: z.string(),
          changes: z.array(
            z
              .object({
                field: z.literal('messages'),
                value: z
                  .object({
                    statuses: z.array(statusEventSchema).optional(),
                  })
                  .passthrough(),
              })
              .passthrough(),
          ),
        })
        .passthrough(),
    ),
  })
  .passthrough();

export type WhatsappStatusEvent = {
  wamid: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: Date;
  recipient: string | null;
  errorMessage: string | null;
};

export function parseStatusEvents(payload: unknown): WhatsappStatusEvent[] {
  const parsed = statusesPayloadSchema.safeParse(payload);
  if (!parsed.success) return [];
  const out: WhatsappStatusEvent[] = [];
  for (const entry of parsed.data.entry) {
    for (const change of entry.changes) {
      const statuses = change.value.statuses ?? [];
      for (const s of statuses) {
        const errMsg = s.errors?.[0]?.message ?? s.errors?.[0]?.title ?? null;
        out.push({
          wamid: s.id,
          status: s.status,
          timestamp: new Date(Number(s.timestamp) * 1000),
          recipient: s.recipient_id ?? null,
          errorMessage: errMsg,
        });
      }
    }
  }
  return out;
}

// ===== HELPERS =====

function normalizePhone(raw: string): string {
  // Strip non-digits. WhatsApp expects full international format without + or spaces.
  return raw.replace(/\D/g, '');
}
