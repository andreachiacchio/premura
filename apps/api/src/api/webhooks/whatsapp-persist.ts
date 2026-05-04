import { type Database, bookings, conversations, messages } from '@premura/db';
import { and, desc, eq, gte, inArray, lte } from 'drizzle-orm';
import type { FlatInboundMessage } from './whatsapp-payload';
import { renderMessageBody } from './whatsapp-payload';

// Persistenza inbound WhatsApp in conversations + messages.
//
// Lookup booking: cerca per guest_phone tra le prenotazioni con check-in/out
// in finestra ragionevole (-2gg dal check-in, +2gg dal check-out). Se non
// match, persiste come orphan (booking_id = null). L'orphan trigger un alert
// host che gestiamo in slice 7a.3+.
//
// Lookup-or-insert conversation: chiave (booking_id, channel='whatsapp',
// external_thread_id=wa_id ospite). Se non esiste, crea. Vincolo unique
// dell'indice conversations_booking_channel_thread_uniq protegge da race.
//
// Idempotenza messaggio: check pre-insert su platform_message_id (wamid...).
// Race condition possibile fra check e insert; probabilita' nulla per
// retry Meta (sempre stesso msg id, retry sequenziale 3x). Trade-off
// accettato per pilot.

export type PersistInboundResult = {
  messageId: string | null; // null se duplicato (skip)
  conversationId: string | null;
  bookingId: string | null;
  status: 'inserted' | 'duplicate_skipped' | 'orphan_inserted';
};

const PHONE_LOOKUP_WINDOW_DAYS_BEFORE_CHECKIN = 2;
const PHONE_LOOKUP_WINDOW_DAYS_AFTER_CHECKOUT = 2;

// Normalizza un numero E.164 ricevuto dal webhook (no leading +) confronto
// contro guest_phone in DB (puo' avere o non avere il +). Restituisce
// entrambe le varianti per fare match flessibile.
function phoneVariants(waId: string): string[] {
  const noPlus = waId.startsWith('+') ? waId.slice(1) : waId;
  return [noPlus, `+${noPlus}`];
}

export async function persistInboundMessage(
  db: Database,
  flat: FlatInboundMessage,
  now: Date = new Date(),
): Promise<PersistInboundResult> {
  const { message, contactName, wabaId, phoneNumberId } = flat;

  const [existingRow] = await db
    .select({
      id: messages.id,
      conversationId: messages.conversationId,
      bookingId: messages.bookingId,
    })
    .from(messages)
    .where(eq(messages.platformMessageId, message.id))
    .limit(1);

  if (existingRow) {
    return {
      messageId: existingRow.id,
      conversationId: existingRow.conversationId,
      bookingId: existingRow.bookingId,
      status: 'duplicate_skipped',
    };
  }

  const lookbackStart = new Date(now);
  lookbackStart.setDate(lookbackStart.getDate() - PHONE_LOOKUP_WINDOW_DAYS_AFTER_CHECKOUT);
  const lookforwardEnd = new Date(now);
  lookforwardEnd.setDate(lookforwardEnd.getDate() + PHONE_LOOKUP_WINDOW_DAYS_BEFORE_CHECKIN);

  const variants = phoneVariants(message.from);
  const matches = await db
    .select({ id: bookings.id, checkinAt: bookings.checkinAt })
    .from(bookings)
    .where(
      and(
        inArray(bookings.guestPhone, variants),
        gte(bookings.checkoutAt, lookbackStart),
        lte(bookings.checkinAt, lookforwardEnd),
      ),
    )
    .orderBy(desc(bookings.checkinAt))
    .limit(1);

  const bookingId: string | null = matches[0]?.id ?? null;

  let conversationId: string | null = null;
  if (bookingId) {
    const [existingConv] = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(
        and(
          eq(conversations.bookingId, bookingId),
          eq(conversations.channel, 'whatsapp'),
          eq(conversations.externalThreadId, message.from),
        ),
      )
      .limit(1);

    if (existingConv) {
      conversationId = existingConv.id;
      await db
        .update(conversations)
        .set({ lastMessageAt: now })
        .where(eq(conversations.id, conversationId));
    } else {
      const [insertedConv] = await db
        .insert(conversations)
        .values({
          bookingId,
          channel: 'whatsapp',
          externalThreadId: message.from,
          status: 'active',
          lastMessageAt: now,
        })
        .returning({ id: conversations.id });
      if (!insertedConv) {
        throw new Error('[whatsapp-persist] conversation insert returned no row');
      }
      conversationId = insertedConv.id;
    }
  }

  const { body, mediaType } = renderMessageBody(message);
  const sentAt = new Date(Number(message.timestamp) * 1000);

  const metadata: Record<string, unknown> = {
    waba_id: wabaId,
    phone_number_id: phoneNumberId,
  };
  if (contactName) metadata.contact_name = contactName;
  if (mediaType) metadata.media_type = mediaType;
  if (!bookingId) metadata.orphan = true;

  const [insertedMsg] = await db
    .insert(messages)
    .values({
      bookingId,
      conversationId,
      channel: 'whatsapp',
      direction: 'inbound',
      fromEntity: 'guest',
      toEntity: 'premura',
      body,
      platformMessageId: message.id,
      recipientExternalId: message.from,
      sentAt,
      metadata,
    })
    .returning({ id: messages.id });

  if (!insertedMsg) {
    throw new Error('[whatsapp-persist] message insert returned no row');
  }

  return {
    messageId: insertedMsg.id,
    conversationId,
    bookingId,
    status: bookingId ? 'inserted' : 'orphan_inserted',
  };
}
