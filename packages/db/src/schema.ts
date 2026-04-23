import { relations } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
  jsonb,
  boolean,
  decimal,
  pgEnum,
  index,
} from 'drizzle-orm/pg-core';

// ===== ENUMS =====

export const platformEnum = pgEnum('platform', ['booking', 'airbnb']);

export const bookingStatusEnum = pgEnum('booking_status', [
  'confirmed',
  'checked_in',
  'checked_out',
  'cancelled',
]);

export const kitStatusEnum = pgEnum('kit_status', [
  'pending_dna',
  'pending_quiz',
  'composing',
  'awaiting_approval',
  'ordered',
  'delivered_to_cleaner',
  'placed_in_property',
  'confirmed_by_guest',
  'failed',
]);

export const riskLevelEnum = pgEnum('risk_level', ['low', 'medium', 'high']);

// ===== HOSTS =====

export const hosts = pgTable(
  'hosts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: varchar('email', { length: 255 }).notNull().unique(),
    fullName: varchar('full_name', { length: 255 }),
    phone: varchar('phone', { length: 32 }),
    locale: varchar('locale', { length: 8 }).notNull().default('it-IT'),
    timezone: varchar('timezone', { length: 64 }).notNull().default('Europe/Rome'),

    // Stripe
    stripeCustomerId: varchar('stripe_customer_id', { length: 64 }),
    stripeSubscriptionId: varchar('stripe_subscription_id', { length: 64 }),
    subscriptionStatus: varchar('subscription_status', { length: 32 }),
    trialEndsAt: timestamp('trial_ends_at', { withTimezone: true }),

    // Preferences (propagated to all properties by default)
    defaultKitBudgetEur: decimal('default_kit_budget_eur', { precision: 8, scale: 2 }).default(
      '12.00',
    ),
    autoApproveKits: boolean('auto_approve_kits').notNull().default(true),
    preferredTone: varchar('preferred_tone', { length: 32 }).default('warm_italian'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('hosts_email_idx').on(t.email)],
);

// ===== PROPERTIES =====

export const properties = pgTable(
  'properties',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    hostId: uuid('host_id')
      .notNull()
      .references(() => hosts.id, { onDelete: 'cascade' }),

    name: varchar('name', { length: 255 }).notNull(),
    addressLine: text('address_line').notNull(),
    city: varchar('city', { length: 128 }).notNull(),
    postalCode: varchar('postal_code', { length: 16 }),
    countryCode: varchar('country_code', { length: 2 }).notNull().default('IT'),

    // Platform IDs
    bookingPropertyId: varchar('booking_property_id', { length: 64 }),
    airbnbListingId: varchar('airbnb_listing_id', { length: 64 }),

    // Kit settings (override host defaults)
    kitBudgetEur: decimal('kit_budget_eur', { precision: 8, scale: 2 }),
    kitEnabled: boolean('kit_enabled').notNull().default(true),

    // Cleaner for this property (can share across properties)
    cleanerId: uuid('cleaner_id').references(() => cleaners.id),

    // Free-form notes used by the agent as context
    agentNotes: text('agent_notes'),

    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('properties_host_idx').on(t.hostId),
    index('properties_booking_idx').on(t.bookingPropertyId),
    index('properties_airbnb_idx').on(t.airbnbListingId),
  ],
);

// ===== CLEANERS =====

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

    perKitFeeEur: decimal('per_kit_fee_eur', { precision: 6, scale: 2 }).notNull().default('2.00'),
    payoutMethod: varchar('payout_method', { length: 32 }).default('bank_transfer'),
    payoutIban: varchar('payout_iban', { length: 34 }),

    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('cleaners_host_idx').on(t.hostId)],
);

// ===== BOOKINGS =====

export const bookings = pgTable(
  'bookings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),

    platform: platformEnum('platform').notNull(),
    platformBookingRef: varchar('platform_booking_ref', { length: 128 }).notNull(),

    // Guest info (from platform)
    guestFullName: varchar('guest_full_name', { length: 255 }).notNull(),
    guestCountryCode: varchar('guest_country_code', { length: 2 }),
    guestAgeApprox: integer('guest_age_approx'),
    guestEmail: varchar('guest_email', { length: 255 }),
    guestPhone: varchar('guest_phone', { length: 32 }),

    numGuests: integer('num_guests').notNull().default(1),
    numAdults: integer('num_adults').notNull().default(1),
    numChildren: integer('num_children').notNull().default(0),

    checkinAt: timestamp('checkin_at', { withTimezone: true }).notNull(),
    checkoutAt: timestamp('checkout_at', { withTimezone: true }).notNull(),
    nights: integer('nights').notNull(),
    totalPriceEur: decimal('total_price_eur', { precision: 10, scale: 2 }),

    guestNote: text('guest_note'),
    status: bookingStatusEnum('status').notNull().default('confirmed'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('bookings_property_idx').on(t.propertyId),
    index('bookings_platform_ref_idx').on(t.platform, t.platformBookingRef),
    index('bookings_checkin_idx').on(t.checkinAt),
  ],
);

// ===== GUEST DNA =====
// One DNA per booking, generated by the agent.

export const guestDna = pgTable(
  'guest_dna',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bookingId: uuid('booking_id')
      .notNull()
      .unique()
      .references(() => bookings.id, { onDelete: 'cascade' }),

    // Archetype chosen by the agent
    archetype: varchar('archetype', { length: 128 }).notNull(),
    archetypeDescription: text('archetype_description').notNull(),

    // Signals (structured JSON: profession, preferred_tone, food_prefs, pace, etc.)
    signals: jsonb('signals').notNull().$type<DnaSignals>(),

    // Top 3 risks with specific mitigation hints
    risks: jsonb('risks').notNull().$type<DnaRisk[]>(),

    // Confidence [0-1] based on signal richness. < 0.7 triggers pre-arrival quiz.
    confidence: decimal('confidence', { precision: 3, scale: 2 }).notNull(),

    // Sources used for OSINT-light enrichment
    sources: jsonb('sources').$type<string[]>(),

    // Raw Claude response for debugging
    agentReasoning: text('agent_reasoning'),
    agentModel: varchar('agent_model', { length: 64 }),
    agentCostUsd: decimal('agent_cost_usd', { precision: 8, scale: 6 }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('guest_dna_booking_idx').on(t.bookingId)],
);

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

export type DnaRisk = {
  code: string;
  title: string;
  level: 'low' | 'medium' | 'high';
  mitigation: string;
};

// ===== PRE-ARRIVAL QUIZ =====

export const quizzes = pgTable(
  'quizzes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bookingId: uuid('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'cascade' }),

    sentAt: timestamp('sent_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    skippedAt: timestamp('skipped_at', { withTimezone: true }),

    // Generated questions adapted to booking context
    questions: jsonb('questions').notNull().$type<QuizQuestion[]>(),

    // Guest responses, keyed by question id
    responses: jsonb('responses').$type<Record<string, string>>(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('quizzes_booking_idx').on(t.bookingId)],
);

export type QuizQuestion = {
  id: string;
  prompt: string;
  hint?: string;
  options: Array<{
    id: string;
    emoji: string;
    label: string;
    sub?: string;
  }>;
};

// ===== KITS =====

export const kits = pgTable(
  'kits',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bookingId: uuid('booking_id')
      .notNull()
      .unique()
      .references(() => bookings.id, { onDelete: 'cascade' }),

    status: kitStatusEnum('status').notNull().default('pending_dna'),

    // Composed items (sku, source, price, qty)
    items: jsonb('items').notNull().$type<KitItem[]>(),
    cardMessage: text('card_message'),

    budgetEur: decimal('budget_eur', { precision: 6, scale: 2 }).notNull(),
    itemsTotalEur: decimal('items_total_eur', { precision: 6, scale: 2 }),
    deliveryEur: decimal('delivery_eur', { precision: 6, scale: 2 }),
    serviceFeeEur: decimal('service_fee_eur', { precision: 6, scale: 2 }).notNull().default('0.75'),
    totalChargedEur: decimal('total_charged_eur', { precision: 6, scale: 2 }),

    // Supplier order tracking
    supplier: varchar('supplier', { length: 32 }), // amazon | cortilia | glovo | partner
    supplierOrderRef: varchar('supplier_order_ref', { length: 128 }),
    deliveryEta: timestamp('delivery_eta', { withTimezone: true }),

    // Cleaner confirmation
    cleanerBriefedAt: timestamp('cleaner_briefed_at', { withTimezone: true }),
    cleanerAcceptedAt: timestamp('cleaner_accepted_at', { withTimezone: true }),
    cleanerPlacedAt: timestamp('cleaner_placed_at', { withTimezone: true }),
    cleanerPhotoUrl: text('cleaner_photo_url'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('kits_booking_idx').on(t.bookingId),
    index('kits_status_idx').on(t.status),
  ],
);

export type KitItem = {
  sku: string;
  name: string;
  category: 'wine' | 'sweet' | 'fresh' | 'care' | 'kids' | 'local_specialty';
  priceEur: number;
  qty: number;
  supplier: 'amazon' | 'cortilia' | 'glovo' | 'partner';
};

// ===== MESSAGES =====
// All outbound messages from the agent (to guest, host, cleaner).

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bookingId: uuid('booking_id').references(() => bookings.id, { onDelete: 'cascade' }),

    direction: varchar('direction', { length: 16 }).notNull(), // outbound | inbound
    channel: varchar('channel', { length: 32 }).notNull(), // booking_msg | airbnb_msg | whatsapp | email
    recipientType: varchar('recipient_type', { length: 16 }).notNull(), // guest | cleaner | host
    recipientId: varchar('recipient_id', { length: 128 }),

    stage: varchar('stage', { length: 64 }), // pre_arrival | welcome | day2_checkin | post_stay_recovery | cleaner_brief
    locale: varchar('locale', { length: 8 }),
    body: text('body').notNull(),

    // For outbound: agent-generated metadata
    agentReasoning: text('agent_reasoning'),
    agentCostUsd: decimal('agent_cost_usd', { precision: 8, scale: 6 }),

    // Platform tracking
    platformMessageId: varchar('platform_message_id', { length: 128 }),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    readAt: timestamp('read_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('messages_booking_idx').on(t.bookingId),
    index('messages_channel_idx').on(t.channel),
  ],
);

// ===== REVIEWS =====
// Track reviews received post-checkout, for measuring impact.

export const reviews = pgTable(
  'reviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bookingId: uuid('booking_id')
      .notNull()
      .unique()
      .references(() => bookings.id, { onDelete: 'cascade' }),

    publicScore: decimal('public_score', { precision: 3, scale: 1 }),
    publicText: text('public_text'),

    // Private pre-review survey (sent before public review window)
    privateFeedback: jsonb('private_feedback').$type<Record<string, unknown>>(),
    privateScore: decimal('private_score', { precision: 3, scale: 1 }),

    // Did we intervene to recover a negative review?
    recoveryTriggered: boolean('recovery_triggered').notNull().default(false),
    recoveryAction: text('recovery_action'),
    recoveryOutcome: varchar('recovery_outcome', { length: 32 }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('reviews_booking_idx').on(t.bookingId)],
);

// ===== RELATIONS =====

export const hostsRelations = relations(hosts, ({ many }) => ({
  properties: many(properties),
  cleaners: many(cleaners),
}));

export const propertiesRelations = relations(properties, ({ one, many }) => ({
  host: one(hosts, { fields: [properties.hostId], references: [hosts.id] }),
  cleaner: one(cleaners, { fields: [properties.cleanerId], references: [cleaners.id] }),
  bookings: many(bookings),
}));

export const bookingsRelations = relations(bookings, ({ one }) => ({
  property: one(properties, { fields: [bookings.propertyId], references: [properties.id] }),
  dna: one(guestDna, { fields: [bookings.id], references: [guestDna.bookingId] }),
  kit: one(kits, { fields: [bookings.id], references: [kits.bookingId] }),
  review: one(reviews, { fields: [bookings.id], references: [reviews.bookingId] }),
}));
