import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
} from 'drizzle-orm/pg-core';
import { properties } from './properties';

// Profilo struttura (= "manuale digitale").
// Popolato in onboarding via chat conversazionale (Agent 5).
// Consultato dal Conversation Agent per rispondere a richieste ospite.
//
// Uno per struttura (UNIQUE property_id).
export const propertyKnowledgeBase = pgTable('property_knowledge_base', {
  id: uuid('id').primaryKey().defaultRandom(),
  propertyId: uuid('property_id')
    .notNull()
    .unique()
    .references(() => properties.id, { onDelete: 'cascade' }),

  // Arrivo: come raggiungere la struttura da aeroporto/stazione, con varianti
  arrivalInstructions: text('arrival_instructions'),
  // Parcheggio: {type:'street_zone_blu'|'garage'|'free', details:string, priceEurPerDay?:number, ...}
  parking: jsonb('parking').$type<ParkingInfo>(),

  // Check-in: {time:'15:00', flexible:boolean, method:'keybox'|'lockbox'|'person', code?:string}
  checkIn: jsonb('check_in').$type<CheckInInfo>(),
  // Check-out: {time:'11:00', flexible:boolean, instructions:string}
  checkOut: jsonb('check_out').$type<CheckOutInfo>(),

  // WiFi: {ssid:string, password:string} — la password è cifrata a livello
  // applicativo prima di essere persistita (vedi architecture.md §10).
  wifi: jsonb('wifi').$type<WifiInfo>(),
  // Riscaldamento / AC: istruzioni, telecomando, range temperatura
  heatingAc: jsonb('heating_ac').$type<HeatingAcInfo>(),
  // Elettrodomestici: lavatrice, lavastoviglie, forno, piano cottura
  appliances: jsonb('appliances').$type<Record<string, ApplianceInfo>>(),
  // Intrattenimento: TV, Netflix, Spotify, speaker
  entertainment: jsonb('entertainment').$type<EntertainmentInfo>(),

  // Rifiuti: giorni raccolta, dove, differenziata
  wasteDisposal: jsonb('waste_disposal').$type<WasteInfo>(),
  // Emergenze: idraulico, elettricista, vicino di fiducia
  emergencies: jsonb('emergencies').$type<EmergencyContact[]>(),

  // Quartiere: 5 ristoranti top, 3 bar colazione, supermercato, farmacia, ecc.
  neighborhood: jsonb('neighborhood').$type<NeighborhoodInfo>(),

  // Regole casa: fumo, animali, ospiti extra, quiet hours
  houseRules: jsonb('house_rules').$type<HouseRules>(),
  // Extra disponibili: lenzuola, asciugacapelli, ferro da stiro, kit cucina
  extras: jsonb('extras').$type<ExtrasInfo>(),

  // Percentuale di completamento [0-100], calcolata in base ai campi valorizzati.
  // Usata dall'UI per mostrare all'host cosa manca al profilo.
  completenessScore: integer('completeness_score').notNull().default(0),
  // Ultima modifica manuale dall'host (vs. generato da Agent 5)
  updatedByHost: boolean('updated_by_host').notNull().default(false),

  lastUpdatedAt: timestamp('last_updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─────────────────────────────────────────────────────────────
// Tipi di supporto per i jsonb del profilo struttura
// ─────────────────────────────────────────────────────────────

export type ParkingInfo = {
  type: 'street_zone_blu' | 'street_free' | 'garage_convenzionato' | 'private' | 'none';
  details?: string;
  priceEurPerDay?: number;
  walkingDistanceMin?: number;
};

export type CheckInInfo = {
  time: string; // "15:00"
  flexible: boolean;
  method: 'keybox' | 'lockbox' | 'person' | 'reception';
  code?: string;     // cifrato a livello applicativo
  location?: string; // "sotto il citofono", "in portineria"
  instructions?: string;
};

export type CheckOutInfo = {
  time: string;
  flexible: boolean;
  instructions?: string;
};

export type WifiInfo = {
  ssid: string;
  password: string; // cifrata a livello applicativo
  notes?: string;
};

export type HeatingAcInfo = {
  type: 'split' | 'central' | 'radiators' | 'mixed';
  remoteLocation?: string;
  howToStart?: string;
  temperatureRangeC?: { min: number; max: number };
};

export type ApplianceInfo = {
  brand?: string;
  location?: string;
  howToUse?: string;
};

export type EntertainmentInfo = {
  tv?: { brand?: string; howToStart?: string };
  netflix?: { available: boolean; loggedIn: boolean };
  spotify?: { available: boolean };
  speaker?: { available: boolean; howToConnect?: string };
};

export type WasteInfo = {
  // days indexed: 0 = lunedì, 6 = domenica
  collectionDays: { [waste: string]: number[] };
  where?: string;
  separated: boolean;
  notes?: string;
};

export type EmergencyContact = {
  role: 'plumber' | 'electrician' | 'neighbor' | 'doctor' | 'other';
  name: string;
  phone: string;
  notes?: string;
};

export type NeighborhoodInfo = {
  restaurants?: NeighborhoodPlace[];
  cafes?: NeighborhoodPlace[];
  supermarkets?: NeighborhoodPlace[];
  pharmacy?: NeighborhoodPlace;
  laundry?: NeighborhoodPlace;
  transport?: {
    metro?: string;
    bus?: string;
    taxiNumber?: string;
    bikeRental?: string;
  };
  attractions?: NeighborhoodPlace[];
};

export type NeighborhoodPlace = {
  name: string;
  address?: string;
  notes?: string;
  walkingDistanceMin?: number;
};

export type HouseRules = {
  smoking: 'never' | 'balcony_only' | 'outside_only' | 'allowed';
  pets: 'not_allowed' | 'allowed' | 'allowed_on_request';
  extraGuests: 'not_allowed' | 'allowed' | 'allowed_on_request';
  quietHours?: { from: string; to: string };
  other?: string;
};

export type ExtrasInfo = {
  extraSheets?: { available: boolean; location?: string };
  hairdryer?: { available: boolean; location?: string };
  iron?: { available: boolean; location?: string };
  kitchenKit?: { available: boolean; contents?: string[] };
  other?: Record<string, { available: boolean; location?: string }>;
};
