import {
  pgTable,
  uuid,
  timestamp,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';
import { bookings } from './bookings';

// Micro-quiz 60s pre-arrivo (4 swipe stile Tinder) inviato all'ospite
// quando la confidence del Guest DNA è bassa (<0.7) oppure sempre, a
// discrezione dell'host. Le risposte aggiornano il Guest DNA.
export const guestQuizzes = pgTable(
  'guest_quizzes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bookingId: uuid('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'cascade' }),

    sentAt: timestamp('sent_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    skippedAt: timestamp('skipped_at', { withTimezone: true }),

    // Domande generate dinamicamente in base al booking (vedi milestone 4.4)
    questions: jsonb('questions').notNull().$type<QuizQuestion[]>(),

    // Risposte dell'ospite indicizzate per question id
    responses: jsonb('responses').$type<Record<string, string>>(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('guest_quizzes_booking_idx').on(t.bookingId),
    index('guest_quizzes_completed_at_idx').on(t.completedAt),
  ],
);

// Domanda quiz formato swipe.
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
