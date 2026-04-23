import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { conversationChannelEnum, conversationStatusEnum } from './enums';
import { bookings } from './bookings';

// Conversazione inbound tra ospite e Premura/host.
// Una conversazione per coppia (booking, canale): tipicamente 1 conversazione
// WhatsApp per ospite, ma se l'ospite scrive anche su Booking inbox si apre
// una seconda conversazione sullo stesso booking.
//
// Nota: le conversazioni raccolgono solo messaggi INBOUND e le relative
// risposte della capacità conversazionale. I messaggi outbound programmati
// (5 fasi) esistono comunque in `messages` senza conversation_id, perché
// non sono dentro un thread di domanda/risposta.
export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bookingId: uuid('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'cascade' }),

    channel: conversationChannelEnum('channel').notNull(),
    // Thread ID sul canale esterno (es. WhatsApp conversation ID,
    // Booking message thread ID). Usato per deduplicazione webhook.
    externalThreadId: varchar('external_thread_id', { length: 255 }),

    status: conversationStatusEnum('status').notNull().default('active'),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
    closedAt: timestamp('closed_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('conversations_booking_idx').on(t.bookingId),
    index('conversations_status_idx').on(t.status),
    index('conversations_last_message_at_idx').on(t.lastMessageAt),
    // Una sola conversazione "attiva" per (booking, canale, thread esterno).
    // L'external_thread_id è nullable per supportare canali che non
    // espongono un thread id (es. email dove deriviamo da message-id).
    uniqueIndex('conversations_booking_channel_thread_uniq').on(
      t.bookingId,
      t.channel,
      t.externalThreadId,
    ),
  ],
);
