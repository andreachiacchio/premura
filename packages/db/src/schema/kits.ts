import {
  decimal,
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { bookings } from './bookings';
import { kitStatusEnum } from './enums';
import { hosts } from './hosts';

// Kit fisico personalizzato per l'ospite. Uno per booking.
//
// Slice C: workflow founder operator V1.
//  - kit_generator_agent (Sonnet 4.6) genera proposta da survey results
//  - founder approva/modifica/rifiuta in /dashboard/kits/[id]
//  - founder esegue ordini manuali (Amazon Business + Glovo + manual)
//    in /dashboard/kits/[id]/execute
//  - cleaner briefing via WhatsApp Cloud API
//  - status timeline: pending_survey -> proposed -> approved
//    -> ordering -> ordered -> in_transit -> arrived_at_locker
//    -> picked_up_by_cleaner -> set_up -> delivered_to_guest
//
// Nota economica (CONTEXT.md §5):
//   prezzo ospite = costo reale + €0.75 service fee + €2 cleaner + €1 biglietto.
//   ZERO markup su item.
export const kits = pgTable(
  'kits',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bookingId: uuid('booking_id')
      .notNull()
      .unique()
      .references(() => bookings.id, { onDelete: 'cascade' }),

    status: kitStatusEnum('status').notNull().default('pending_survey'),

    // Slice C: items con shape estesa (vedi type KitItem).
    items: jsonb('items').notNull().$type<KitItem[]>().default([]),
    // Tema riassuntivo visibile al founder (es. "Coppia tedesca prima volta Napoli")
    theme: varchar('theme', { length: 256 }),
    // Slice C: storytelling completo per founder UI.
    storytellingIt: text('storytelling_it'),
    storytellingEn: text('storytelling_en'),
    // Rationale dell'agent per audit + display founder.
    rationale: text('rationale'),

    // Card message (manoscritto dal cleaner sul biglietto).
    cardMessage: text('card_message'),
    cardMessageEn: text('card_message_en'),

    // Economia.
    budgetEur: decimal('budget_eur', { precision: 6, scale: 2 }).notNull(),
    itemsTotalEur: decimal('items_total_eur', { precision: 6, scale: 2 }),
    deliveryEur: decimal('delivery_eur', { precision: 6, scale: 2 }),
    serviceFeeEur: decimal('service_fee_eur', { precision: 6, scale: 2 }).notNull().default('0.75'),
    cleanerFeeEur: decimal('cleaner_fee_eur', { precision: 6, scale: 2 }).notNull().default('2.00'),
    cardFeeEur: decimal('card_fee_eur', { precision: 6, scale: 2 }).notNull().default('1.00'),
    totalChargedEur: decimal('total_charged_eur', { precision: 6, scale: 2 }),

    // Tracking ordine fornitore (legacy, slice C usa items[].executedAt).
    supplier: varchar('supplier', { length: 32 }),
    supplierOrderRef: varchar('supplier_order_ref', { length: 128 }),
    deliveryEta: timestamp('delivery_eta', { withTimezone: true }),

    // ─── Slice C: audit workflow approvazione ─────
    proposalGeneratedAt: timestamp('proposal_generated_at', { withTimezone: true }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    approvedBy: uuid('approved_by').references(() => hosts.id, { onDelete: 'set null' }),
    rejectedAt: timestamp('rejected_at', { withTimezone: true }),
    rejectionReason: text('rejection_reason'),
    // Array {field, oldValue, newValue, modifiedAt} per audit.
    modificationLog: jsonb('modification_log').notNull().$type<KitModification[]>().default([]),
    // Versione prompt agent + cost per debugging / cost tracking.
    generatorAgentVersion: varchar('generator_agent_version', { length: 32 }),
    generatorCostUsd: numeric('generator_cost_usd', { precision: 8, scale: 6 }),
    guestLanguage: varchar('guest_language', { length: 8 }).notNull().default('it'),

    // Conferme cleaner.
    cleanerBriefedAt: timestamp('cleaner_briefed_at', { withTimezone: true }),
    cleanerAcceptedAt: timestamp('cleaner_accepted_at', { withTimezone: true }),
    cleanerPlacedAt: timestamp('cleaner_placed_at', { withTimezone: true }),
    cleanerPhotoUrl: text('cleaner_photo_url'),

    // Slice E: timestamp invio welcome message (idempotency cron).
    welcomeMessageSentAt: timestamp('welcome_message_sent_at', { withTimezone: true }),

    // Conferma ospite.
    guestConfirmedAt: timestamp('guest_confirmed_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('kits_booking_idx').on(t.bookingId),
    index('kits_status_idx').on(t.status),
    index('kits_supplier_idx').on(t.supplier),
    // Slice C: query lista founder "kit da approvare ordinati per data generazione".
    index('kits_status_proposal_idx').on(t.status, t.proposalGeneratedAt),
  ],
);

// Singolo item del kit. Coesistenza V1 legacy (slice 4.x) + slice C
// Concierge Operator V1. Tutti i campi opzionali per compatibilita'
// JSONB: i caller scelgono lo shape giusto in base al milestone.
//
// Slice C (Concierge Operator V1) — usa: taxonomyKey, specificDescription,
//   quantity, estimatedPriceEur, fonte, leadTime, reasoning, ecc.
//
// Legacy V1 (kit-composer + message-writer) — usa: sku, name, category,
//   priceEur, qty, supplier.
export type KitItem = {
  // ─── Slice C (Concierge Operator) ───
  taxonomyKey?: string;
  specificDescription?: string;
  quantity?: number;
  estimatedPriceEur?: number;
  actualPriceEur?: number | null;
  fonte?: 'amazon' | 'glovo' | 'manual_print' | 'manual_write';
  leadTime?: 'same_day' | '1_day' | '2_days' | '1_hour';
  amazonSearchHint?: string;
  glovoSearchHint?: string;
  reasoning?: string;
  executedAt?: string | null;
  executionNotes?: string;
  amazonOrderId?: string;
  glovoOrderId?: string;

  // ─── Legacy V1 (slice 4.x kit-composer + message-writer) ───
  sku?: string;
  name?: string;
  category?: 'wine' | 'sweet' | 'fresh' | 'care' | 'kids' | 'local_specialty';
  priceEur?: number;
  qty?: number;
  supplier?: 'amazon' | 'cortilia' | 'glovo' | 'partner';
  localPartnerId?: string;
};

export type KitModification = {
  field: string;
  oldValue: unknown;
  newValue: unknown;
  modifiedAt: string; // ISO
  modifiedBy: string; // host id
};
