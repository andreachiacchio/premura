import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  boolean,
  decimal,
  index,
} from 'drizzle-orm/pg-core';
import { hosts } from './hosts';

// Cleaner = addetta/o alla preparazione fisica del kit in casa.
// Riceve kit a casa sua (o pickup point), sistema in casa, scatta foto,
// scrive nome ospite su biglietto. Viene pagata €2/kit validato.
//
// Una cleaner può servire più properties dello stesso host.
export const cleaners = pgTable(
  'cleaners',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    hostId: uuid('host_id')
      .notNull()
      .references(() => hosts.id, { onDelete: 'cascade' }),

    fullName: varchar('full_name', { length: 255 }).notNull(),
    whatsappNumber: varchar('whatsapp_number', { length: 32 }).notNull(),
    deliveryAddress: text('delivery_address').notNull(),
    pickupPointCode: varchar('pickup_point_code', { length: 64 }),

    // Fee base per kit validato (override dei €2 standard se concordato)
    perKitFeeEur: decimal('per_kit_fee_eur', { precision: 6, scale: 2 }).notNull().default('2.00'),

    // Stripe Connect (onboarding Express, vedi milestone 6.2)
    stripeAccountId: varchar('stripe_account_id', { length: 64 }),
    payoutMethod: varchar('payout_method', { length: 32 }).default('stripe_connect'),
    payoutIban: varchar('payout_iban', { length: 34 }),

    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('cleaners_host_idx').on(t.hostId),
    index('cleaners_active_idx').on(t.isActive),
  ],
);
