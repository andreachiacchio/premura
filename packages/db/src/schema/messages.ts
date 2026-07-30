import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
  boolean,
  decimal,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';
import {
  messageChannelEnum,
  messageDirectionEnum,
  messageEntityEnum,
  messageStageEnum,
  decisionModeEnum,
} from './enums';
import { bookings } from './bookings';
import { conversations } from './conversations';

// Messaggi inbound e outbound. Unica tabella per tracciare tutto il flusso
// conversazionale (ospite ↔ Premura ↔ host ↔ cleaner).
//
// Campi v2 aggiunti rispetto a v1 (architecture.md §4):
//   conversation_id, from_entity, to_entity,
//   intent_classification, decision_mode,
//   draft_approved_by_host, response_latency_ms, metadata.
export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // Nullable: alcune azioni di sistema (onboarding host) non sono booking-scoped.
    bookingId: uuid('booking_id').references(() => bookings.id, { onDelete: 'cascade' }),
    // Valorizzato per i messaggi inbound e le loro risposte; null per gli
    // outbound programmati delle 5 fasi.
    conversationId: uuid('conversation_id').references(() => conversations.id, {
      onDelete: 'set null',
    }),

    channel: messageChannelEnum('channel').notNull(),
    direction: messageDirectionEnum('direction').notNull(),

    // Stato esplicito del messaggio (Fase 2, 30/07): 'received' per gli
    // inbound; gli outbound useranno queued/sent/failed/blocked. Varchar
    // libero come data_source: nessuna migration per uno stato nuovo.
    status: varchar('status', { length: 16 }).notNull().default('received'),
    fromEntity: messageEntityEnum('from_entity').notNull(),
    toEntity: messageEntityEnum('to_entity').notNull(),

    // Stage per i messaggi outbound programmati (5 fasi). Null per inbound o
    // per risposte conversazionali ad-hoc (stage = conversation_reply opzionale).
    stage: messageStageEnum('stage'),

    body: text('body').notNull(),
    // Lingua rilevata dell'ospite (ISO 639-1: "it", "en", "fr", ...)
    language: varchar('language', { length: 8 }),

    // ─── Campi specifici INBOUND (popolati dal Conversation Agent) ───

    // Classifica del tipo di richiesta (stringa libera con valori tipici:
    // "info_parking", "complaint_broken_ac", "small_talk", ...).
    // Usiamo text invece di enum perché la tassonomia evolve rapidamente
    // con l'uso reale e l'enum pg è rigido.
    intentClassification: text('intent_classification'),
    // Modalità decisa dall'agente per la risposta (auto/draft/escalate).
    // not_applicable per messaggi outbound programmati.
    decisionMode: decisionModeEnum('decision_mode'),
    // Per messaggi dove l'agente ha prodotto un draft: true se l'host
    // ha approvato (eventualmente con modifiche), false se rigettato,
    // null se non ancora deciso.
    draftApprovedByHost: boolean('draft_approved_by_host'),
    // Latenza tra ricezione inbound e invio risposta (ms). Target <10000.
    responseLatencyMs: integer('response_latency_ms'),

    // ─── Tracking piattaforma esterna ───

    // ID univoco del messaggio sulla piattaforma (WhatsApp msg ID, email Message-ID, ...)
    platformMessageId: varchar('platform_message_id', { length: 255 }),
    // ID recipient sulla piattaforma (numero WhatsApp E.164, email, ...)
    recipientExternalId: varchar('recipient_external_id', { length: 255 }),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    readAt: timestamp('read_at', { withTimezone: true }),
    failedAt: timestamp('failed_at', { withTimezone: true }),
    failureReason: text('failure_reason'),

    // ─── Audit agente ───

    agentReasoning: text('agent_reasoning'),
    agentModel: varchar('agent_model', { length: 64 }),
    agentCostUsd: decimal('agent_cost_usd', { precision: 8, scale: 6 }),

    // Metadata libero (attachments, reply-to, etc.)
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('messages_booking_idx').on(t.bookingId),
    index('messages_conversation_idx').on(t.conversationId),
    index('messages_channel_idx').on(t.channel),
    index('messages_direction_idx').on(t.direction),
    index('messages_stage_idx').on(t.stage),
    index('messages_created_at_idx').on(t.createdAt),
    index('messages_platform_message_idx').on(t.platformMessageId),
  ],
);
