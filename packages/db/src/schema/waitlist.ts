import { pgTable, uuid, varchar, smallint, timestamp, index } from 'drizzle-orm/pg-core';

// Waitlist pre-lancio Premura.
// Popolata dall'endpoint pubblico POST /api/waitlist (apps/web).
// Nessuna relazione con altre tabelle: raccolta lead, non oggetto di dominio.
// Dopo il lancio, gli iscritti vengono migrati manualmente a "hosts" quando
// si registrano con carta.
export const waitlist = pgTable(
  'waitlist',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // Identità
    email: varchar('email', { length: 255 }).notNull().unique(),
    fullName: varchar('full_name', { length: 255 }),
    propertyCount: smallint('property_count'), // 1..99, nullable

    // Attribuzione
    source: varchar('source', { length: 64 }), // es. "direct", da ?ref=<slug>
    referrer: varchar('referrer', { length: 512 }), // header Referer server-side

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('waitlist_email_idx').on(t.email),
    index('waitlist_created_at_idx').on(t.createdAt),
  ],
);
