import {
  decimal,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { bookings } from './bookings';
import { hosts } from './hosts';

// Profilo ospite — directory degli ospiti conosciuti dall'host.
// Una riga per (host_id, full_name) coniato dalla email Airbnb.
//
// Doppia funzione:
//   1. Directory (M2a.3 Fase 2): popolato dal parser email Airbnb.
//      Campi: host_id, full_name, first_name, country_code, language,
//      email_hash, total_stays_count, last_seen_at.
//   2. Guest DNA (M2a.4): l'agente Studio popola archetype, signals,
//      risks, confidence + agent_* su questa stessa riga ad ogni
//      arrivo di una prenotazione. Per ora questi campi sono nullable
//      e popolati lazily.
//
// booking_id legacy: in v1 era 1:1 NOT NULL UNIQUE. In M2a.3 Fase 2
// diventa nullable e perde l'unique — un profilo precede la singola
// booking. Le bookings linkano al profilo via bookings.guest_profile_id.
//
// Relazione 1:N: un profilo può essere associato a N bookings (ospiti
// ricorrenti). total_stays_count traccia quante volte sono tornati.
export const guestProfiles = pgTable(
  'guest_profiles',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // Owner del profilo (scope: un guest_profile vive nel directory
    // dell'host, non condiviso tra host diversi anche se nome uguale).
    hostId: uuid('host_id')
      .notNull()
      .references(() => hosts.id, { onDelete: 'cascade' }),

    // Legacy v1: 1:1 con booking. Ora nullable. Lasciato per compatibilità
    // ma non più chiave logica del profilo.
    bookingId: uuid('booking_id').references(() => bookings.id, {
      onDelete: 'set null',
    }),

    // Identità ospite (da email Airbnb)
    fullName: varchar('full_name', { length: 255 }).notNull(),
    firstName: varchar('first_name', { length: 128 }),
    countryCode: varchar('country_code', { length: 2 }),
    language: varchar('language', { length: 8 }),

    // Hash SHA-256 hex dell'email se mai disponibile (mai plaintext).
    // Email reale è raramente nelle email Airbnb (l'host vede solo nome);
    // se in futuro si trova, hash-at-rest per ricerca/dedup.
    emailHash: varchar('email_hash', { length: 64 }),

    totalStaysCount: integer('total_stays_count').notNull().default(0),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),

    // Guest DNA (popolato in M2a.4 dall'agente Studio). Nullable.
    archetype: varchar('archetype', { length: 128 }),
    archetypeDescription: text('archetype_description'),
    signals: jsonb('signals').$type<DnaSignals>(),
    risks: jsonb('risks').$type<DnaRisk[]>(),
    // Confidence [0-1]. < 0.7 → triggera quiz pre-arrivo.
    confidence: decimal('confidence', { precision: 3, scale: 2 }),
    sources: jsonb('sources').$type<string[]>().default([]),

    // Audit agente (popolato in M2a.4)
    agentReasoning: text('agent_reasoning'),
    agentModel: varchar('agent_model', { length: 64 }),
    agentCostUsd: decimal('agent_cost_usd', { precision: 8, scale: 6 }),

    // Slice 8.1: Pipeline 2 — insights estratti da messaggi inbound.
    messageInsights: jsonb('message_insights').$type<MessageInsights>().notNull().default({}),
    firstMessageAt: timestamp('first_message_at', { withTimezone: true }),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
    messageCount: integer('message_count').notNull().default(0),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('guest_profiles_host_idx').on(t.hostId),
    index('guest_profiles_booking_idx').on(t.bookingId),
    index('guest_profiles_archetype_idx').on(t.archetype),
    index('guest_profiles_last_message_at_idx').on(t.lastMessageAt),
    // Un nome è univoco nel directory dell'host. Se domani un altro host
    // ha un guest "Stephen Smith" diverso, è una riga separata.
    uniqueIndex('guest_profiles_host_name_uniq').on(t.hostId, t.fullName),
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

// Slice 8.1 — Pipeline 2: insights aggregati dai messaggi ospite.
// Aggiornati incrementalmente ad ogni nuovo messaggio inbound.
export type MessageInsights = {
  // Lingua predominante dei messaggi ospite (ISO 639-1).
  preferredLanguage?: string;
  // Stile comunicativo aggregato.
  communicationStyle?: {
    score: number; // 1 = molto formale, 5 = molto casual
    label: 'formal' | 'casual' | 'mixed';
  };
  // Argomenti menzionati. Vocabolario chiuso (vedi MESSAGE_TOPICS in
  // packages/agents/src/dna-extractor.ts), array unique, max 20.
  topicsMentioned?: string[];
  // Almeno un messaggio recente conteneva segnali di urgenza.
  urgencySignals?: boolean;
  // Sentiment aggregato [-1, 1] moving average pesata sui messaggi
  // processati (peso piu' alto ai recenti).
  sentimentAvg?: number;
  // Numero di messaggi processati (== guest_profiles.message_count).
  // Replicato per debugging.
  processedMessages?: number;
  // Set di message_id (uuid) gia' processati. Usato per idempotenza
  // pre-insert: se il message_id e' qui, skip extraction.
  processedMessageIds?: string[];
};
