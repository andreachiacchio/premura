import { index, jsonb, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { bookings } from './bookings';
import { pendingDraftStatusEnum } from './enums';
import { hosts } from './hosts';
import { messages } from './messages';

// Draft di risposta o azione proposta in attesa di approvazione host
// (modalità 🟡 Draft della matrice delega).
//
// Due "kind" supportati (slice 7a.3):
//   - 'message_reply': Conversation Agent ha generato risposta a un
//     messaggio inbound dell'ospite. message_id richiesto.
//   - 'deflection_wa_invite': Premura ha generato un nudge da inviare
//     in-platform (Booking inbox / Airbnb inbox) per spostare la
//     conversazione su WhatsApp. Triggered all'arrivo di una nuova
//     prenotazione, prima che l'ospite abbia scritto. message_id null.
//
// Flusso (entrambi):
//   1. Trigger (messaggio inbound | new booking)
//   2. Row creata con status=pending + push notification all'host
//   3. Host in app vede card + bottone azione (1 tap)
//   4. Su approve / send → final_response_sent + status=approved
//   5. Scaduto (expires_at) senza decisione → status=expired
export const pendingDrafts = pgTable(
  'pending_drafts',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // Tipo di draft. Determina la UI host e la pipeline di
    // approvazione/invio. Default 'message_reply' per backward-compat
    // con i draft pre-7a.3.
    kind: varchar('kind', { length: 64 }).notNull().default('message_reply'),

    // Messaggio inbound che ha triggerato il draft. NULLABLE da slice
    // 7a.3 perche' i draft 'deflection_wa_invite' non rispondono a un
    // messaggio (sono nudge proattivi).
    messageId: uuid('message_id').references(() => messages.id, { onDelete: 'cascade' }),
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

    // Metadata libero. Esempi:
    //   deflection_wa_invite -> { target_channel: 'booking_inbox',
    //                              source_booking_id, wa_number }
    //   message_reply        -> { intent_classification, latency_ms_target }
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),

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
    index('pending_drafts_kind_idx').on(t.kind),
  ],
);
