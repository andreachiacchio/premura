import {
  boolean,
  decimal,
  index,
  jsonb,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

// Host = utente pagante di Premura.
// 1 host → N properties, N cleaners, 1 voice profile, N autopilot rules.
export const hosts = pgTable(
  'hosts',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // 0036 (Punto 2 Parte A): hosts.id e' chiave propria, il legame con
    // Supabase Auth passa da qui. UNIQUE; FK verso auth.users nel SQL
    // (auth.* non e' modellato in Drizzle). NULL = host non collegato
    // (righe storiche orfane).
    authUserId: uuid('auth_user_id').unique(),

    // Identità
    email: varchar('email', { length: 255 }).notNull().unique(),
    fullName: varchar('full_name', { length: 255 }),
    phone: varchar('phone', { length: 32 }),
    locale: varchar('locale', { length: 8 }).notNull().default('it-IT'),
    timezone: varchar('timezone', { length: 64 }).notNull().default('Europe/Rome'),

    // Stripe (vedi milestone 6.1)
    stripeCustomerId: varchar('stripe_customer_id', { length: 64 }),
    stripeSubscriptionId: varchar('stripe_subscription_id', { length: 64 }),
    subscriptionStatus: varchar('subscription_status', { length: 32 }),
    trialEndsAt: timestamp('trial_ends_at', { withTimezone: true }),

    // Default propagati alle proprietà (override per-property in properties.kitBudgetEur)
    defaultKitBudgetEur: decimal('default_kit_budget_eur', { precision: 8, scale: 2 }).default(
      '12.00',
    ),
    autoApproveKits: boolean('auto_approve_kits').notNull().default(true),

    // Onboarding: true quando host ha completato il flow conversazionale con Agent 5
    onboardingCompleted: boolean('onboarding_completed').notNull().default(false),
    onboardingCompletedAt: timestamp('onboarding_completed_at', { withTimezone: true }),
    // Slice 9 prep: step corrente del flusso onboarding per resume.
    // Valori: 'welcome' | 'property' | 'calendar' | 'knowledge' | 'cleaner' | 'completed'.
    onboardingStep: varchar('onboarding_step', { length: 32 }).notNull().default('welcome'),

    // Slice E: auto-send welcome message check-in.
    welcomeAutoSend: boolean('welcome_auto_send').notNull().default(true),
    welcomeTimeSlot: varchar('welcome_time_slot', { length: 5 }).notNull().default('08:00'),

    // Disclosure AI (AI Act art. 50, applicabile dal 2 agosto 2026).
    // Testo personalizzato per lingua: { "it": "…", "en": "…" }.
    // Oggetto vuoto = si usano i testi predefiniti.
    //
    // Non esiste un flag per disattivarla: l'host personalizza le
    // parole, non può ottenere il silenzio. Un testo custom vuoto
    // ricade sul default — vedi packages/shared/src/ai-disclosure.ts.
    aiDisclosureCustom: jsonb('ai_disclosure_custom')
      .$type<Partial<Record<'it' | 'en', string | null>>>()
      .notNull()
      .default({}),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('hosts_email_idx').on(t.email),
    index('hosts_stripe_customer_idx').on(t.stripeCustomerId),
    index('hosts_created_at_idx').on(t.createdAt),
  ],
);
