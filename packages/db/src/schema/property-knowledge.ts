import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { hosts } from './hosts';
import { properties } from './properties';

// Slice 12 — Property Knowledge.
//
// 1:1 con properties (UNIQUE constraint sul property_id). Premura
// raccoglie qui tutte le info specifiche di una struttura per
// rispondere agli ospiti in modo contestualizzato. Senza questa
// knowledge, il Conversation Agent (slice 11) esce generico.
//
// Sezioni jsonb:
//   - keybox: { code, instructions, photoUrl? }
//   - wifi: { ssid, password, notes? }
//   - parking: { available, type, instructions }
//   - houseRules: { quietHoursStart, quietHoursEnd, smokingAllowed,
//                   petsAllowed, additionalNotes }
//   - emergencyContacts: [{ name, phone, role }]
//   - nearbyEssentials: [{ category, name, address, distanceM }]
//
// Tutti i campi sono opzionali (jsonb nullable). L'host compila come
// vuole, niente flow obbligatorio.

export const propertyKnowledge = pgTable(
  'property_knowledge',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    propertyId: uuid('property_id')
      .notNull()
      .unique()
      .references(() => properties.id, { onDelete: 'cascade' }),

    keybox: jsonb('keybox').$type<KeyboxInfo | null>(),
    wifi: jsonb('wifi').$type<WifiInfo | null>(),
    parking: jsonb('parking').$type<ParkingInfo | null>(),
    houseRules: jsonb('house_rules').$type<HouseRules | null>(),
    emergencyContacts: jsonb('emergency_contacts')
      .$type<EmergencyContact[]>()
      .notNull()
      .default([]),
    nearbyEssentials: jsonb('nearby_essentials').$type<NearbyEssential[]>().notNull().default([]),
    additionalInfo: text('additional_info'),

    updatedBy: uuid('updated_by').references(() => hosts.id, { onDelete: 'set null' }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('property_knowledge_property_idx').on(t.propertyId)],
);

export type KeyboxInfo = {
  code?: string;
  instructions?: string;
  photoUrl?: string | null;
};

export type WifiInfo = {
  ssid?: string;
  password?: string;
  notes?: string;
};

export type ParkingInfo = {
  available?: boolean;
  type?: 'street' | 'garage' | 'private' | 'paid' | 'none';
  instructions?: string;
};

export type HouseRules = {
  quietHoursStart?: string; // "22:00" formato HH:MM
  quietHoursEnd?: string;
  smokingAllowed?: boolean;
  petsAllowed?: boolean;
  additionalNotes?: string;
};

export type EmergencyContact = {
  name: string;
  phone: string;
  role: string; // es. "Idraulico", "Vicino", "Cleaner"
};

export type NearbyEssential = {
  category: 'pharmacy' | 'supermarket' | 'restaurant' | 'transport' | 'other';
  name: string;
  address?: string;
  distanceM?: number; // distanza in metri
};
