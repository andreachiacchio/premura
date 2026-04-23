import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  jsonb,
  decimal,
  index,
} from 'drizzle-orm/pg-core';
import { bookings } from './bookings';

// Guest DNA — profilo strutturato dell'ospite generato da Agent 1
// da OSINT-light + pattern di prenotazione.
// Uno per booking (UNIQUE booking_id).
//
// Il nome tabella "guest_profiles" riflette architecture.md §9.
// Le strutture TypeScript mantengono il naming "Dna*" perché il concetto
// di prodotto è "Guest DNA" (CONTEXT.md §2 Fase 1).
export const guestProfiles = pgTable(
  'guest_profiles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bookingId: uuid('booking_id')
      .notNull()
      .unique()
      .references(() => bookings.id, { onDelete: 'cascade' }),

    // Archetipo scelto dall'agente (es. "coppia romantica giovane")
    archetype: varchar('archetype', { length: 128 }).notNull(),
    archetypeDescription: text('archetype_description').notNull(),

    // Segnali strutturati (vedi type DnaSignals)
    signals: jsonb('signals').notNull().$type<DnaSignals>(),

    // Top 3 rischi con mitigation specifica
    risks: jsonb('risks').notNull().$type<DnaRisk[]>(),

    // Confidence [0-1]. < 0.7 → triggera quiz pre-arrivo.
    confidence: decimal('confidence', { precision: 3, scale: 2 }).notNull(),

    // Fonti usate per l'enrichment OSINT-light (URL, social pubblici, ...)
    sources: jsonb('sources').$type<string[]>().default([]),

    // Audit agente
    agentReasoning: text('agent_reasoning'),
    agentModel: varchar('agent_model', { length: 64 }),
    agentCostUsd: decimal('agent_cost_usd', { precision: 8, scale: 6 }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('guest_profiles_booking_idx').on(t.bookingId),
    index('guest_profiles_archetype_idx').on(t.archetype),
  ],
);

// Segnali estratti dall'agente. Usati da Kit Composer e Message Writer.
export type DnaSignals = {
  profession?: string;
  tone?: 'formal_warm' | 'casual_warm' | 'direct' | 'playful';
  foodPrefs?: string[];
  pace?: 'early_riser' | 'night_owl' | 'flexible';
  travelPurpose?: 'leisure' | 'business' | 'romantic' | 'family' | 'solo';
  firstTimeInCity?: boolean;
  specialOccasion?: string;
  languagePrimary?: string;
};

// Rischi previsti con mitigation concreta.
export type DnaRisk = {
  code: string;
  title: string;
  level: 'low' | 'medium' | 'high';
  mitigation: string;
};
