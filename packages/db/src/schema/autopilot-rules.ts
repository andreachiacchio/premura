import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  decimal,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { autopilotRequestTypeEnum, autopilotModeEnum } from './enums';
import { hosts } from './hosts';

// Matrice delega: per ogni (host, tipo_richiesta) specifica se Premura
// può rispondere da sé (auto), se deve proporre un draft, o se deve
// escalare all'host.
//
// Compilata in onboarding con default intelligenti (vedi CONTEXT.md §3.C),
// modificabile dall'host da UI pannello Autopilot.
export const autopilotRules = pgTable(
  'autopilot_rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    hostId: uuid('host_id')
      .notNull()
      .references(() => hosts.id, { onDelete: 'cascade' }),

    requestType: autopilotRequestTypeEnum('request_type').notNull(),
    mode: autopilotModeEnum('mode').notNull(),

    // Limiti soft per casi "dipende da quanto".
    // Es. early check-in: auto se minuti ≤ limitMinutes, altrimenti draft.
    limitMinutes: integer('limit_minutes'),
    // Es. sconto: auto se importo richiesto ≤ limitAmountEur.
    limitAmountEur: decimal('limit_amount_eur', { precision: 8, scale: 2 }),

    // Se settato, l'agente usa questo template come base per la risposta
    // (tipicamente per info statiche: WiFi, parcheggio, check-in).
    customResponseTemplate: text('custom_response_template'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Una sola regola attiva per (host, tipo richiesta)
    uniqueIndex('autopilot_rules_host_request_uniq').on(t.hostId, t.requestType),
    index('autopilot_rules_host_idx').on(t.hostId),
  ],
);
