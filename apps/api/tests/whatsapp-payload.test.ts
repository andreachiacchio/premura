import { describe, expect, it } from 'vitest';
import {
  extractInboundMessages,
  renderMessageBody,
  whatsappWebhookPayloadSchema,
} from '../src/api/webhooks/whatsapp-payload';

// Test del parsing payload Meta WhatsApp Cloud API.
// Riferimento payload reale: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/payload-examples

describe('whatsappWebhookPayloadSchema - parsing Meta', () => {
  it('text message base -> parse OK', () => {
    const payload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'WABA_ID_123',
          changes: [
            {
              value: {
                messaging_product: 'whatsapp',
                metadata: {
                  display_phone_number: '393514512070',
                  phone_number_id: 'PHONE_ID_456',
                },
                contacts: [
                  {
                    profile: { name: 'Mario Rossi' },
                    wa_id: '393331234567',
                  },
                ],
                messages: [
                  {
                    from: '393331234567',
                    id: 'wamid.HBgM_TEST_123',
                    timestamp: '1714838400',
                    type: 'text',
                    text: { body: 'Ciao, dove sono le chiavi?' },
                  },
                ],
              },
              field: 'messages',
            },
          ],
        },
      ],
    };
    const result = whatsappWebhookPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it('status update senza messages -> parse OK con statuses', () => {
    const payload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'WABA_ID',
          changes: [
            {
              value: {
                messaging_product: 'whatsapp',
                metadata: {
                  display_phone_number: '393514512070',
                  phone_number_id: 'PHONE_ID',
                },
                statuses: [{ id: 'wamid...', status: 'delivered', recipient_id: '39333...' }],
              },
              field: 'messages',
            },
          ],
        },
      ],
    };
    const result = whatsappWebhookPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it('media message (image) -> parse OK come union mediaMessageSchema', () => {
    const payload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'WABA',
          changes: [
            {
              value: {
                messaging_product: 'whatsapp',
                metadata: { display_phone_number: '...', phone_number_id: 'PHONE' },
                messages: [
                  {
                    from: '393331234567',
                    id: 'wamid.IMG_42',
                    timestamp: '1714838400',
                    type: 'image',
                    image: { id: 'media_id', mime_type: 'image/jpeg' },
                  },
                ],
              },
              field: 'messages',
            },
          ],
        },
      ],
    };
    const result = whatsappWebhookPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it('object sbagliato (Instagram) -> parse fail', () => {
    const payload = {
      object: 'instagram',
      entry: [],
    };
    expect(whatsappWebhookPayloadSchema.safeParse(payload).success).toBe(false);
  });

  it('payload senza entry array -> parse fail', () => {
    const payload = { object: 'whatsapp_business_account' };
    expect(whatsappWebhookPayloadSchema.safeParse(payload).success).toBe(false);
  });

  it('campi extra ignorati (Meta puo evolvere senza notice)', () => {
    const payload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'WABA',
          changes: [
            {
              value: {
                messaging_product: 'whatsapp',
                metadata: { display_phone_number: '...', phone_number_id: 'PHONE' },
                messages: [
                  {
                    from: '393331234567',
                    id: 'wamid.X',
                    timestamp: '1714838400',
                    type: 'text',
                    text: { body: 'ciao' },
                    new_meta_field: 'whatever', // Meta aggiunge campo nuovo
                  },
                ],
                future_field: { nested: 'ok' }, // anche al livello value
              },
              field: 'messages',
            },
          ],
        },
      ],
    };
    expect(whatsappWebhookPayloadSchema.safeParse(payload).success).toBe(true);
  });
});

describe('extractInboundMessages', () => {
  it('payload con 1 text message -> array di 1 elemento', () => {
    const payload = whatsappWebhookPayloadSchema.parse({
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'WABA',
          changes: [
            {
              value: {
                messaging_product: 'whatsapp',
                metadata: { display_phone_number: '393514512070', phone_number_id: 'PHONE_42' },
                contacts: [{ profile: { name: 'Anna' }, wa_id: '393331234567' }],
                messages: [
                  {
                    from: '393331234567',
                    id: 'wamid.A',
                    timestamp: '1714838400',
                    type: 'text',
                    text: { body: 'Ciao' },
                  },
                ],
              },
              field: 'messages',
            },
          ],
        },
      ],
    });
    const flat = extractInboundMessages(payload);
    expect(flat).toHaveLength(1);
    expect(flat[0].message.id).toBe('wamid.A');
    expect(flat[0].contactName).toBe('Anna');
    expect(flat[0].wabaId).toBe('WABA');
    expect(flat[0].phoneNumberId).toBe('PHONE_42');
  });

  it('payload solo statuses -> array vuoto', () => {
    const payload = whatsappWebhookPayloadSchema.parse({
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'WABA',
          changes: [
            {
              value: {
                messaging_product: 'whatsapp',
                metadata: { display_phone_number: '...', phone_number_id: 'PHONE' },
                statuses: [{ id: 'wamid', status: 'delivered' }],
              },
              field: 'messages',
            },
          ],
        },
      ],
    });
    expect(extractInboundMessages(payload)).toEqual([]);
  });

  it('contact name mancante -> contactName undefined', () => {
    const payload = whatsappWebhookPayloadSchema.parse({
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'WABA',
          changes: [
            {
              value: {
                messaging_product: 'whatsapp',
                metadata: { display_phone_number: '...', phone_number_id: 'PHONE' },
                messages: [
                  {
                    from: '393331234567',
                    id: 'wamid.A',
                    timestamp: '1714838400',
                    type: 'text',
                    text: { body: 'ciao' },
                  },
                ],
              },
              field: 'messages',
            },
          ],
        },
      ],
    });
    expect(extractInboundMessages(payload)[0].contactName).toBeUndefined();
  });

  it('payload con 2 messages in 1 batch -> array di 2', () => {
    const payload = whatsappWebhookPayloadSchema.parse({
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'WABA',
          changes: [
            {
              value: {
                messaging_product: 'whatsapp',
                metadata: { display_phone_number: '...', phone_number_id: 'PHONE' },
                contacts: [{ profile: { name: 'X' }, wa_id: '393331111111' }],
                messages: [
                  {
                    from: '393331111111',
                    id: 'wamid.A',
                    timestamp: '1714838400',
                    type: 'text',
                    text: { body: 'uno' },
                  },
                  {
                    from: '393331111111',
                    id: 'wamid.B',
                    timestamp: '1714838401',
                    type: 'text',
                    text: { body: 'due' },
                  },
                ],
              },
              field: 'messages',
            },
          ],
        },
      ],
    });
    const flat = extractInboundMessages(payload);
    expect(flat).toHaveLength(2);
    expect(flat.map((f) => f.message.id)).toEqual(['wamid.A', 'wamid.B']);
  });
});

describe('renderMessageBody', () => {
  it('text -> body originale, no mediaType', () => {
    const out = renderMessageBody({
      from: '39',
      id: 'wamid',
      timestamp: '1',
      type: 'text',
      text: { body: 'Ciao mondo' },
    });
    expect(out.body).toBe('Ciao mondo');
    expect(out.mediaType).toBeUndefined();
  });

  it('image -> placeholder etichettato + mediaType', () => {
    const out = renderMessageBody({
      from: '39',
      id: 'wamid',
      timestamp: '1',
      type: 'image',
    });
    expect(out.body).toContain('image');
    expect(out.mediaType).toBe('image');
  });

  it('audio -> placeholder + mediaType', () => {
    const out = renderMessageBody({
      from: '39',
      id: 'wamid',
      timestamp: '1',
      type: 'audio',
    });
    expect(out.mediaType).toBe('audio');
  });
});
