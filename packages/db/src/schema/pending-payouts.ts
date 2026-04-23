import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  decimal,
  index,
} from 'drizzle-orm/pg-core';
import { payoutStatusEnum, payoutValidationMethodEnum } from './enums';
import { cleaners } from './cleaners';
import { kits } from './kits';

// Payout al cleaner per ogni kit validato (€2 standard).
// Aggregati in un trasferimento mensile via Stripe Connect (milestone 6.2).
//
// Validation path:
//   1. Cleaner invia foto su WhatsApp → status=confirmed, method=cleaner_photo
//   2. Fallback: conferma dell'ospite entro 24h → status=confirmed, method=guest_confirmation
//   3. Se nessuno entro 24h → notifica host per validazione manuale
export const pendingPayouts = pgTable(
  'pending_payouts',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    cleanerId: uuid('cleaner_id')
      .notNull()
      .references(() => cleaners.id, { onDelete: 'cascade' }),
    // Kit di riferimento. Set null se il kit viene eliminato ma vogliamo
    // comunque preservare la storia pagamenti al cleaner.
    kitId: uuid('kit_id').references(() => kits.id, { onDelete: 'set null' }),

    amountEur: decimal('amount_eur', { precision: 6, scale: 2 }).notNull(),

    status: payoutStatusEnum('status').notNull().default('pending'),
    validationMethod: payoutValidationMethodEnum('validation_method'),

    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    // Mese di aggregazione (primo giorno del mese UTC) — usato dal batch payout
    scheduledForMonth: timestamp('scheduled_for_month', { withTimezone: true }),
    paidAt: timestamp('paid_at', { withTimezone: true }),

    // Riferimento Stripe Connect
    stripeTransferId: varchar('stripe_transfer_id', { length: 64 }),
    failureReason: text('failure_reason'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('pending_payouts_cleaner_idx').on(t.cleanerId),
    index('pending_payouts_kit_idx').on(t.kitId),
    index('pending_payouts_status_idx').on(t.status),
    index('pending_payouts_scheduled_for_month_idx').on(t.scheduledForMonth),
    index('pending_payouts_created_at_idx').on(t.createdAt),
  ],
);
