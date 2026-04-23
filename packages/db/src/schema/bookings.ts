import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
  decimal,
  boolean,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { platformEnum, bookingStatusEnum } from './enums';
import { properties } from './properties';

// Prenotazione. Entry point di ogni workflow Premura.
// Ingested via iCal polling (milestone 2.1) o email forwarding (2.2).
export const bookings = pgTable(
  'bookings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),

    platform: platformEnum('platform').notNull(),
    // Riferimento univoco sulla piattaforma origine (iCal UID o booking ID).
    // La coppia (platform, platformBookingRef) è usata per dedup.
    platformBookingRef: varchar('platform_booking_ref', { length: 128 }).notNull(),

    // Dati ospite dalla piattaforma (non ancora arricchiti da Guest DNA).
    guestFullName: varchar('guest_full_name', { length: 255 }).notNull(),
    guestCountryCode: varchar('guest_country_code', { length: 2 }),
    guestAgeApprox: integer('guest_age_approx'),
    guestEmail: varchar('guest_email', { length: 255 }),
    guestPhone: varchar('guest_phone', { length: 32 }),

    // Opt-in ospite per contatto via WhatsApp (canale primario).
    // Se null → non ancora chiesto; se false → fallback obbligato su inbox piattaforma.
    whatsappOptIn: boolean('whatsapp_opt_in'),

    numGuests: integer('num_guests').notNull().default(1),
    numAdults: integer('num_adults').notNull().default(1),
    numChildren: integer('num_children').notNull().default(0),

    checkinAt: timestamp('checkin_at', { withTimezone: true }).notNull(),
    checkoutAt: timestamp('checkout_at', { withTimezone: true }).notNull(),
    nights: integer('nights').notNull(),
    totalPriceEur: decimal('total_price_eur', { precision: 10, scale: 2 }),

    // Nota libera dell'ospite al momento della prenotazione
    guestNote: text('guest_note'),
    status: bookingStatusEnum('status').notNull().default('confirmed'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('bookings_property_idx').on(t.propertyId),
    // Dedup: la stessa booking non può essere ingerita due volte.
    uniqueIndex('bookings_platform_ref_uniq').on(t.platform, t.platformBookingRef),
    index('bookings_checkin_idx').on(t.checkinAt),
    index('bookings_status_idx').on(t.status),
    index('bookings_created_at_idx').on(t.createdAt),
  ],
);
