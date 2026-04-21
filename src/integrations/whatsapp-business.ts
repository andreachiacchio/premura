import { z } from 'zod';

/**
 * WhatsApp Business Cloud API wrapper.
 *
 * Used for two flows:
 *  1. Cleaner briefing (outbound template + free-form in 24h window)
 *  2. Guest messaging fallback (when Booking/Airbnb messaging is too slow)
 *
 * Docs: https://developers.facebook.com/docs/whatsapp/cloud-api
 */

const API_VERSION = 'v21.0';
const BASE_URL = `https://graph.facebook.com/${API_VERSION}`;

const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

function assertConfig(): void {
  if (!phoneNumberId || !accessToken) {
    throw new Error('WhatsApp not configured: missing env vars');
  }
}

// ===== SEND TEXT MESSAGE (free-form, requires active 24h window) =====

export async function sendText(to: string, body: string): Promise<{ messageId: string }> {
  assertConfig();

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
    throw new Error(`WhatsApp send failed ${res.status}: ${err}`);
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
  assertConfig();

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

export async function downloadMedia(mediaId: string): Promise<{ buffer: Buffer; mimeType: string }> {
  assertConfig();

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

// ===== HELPERS =====

function normalizePhone(raw: string): string {
  // Strip non-digits. WhatsApp expects full international format without + or spaces.
  return raw.replace(/\D/g, '');
}
