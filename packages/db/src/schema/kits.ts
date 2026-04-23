import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  jsonb,
  decimal,
  index,
} from 'drizzle-orm/pg-core';
import { kitStatusEnum } from './enums';
import { bookings } from './bookings';

// Kit fisico personalizzato per l'ospite. Uno per booking.
// Composizione decisa da Agent 2 (Kit Composer) in base a DNA + budget.
//
// Nota economica importante (CONTEXT.md §5):
//   prezzo ospite = costo reale + €0.75 service fee + €2 cleaner + €1 biglietto.
//   ZERO markup su item. La service fee è il secondo rivolo di revenue Premura.
export const kits = pgTable(
  'kits',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bookingId: uuid('booking_id')
      .notNull()
      .unique()
      .references(() => bookings.id, { onDelete: 'cascade' }),

    status: kitStatusEnum('status').notNull().default('pending_dna'),

    // Contenuto composto dall'agente (vedi type KitItem)
    items: jsonb('items').notNull().$type<KitItem[]>().default([]),
    // Tema riassuntivo visibile all'host (es. "colazione napoletana + vino rosso")
    theme: varchar('theme', { length: 128 }),
    // Messaggio personalizzato che il cleaner scriverà sul biglietto
    cardMessage: text('card_message'),

    // Economia del kit
    budgetEur: decimal('budget_eur', { precision: 6, scale: 2 }).notNull(),
    itemsTotalEur: decimal('items_total_eur', { precision: 6, scale: 2 }),
    deliveryEur: decimal('delivery_eur', { precision: 6, scale: 2 }),
    serviceFeeEur: decimal('service_fee_eur', { precision: 6, scale: 2 }).notNull().default('0.75'),
    cleanerFeeEur: decimal('cleaner_fee_eur', { precision: 6, scale: 2 }).notNull().default('2.00'),
    cardFeeEur: decimal('card_fee_eur', { precision: 6, scale: 2 }).notNull().default('1.00'),
    totalChargedEur: decimal('total_charged_eur', { precision: 6, scale: 2 }),

    // Tracking ordine fornitore
    supplier: varchar('supplier', { length: 32 }), // amazon | cortilia | glovo | partner
    supplierOrderRef: varchar('supplier_order_ref', { length: 128 }),
    deliveryEta: timestamp('delivery_eta', { withTimezone: true }),

    // Conferme cleaner
    cleanerBriefedAt: timestamp('cleaner_briefed_at', { withTimezone: true }),
    cleanerAcceptedAt: timestamp('cleaner_accepted_at', { withTimezone: true }),
    cleanerPlacedAt: timestamp('cleaner_placed_at', { withTimezone: true }),
    cleanerPhotoUrl: text('cleaner_photo_url'),

    // Conferma ospite (fallback se foto cleaner assente dopo 24h)
    guestConfirmedAt: timestamp('guest_confirmed_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('kits_booking_idx').on(t.bookingId),
    index('kits_status_idx').on(t.status),
    index('kits_supplier_idx').on(t.supplier),
  ],
);

// Singolo item di un kit.
export type KitItem = {
  sku: string;
  name: string;
  category: 'wine' | 'sweet' | 'fresh' | 'care' | 'kids' | 'local_specialty';
  priceEur: number;
  qty: number;
  supplier: 'amazon' | 'cortilia' | 'glovo' | 'partner';
  // Se supplier === 'partner', id del local_partner
  localPartnerId?: string;
};
