import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { bookings } from './bookings';
import { pendingDraftStatusEnum } from './enums';
import { hosts } from './hosts';
import { messages } from './messages';

// Draft di risposta o azione proposta in attesa di approvazione host
// (modalità 🟡 Draft della matrice delega).
//
// Tre "kind" supportati:
//   - 'message_reply': legacy slice 6, draft generico associato a
//     un message_id (deprecato a favore di reply_draft).
//   - 'deflection_wa_invite' (slice 7a.3): Premura ha generato un nudge
//     da inviare in-platform per spostare conversazione su WhatsApp.
//     message_id null.
//   - 'reply_draft' (slice 11): Conversation Agent ha generato risposta
//     concreta a un messaggio inbound. reply_to_message_id richiesto,
//     metadata include classification + confidence.
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
    //   deflection_wa_invite -> { target_channel, source_booking_id,
    //                              wa_number }
    //   reply_draft          -> { confidence, classification,
    //                              suggested_action, voice_profile_version,
    //                              dna_snapshot, property_knowledge_used }
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),

    // Slice 11: messaggio inbound che ha triggerato un reply_draft.
    // Indipendente dal messageId legacy (kind='message_reply').
    // FK su messages, set null on delete.
    replyToMessageId: uuid('reply_to_message_id').references(() => messages.id, {
      onDelete: 'set null',
    }),

    status: pendingDraftStatusEnum('status').notNull().default('pending'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    rejectedAt: timestamp('rejected_at', { withTimezone: true }),

    // Testo finale inviato all'ospite (se host ha modificato il draft,
    // questo differisce da draft_response).
    finalResponseSent: text('final_response_sent'),

    // ─── Slice 7B: tracking outbound Meta Cloud API ───
    //
    // sent_at: timestamp 200 da Meta (separato da approved_at, il click
    // host puo' essere precedente alla send se la API lagga).
    // rejection_reason: opzionale, dato dall'host al click Scarta.
    // meta_message_id: wamid Meta (duplica messages.platform_message_id
    // ma evita join nei fast path UI).
    // error_log: ultima failure (Meta 4xx body o 5xx fallito).
    // retry_count: tentativi BullMQ (max 3 prima di status='failed').
    sentAt: timestamp('sent_at', { withTimezone: true }),
    rejectionReason: text('rejection_reason'),
    metaMessageId: varchar('meta_message_id', { length: 255 }),
    errorLog: text('error_log'),
    retryCount: integer('retry_count').notNull().default(0),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('pending_drafts_host_idx').on(t.hostId),
    index('pending_drafts_booking_idx').on(t.bookingId),
    index('pending_drafts_message_idx').on(t.messageId),
    index('pending_drafts_status_idx').on(t.status),
    index('pending_drafts_expires_at_idx').on(t.expiresAt),
    index('pending_drafts_kind_idx').on(t.kind),
    index('pending_drafts_reply_to_message_idx').on(t.replyToMessageId),
    index('pending_drafts_meta_message_idx').on(t.metaMessageId),
  ],
);
