import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
  decimal,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';
import { agentTypeEnum, agentActionStatusEnum } from './enums';
import { hosts } from './hosts';
import { bookings } from './bookings';

// Audit log di ogni decisione / azione di un agente.
// Pilastro "Observabilità totale" (CLAUDE.md §4): niente black box.
//
// Ogni chiamata Claude (Guest DNA, Kit Composer, Message Writer,
// Conversation, Onboarding) scrive qui una row con input, output,
// reasoning, costo, latenza.
export const agentActions = pgTable(
  'agent_actions',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // Host è sempre noto (anche per azioni di sistema scope-host).
    hostId: uuid('host_id')
      .notNull()
      .references(() => hosts.id, { onDelete: 'cascade' }),
    // Booking opzionale: onboarding o azioni globali non sono booking-scoped.
    bookingId: uuid('booking_id').references(() => bookings.id, { onDelete: 'cascade' }),

    agent: agentTypeEnum('agent').notNull(),
    // Sotto-tipo libero (es. "generate_dna", "compose_kit", "classify_intent",
    // "send_kit_reveal"). Non enum per flessibilità evolutiva.
    actionType: varchar('action_type', { length: 64 }).notNull(),
    status: agentActionStatusEnum('status').notNull(),

    // Input fornito all'agente (contesto serializzato, prompt vars)
    inputSummary: jsonb('input_summary').$type<Record<string, unknown>>(),
    // Output strutturato dell'agente
    output: jsonb('output').$type<Record<string, unknown>>(),
    // Reasoning / chain-of-thought visibile all'host nel log debug
    reasoning: text('reasoning'),

    // Metadata chiamata Claude
    model: varchar('model', { length: 64 }),
    costUsd: decimal('cost_usd', { precision: 10, scale: 6 }),
    latencyMs: integer('latency_ms'),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    cacheReadTokens: integer('cache_read_tokens'),
    cacheWriteTokens: integer('cache_write_tokens'),

    // Errore (se status=error|partial)
    errorMessage: text('error_message'),
    errorStack: text('error_stack'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('agent_actions_host_idx').on(t.hostId),
    index('agent_actions_booking_idx').on(t.bookingId),
    index('agent_actions_agent_idx').on(t.agent),
    index('agent_actions_status_idx').on(t.status),
    index('agent_actions_created_at_idx').on(t.createdAt),
  ],
);
