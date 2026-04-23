import {
  pgTable,
  uuid,
  text,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { pendingDraftStatusEnum } from './enums';
import { messages } from './messages';
import { bookings } from './bookings';
import { hosts } from './hosts';

// Draft di risposta generato dal Conversation Agent e in attesa di
// approvazione dell'host (modalità 🟡 Draft della matrice delega).
//
// Flusso:
//   1. Ospite scrive → Conversation Agent decide mode=draft
//   2. Row qui viene creata con status=pending + push notification all'host
//   3. Host in app vede "Approva risposta" (1 tap) o modifica o rigetta
//   4. Su approve → final_response_sent viene scritto e inviato via canale
//   5. Scaduto (expires_at) senza decisione → status=expired, agente escalate
export const pendingDrafts = pgTable(
  'pending_drafts',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // Messaggio inbound che ha triggerato il draft
    messageId: uuid('message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    bookingId: uuid('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'cascade' }),
    hostId: uuid('host_id')
      .notNull()
      .references(() => hosts.id, { onDelete: 'cascade' }),

    // Draft proposto dall'agente
    draftResponse: text('draft_response').notNull(),
    // Ragionamento dell'agente, mostrato all'host come "perché ti propongo questo"
    reasoning: text('reasoning'),
    // Azione concreta suggerita (es. "confermare late check-out di 1h")
    suggestedAction: text('suggested_action'),

    status: pendingDraftStatusEnum('status').notNull().default('pending'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    rejectedAt: timestamp('rejected_at', { withTimezone: true }),

    // Testo finale inviato all'ospite (se host ha modificato il draft,
    // questo differisce da draft_response).
    finalResponseSent: text('final_response_sent'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('pending_drafts_host_idx').on(t.hostId),
    index('pending_drafts_booking_idx').on(t.bookingId),
    index('pending_drafts_message_idx').on(t.messageId),
    index('pending_drafts_status_idx').on(t.status),
    index('pending_drafts_expires_at_idx').on(t.expiresAt),
  ],
);
