import { type Database, conversations, messages } from '@premura/db';
import { and, eq } from 'drizzle-orm';

// Repository per persistere messaggi inbound + relative conversations
// (slice 7a.2). Stesso pattern del WhatsApp persist (apps/api), ma scoped
// su channel email (booking_inbox / airbnb_inbox / email).
//
// Idempotenza messaggio: dedup per platform_message_id (Gmail Message-ID).
// Conversation: lookup-or-insert per (booking, channel, externalThreadId).

export type InsertInboundMessageInput = {
  bookingId: string | null;
  channel: 'booking_inbox' | 'airbnb_inbox' | 'email';
  externalThreadId: string | null;
  platformMessageId: string;
  body: string;
  language?: string | null;
  sentAt: Date;
  metadata?: Record<string, unknown>;
};

export type InsertInboundMessageResult = {
  messageId: string | null; // null se duplicate skip
  conversationId: string | null;
  status: 'inserted' | 'duplicate_skipped' | 'orphan_inserted';
};

export async function insertInboundMessage(
  db: Database,
  input: InsertInboundMessageInput,
): Promise<InsertInboundMessageResult> {
  // Step 1: dedup pre-insert.
  const [existing] = await db
    .select({
      id: messages.id,
      conversationId: messages.conversationId,
    })
    .from(messages)
    .where(eq(messages.platformMessageId, input.platformMessageId))
    .limit(1);

  if (existing) {
    return {
      messageId: existing.id,
      conversationId: existing.conversationId,
      status: 'duplicate_skipped',
    };
  }

  // Step 2: lookup-or-insert conversation se c'e' bookingId. Altrimenti
  // persisti il messaggio come orphan (conversation_id = null).
  let conversationId: string | null = null;
  if (input.bookingId) {
    const [existingConv] = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(
        and(
          eq(conversations.bookingId, input.bookingId),
          eq(conversations.channel, input.channel),
          input.externalThreadId
            ? eq(conversations.externalThreadId, input.externalThreadId)
            : eq(conversations.channel, input.channel), // fallback: match by channel only se thread null
        ),
      )
      .limit(1);

    if (existingConv) {
      conversationId = existingConv.id;
      await db
        .update(conversations)
        .set({ lastMessageAt: input.sentAt })
        .where(eq(conversations.id, conversationId));
    } else {
      const [insertedConv] = await db
        .insert(conversations)
        .values({
          bookingId: input.bookingId,
          channel: input.channel,
          externalThreadId: input.externalThreadId,
          status: 'active',
          lastMessageAt: input.sentAt,
        })
        .returning({ id: conversations.id });
      if (!insertedConv) {
        throw new Error('[messages-repo] conversation insert returned no row');
      }
      conversationId = insertedConv.id;
    }
  }

  // Step 3: insert message.
  const [insertedMsg] = await db
    .insert(messages)
    .values({
      bookingId: input.bookingId,
      conversationId,
      channel: input.channel,
      direction: 'inbound',
      fromEntity: 'guest',
      toEntity: 'premura',
      body: input.body,
      language: input.language ?? null,
      platformMessageId: input.platformMessageId,
      sentAt: input.sentAt,
      metadata: {
        ...(input.metadata ?? {}),
        ...(input.bookingId ? {} : { orphan: true }),
      },
    })
    .returning({ id: messages.id });

  if (!insertedMsg) {
    throw new Error('[messages-repo] message insert returned no row');
  }

  return {
    messageId: insertedMsg.id,
    conversationId,
    status: input.bookingId ? 'inserted' : 'orphan_inserted',
  };
}
