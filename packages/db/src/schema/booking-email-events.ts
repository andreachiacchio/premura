import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { hosts } from './hosts';
import { bookings } from './bookings';
import { bookingEmailEventTypeEnum } from './enums';

// Audit trail delle email Booking.com processate dal sync Gmail
// (M2a.3 Fase 3). Una riga per ogni email Booking che il classifier ha
// intercettato — indipendentemente dal fatto che abbia matchato un booking
// esistente, sia stata skippata come noise, o abbia fallito l'ingestion.
//
// Idempotenza: uniqueIndex su raw_email_id assicura che la stessa email
// Gmail non venga processata due volte (anche se il sync viene rilanciato).
//
// booking_id è nullable: per noise/unmatched non c'è bookings legato.
// FK con onDelete: 'set null' così cancellare un booking non perde l'audit
// trail dell'evento.
export const bookingEmailEvents = pgTable(
  'booking_email_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    hostId: uuid('host_id')
      .notNull()
      .references(() => hosts.id, { onDelete: 'cascade' }),
    bookingId: uuid('booking_id').references(() => bookings.id, {
      onDelete: 'set null',
    }),

    eventType: bookingEmailEventTypeEnum('event_type').notNull(),
    bookingExternalCode: varchar('booking_external_code', { length: 64 }),
    rawSubject: text('raw_subject').notNull(),
    rawEmailId: varchar('raw_email_id', { length: 128 }).notNull(),
    emailReceivedAt: timestamp('email_received_at', {
      withTimezone: true,
    }).notNull(),

    // Esito processing: 'matched' | 'unmatched' | 'skipped' | 'error'.
    ingestionStatus: varchar('ingestion_status', { length: 16 }).notNull(),
    ingestionReason: text('ingestion_reason'),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('booking_email_events_host_idx').on(t.hostId),
    index('booking_email_events_booking_idx').on(t.bookingId),
    uniqueIndex('booking_email_events_email_id_uniq').on(t.rawEmailId),
  ],
);
