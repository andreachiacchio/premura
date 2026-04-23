import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  boolean,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';
import { localPartnerTypeEnum } from './enums';
import { hosts } from './hosts';

// Fornitori locali per il kit fisico, alternativa ad Amazon.
// Es. pasticceria di quartiere, cantina vini, piccolo artigiano del caffè.
//
// Possono essere:
//   - legati a un singolo host (host_id valorizzato)
//   - condivisi tra tutti gli host di una città (host_id null, city valorizzato)
//
// Kit Composer (Agent 2) li considera nella selezione quando city matcha
// la property e type matcha il tema del kit.
export const localPartners = pgTable(
  'local_partners',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    hostId: uuid('host_id').references(() => hosts.id, { onDelete: 'set null' }),

    name: varchar('name', { length: 255 }).notNull(),
    type: localPartnerTypeEnum('type').notNull(),

    // Geografia: partner city-scoped
    city: varchar('city', { length: 128 }).notNull(),
    addressLine: text('address_line'),
    countryCode: varchar('country_code', { length: 2 }).notNull().default('IT'),

    // Contatti operativi
    contactName: varchar('contact_name', { length: 255 }),
    whatsappNumber: varchar('whatsapp_number', { length: 32 }),
    email: varchar('email', { length: 255 }),
    website: varchar('website', { length: 255 }),

    // Catalogo: jsonb di prodotti/servizi offerti.
    // Schema libero: { items: [{name, priceEur, notes}], avgPreparationMin }
    catalog: jsonb('catalog').$type<Record<string, unknown>>(),

    // Note libere per il Kit Composer (es. "consegna solo 8-12, no domenica")
    notes: text('notes'),

    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('local_partners_host_idx').on(t.hostId),
    index('local_partners_city_idx').on(t.city),
    index('local_partners_type_idx').on(t.type),
    index('local_partners_active_idx').on(t.isActive),
  ],
);
