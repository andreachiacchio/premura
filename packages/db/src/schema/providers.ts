import {
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { providerStatusEnum, serviceCategoryEnum } from './enums';
import { hosts } from './hosts';
import { properties } from './properties';

// Fornitori di SERVIZI per gli ospiti (Antonio col gozzo, transfer, chef).
// Da non confondere con local_partners, che sono i fornitori del KIT
// fisico usati dal Kit Composer: qui l'agente instrada richieste degli
// ospiti e conversa col fornitore su WhatsApp.
//
// service_tags riusa l'enum service_category del catalogo servizi:
// il routing è deterministico — la categoria del servizio richiesto
// seleziona i provider con quel tag, niente scelte del modello.
//
// agent_description è il contesto che Claude riceve quando scrive AL
// fornitore o valuta le sue risposte: chi è, cosa chiedergli, i suoi
// limiti ("parla solo italiano", "mai confermare prima della risposta").
//
// typical_response_minutes / min_notice_hours alimentano i timeout:
// se Antonio di solito risponde in 30 minuti e sono passate 2 ore,
// l'agente escalation all'host invece di lasciare l'ospite nel vuoto.
export const providers = pgTable(
  'providers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    hostId: uuid('host_id')
      .notNull()
      .references(() => hosts.id, { onDelete: 'cascade' }),

    name: varchar('name', { length: 255 }).notNull(),
    // E.164 (es. +393331234567). Nullable: un provider si può censire
    // prima di avere il numero, ma senza numero non è instradabile.
    phone: varchar('phone', { length: 32 }),

    // REGOLA DI BUSINESS (30/07): i contatti dei fornitori non escono
    // MAI verso l'ospite — se l'ospite ha il numero, ci scavalca.
    // 'internal' (default) = il numero è un dato interno: la guardia
    // in reserveAndSend blocca ogni messaggio in uscita che lo
    // contiene. Un valore diverso va deciso esplicitamente, mai
    // assunto.
    contactVisibility: varchar('contact_visibility', { length: 16 }).notNull().default('internal'),

    // Come chiamare il fornitore DAVANTI all'ospite: il ruolo, mai il
    // nome ("il nostro skipper", non "Antonio" — nome + paese si
    // ritrovano su Google in due minuti).
    publicLabel: varchar('public_label', { length: 80 }),

    status: providerStatusEnum('status').notNull().default('active'),

    serviceTags: serviceCategoryEnum('service_tags').array().notNull().default([]),
    agentDescription: text('agent_description').notNull(),

    typicalResponseMinutes: integer('typical_response_minutes'),
    minNoticeHours: integer('min_notice_hours'),
    notes: text('notes'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('providers_host_idx').on(t.hostId), index('providers_status_idx').on(t.status)],
);

// Quali strutture serve ciascun fornitore. Antonio lavora per Villa
// Cristina (Praiano), non per La Goccia (Napoli): il routing filtra
// per property, non solo per host.
export const providerProperties = pgTable(
  'provider_properties',
  {
    providerId: uuid('provider_id')
      .notNull()
      .references(() => providers.id, { onDelete: 'cascade' }),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.providerId, t.propertyId] })],
);
