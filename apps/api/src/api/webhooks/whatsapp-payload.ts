import { z } from 'zod';

// Schema Zod del payload webhook WhatsApp Cloud API per messaggi inbound.
// Riferimento: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/payload-examples
//
// Coverage in slice 7a.1:
//   - text messages (la stragrande maggioranza per Premura)
//   - status events (delivered, read) ignorati: niente persistenza, niente errore
//   - tipi non-text (image, audio, document, sticker, location, contacts):
//     persistenza body con placeholder + metadata.media_type, no media download
//     in V1 (rimandato a slice futuro se richiesto)
//
// Lo schema e' "permissivo": campi sconosciuti vengono ignorati invece di
// fail. Meta puo' aggiungere campi nuovi senza notice e non vogliamo che
// il webhook risponda 400 a payload validi nuovi.

const textMessageSchema = z
  .object({
    from: z.string(), // E.164 senza '+', es. "393331234567"
    id: z.string(), // wamid.HBgM... globally unique
    timestamp: z.string(), // unix epoch seconds (string!)
    type: z.literal('text'),
    text: z.object({ body: z.string() }),
  })
  .passthrough();

const mediaMessageSchema = z
  .object({
    from: z.string(),
    id: z.string(),
    timestamp: z.string(),
    type: z.enum(['image', 'audio', 'video', 'document', 'sticker', 'location', 'contacts']),
  })
  .passthrough();

export const inboundMessageSchema = z.union([textMessageSchema, mediaMessageSchema]);
export type InboundMessage = z.infer<typeof inboundMessageSchema>;

const contactSchema = z
  .object({
    profile: z.object({ name: z.string().optional() }).optional(),
    wa_id: z.string(),
  })
  .passthrough();

const messagesValueSchema = z
  .object({
    messaging_product: z.literal('whatsapp'),
    metadata: z.object({
      display_phone_number: z.string(),
      phone_number_id: z.string(),
    }),
    contacts: z.array(contactSchema).optional(),
    messages: z.array(inboundMessageSchema).optional(),
    statuses: z.array(z.unknown()).optional(),
  })
  .passthrough();

const changeSchema = z
  .object({
    value: messagesValueSchema,
    field: z.string(), // tipicamente 'messages'
  })
  .passthrough();

const entrySchema = z
  .object({
    id: z.string(), // WABA ID
    changes: z.array(changeSchema),
  })
  .passthrough();

export const whatsappWebhookPayloadSchema = z
  .object({
    object: z.literal('whatsapp_business_account'),
    entry: z.array(entrySchema),
  })
  .passthrough();

export type WhatsappWebhookPayload = z.infer<typeof whatsappWebhookPayloadSchema>;

// Estrae i messaggi inbound rilevanti dal payload, appiattendo le entry.
// Status updates (delivered/read) vengono saltati. Restituisce array piatto
// di { message, contact, wabaId, phoneNumberId } per ogni messaggio testo
// o media trovato.
export type FlatInboundMessage = {
  message: InboundMessage;
  contactName: string | undefined;
  wabaId: string;
  phoneNumberId: string;
};

export function extractInboundMessages(payload: WhatsappWebhookPayload): FlatInboundMessage[] {
  const out: FlatInboundMessage[] = [];
  for (const entry of payload.entry) {
    for (const change of entry.changes) {
      if (change.field !== 'messages') continue;
      const messages = change.value.messages ?? [];
      const contacts = change.value.contacts ?? [];
      for (const msg of messages) {
        const contact = contacts.find((c) => c.wa_id === msg.from);
        out.push({
          message: msg,
          contactName: contact?.profile?.name,
          wabaId: entry.id,
          phoneNumberId: change.value.metadata.phone_number_id,
        });
      }
    }
  }
  return out;
}

// Renderizza il body persistibile per un messaggio inbound. Per text usa
// il body originale; per media inserisce un placeholder etichettato +
// suggerisce metadata.media_type per UI host.
export function renderMessageBody(msg: InboundMessage): {
  body: string;
  mediaType: string | undefined;
} {
  if (msg.type === 'text' && 'text' in msg) {
    return { body: msg.text.body, mediaType: undefined };
  }
  return {
    body: `[Allegato WhatsApp non testuale: ${msg.type}]`,
    mediaType: msg.type,
  };
}
