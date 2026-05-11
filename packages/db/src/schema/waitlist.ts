import {
  boolean,
  index,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

// Waitlist / Beta access requests.
//
// Pre-lancio (waitlist pura): popolata da POST /api/waitlist con
// requested_beta_access=false (legacy).
//
// Slice I (Premura V1 in beta): la landing chiede esplicitamente
// "Richiedi accesso alla beta privata". I nuovi record arrivano con
// requested_beta_access=true. Andrea risponde personalmente entro 24h e
// quando contatta il lead aggiorna contacted_at. Quando il lead
// completa signup -> onboarded_at.
//
// Nessuna relazione con hosts: si tratta di lead, non oggetto di dominio.
export const waitlist = pgTable(
  'waitlist',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // Identità
    email: varchar('email', { length: 255 }).notNull().unique(),
    fullName: varchar('full_name', { length: 255 }),
    propertyCount: smallint('property_count'), // 1..99, nullable

    // Attribuzione
    source: varchar('source', { length: 64 }), // es. "direct", "landing_v2", da ?ref=<slug>
    referrer: varchar('referrer', { length: 512 }), // header Referer server-side

    // Slice I — Beta access funnel
    requestedBetaAccess: boolean('requested_beta_access').notNull().default(false),
    contactedAt: timestamp('contacted_at', { withTimezone: true }),
    onboardedAt: timestamp('onboarded_at', { withTimezone: true }),
    notes: text('notes'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('waitlist_email_idx').on(t.email),
    index('waitlist_created_at_idx').on(t.createdAt),
  ],
);
