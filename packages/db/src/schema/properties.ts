import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  boolean,
  decimal,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';
import { hosts } from './hosts';
import { cleaners } from './cleaners';

// Struttura dell'host. 1 host → N proprietà.
// Tipicamente 1-5 per gli host target di Premura Livello 1.
export const properties = pgTable(
  'properties',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    hostId: uuid('host_id')
      .notNull()
      .references(() => hosts.id, { onDelete: 'cascade' }),

    name: varchar('name', { length: 255 }).notNull(),
    // Nullable: onboarding incrementale dell'host. Vedi migration
    // 0008 e KNOWN-LIMITS sezione 22 per il rationale (stringa vuota
    // in NOT NULL e' anti-pattern, complica query analitiche).
    addressLine: text('address_line'),
    city: varchar('city', { length: 128 }).notNull(),
    postalCode: varchar('postal_code', { length: 16 }),
    countryCode: varchar('country_code', { length: 2 }).notNull().default('IT'),

    // Coordinate dall'indirizzo CONFERMATO dall'host (Nominatim/OSM).
    // Base per mappa e POI della guest app. Nullable: senza indirizzo
    // confermato niente coordinate, mai geocoding di un dato incerto.
    latitude: decimal('latitude', { precision: 9, scale: 6 }),
    longitude: decimal('longitude', { precision: 9, scale: 6 }),

    // Codice annuncio Booking.com (es. "10194397"): tiene tracciata la
    // corrispondenza property ↔ annuncio, che i token iCal (opachi) non
    // documentano. Compilato solo con corrispondenza verificata.
    bookingListingId: varchar('booking_listing_id', { length: 32 }),

    // Sorgenti iCal come jsonb array.
    // Motivo: supportare channel manager (es. Smoobu, Hostaway) oltre a
    // Booking/Airbnb direct. Un host potrebbe avere un solo URL Smoobu
    // che aggrega tutto, oppure due URL separati Booking+Airbnb, oppure mix.
    icalSources: jsonb('ical_sources').$type<IcalSource[]>().notNull().default([]),

    // Kit settings (override host defaults se presenti)
    kitBudgetEur: decimal('kit_budget_eur', { precision: 8, scale: 2 }),
    kitEnabled: boolean('kit_enabled').notNull().default(true),

    // Cleaner assegnata (può essere condivisa tra più properties)
    cleanerId: uuid('cleaner_id').references(() => cleaners.id, { onDelete: 'set null' }),

    // Note free-form. Superate da property_knowledge_base quando compilato,
    // ma utili per note rapide non strutturate.
    agentNotes: text('agent_notes'),

    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('properties_host_idx').on(t.hostId),
    index('properties_active_idx').on(t.isActive),
    index('properties_city_idx').on(t.city),
  ],
);

// Sorgente iCal per il polling prenotazioni (milestone 2.1).
// `source` identifica la piattaforma originaria: Booking, Airbnb o
// un channel manager generico (con nome specificato in channelManagerName).
export type IcalSource = {
  source: 'booking' | 'airbnb' | 'channel_manager';
  url: string;
  // Obbligatorio solo quando source === 'channel_manager' (es. "Smoobu", "Hostaway")
  channelManagerName?: string;
  // Etichetta opzionale mostrata all'host in UI
  label?: string;
};
