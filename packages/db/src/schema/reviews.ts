import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  boolean,
  decimal,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';
import { reviewRecoveryOutcomeEnum } from './enums';
import { bookings } from './bookings';

// Recensione post-checkout. Tracciamo sia la recensione pubblica che il
// sondaggio privato T+24h, per misurare l'impatto di Premura sul rating.
export const reviews = pgTable(
  'reviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bookingId: uuid('booking_id')
      .notNull()
      .unique()
      .references(() => bookings.id, { onDelete: 'cascade' }),

    // Recensione pubblica (Booking/Airbnb)
    publicScore: decimal('public_score', { precision: 3, scale: 1 }),
    publicText: text('public_text'),
    publicPostedAt: timestamp('public_posted_at', { withTimezone: true }),

    // Sondaggio privato pre-recensione (inviato T+24h, prima della finestra pubblica)
    privateFeedback: jsonb('private_feedback').$type<Record<string, unknown>>(),
    privateScore: decimal('private_score', { precision: 3, scale: 1 }),
    privateSubmittedAt: timestamp('private_submitted_at', { withTimezone: true }),

    // Recovery: intervento agente su feedback negativo
    recoveryTriggered: boolean('recovery_triggered').notNull().default(false),
    recoveryAction: text('recovery_action'),
    recoveryOutcome: reviewRecoveryOutcomeEnum('recovery_outcome'),
    recoveryAt: timestamp('recovery_at', { withTimezone: true }),

    // Rating dato dall'ospite al cleaner (1-5), estratto dal sondaggio
    cleanerRating: varchar('cleaner_rating', { length: 8 }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('reviews_booking_idx').on(t.bookingId),
    index('reviews_public_score_idx').on(t.publicScore),
    index('reviews_recovery_triggered_idx').on(t.recoveryTriggered),
  ],
);
