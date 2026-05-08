import { index, jsonb, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { bookings } from './bookings';

// Quiz pre-arrivo per ospiti.
//
// Originale (milestone 4.4): 4 swipe stile Tinder — questions/responses
// strutturati come Q-A (id, options).
//
// Slice B: survey conversazionale Sonnet 4.6 multi-turn — Premura conduce
// 3 domande in chat naturale, estrae fields (specialOccasion, allergies,
// preferences) e li salva in `responses`.
//
// Tipo coesistente: guest_quizzes ospita entrambi i formati.
//  - questions/options: vuoto per slice B conversazionale (no domande
//    pre-definite, agent improvvisa)
//  - responses: { specialOccasion, foodAllergies, preferences } per slice
//    B; { questionId: optionId } per swipe legacy
//  - conversation_messages: array {role, content, ts} per slice B; vuoto
//    per swipe legacy
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

    // Slice B: motivo skip per analytics + audit.
    // 'no_response_96h' | 'guest_declined' | 'manual' | futuro 'opt_out_link'
    skippedReason: varchar('skipped_reason', { length: 32 }),

    // Domande generate dinamicamente in base al booking (vedi milestone 4.4).
    // Vuoto/[] per slice B conversazionale.
    questions: jsonb('questions').notNull().$type<QuizQuestion[]>().default([]),

    // Risposte dell'ospite. Per slice B: extracted fields (vedi sopra).
    // Per swipe legacy: { questionId: optionId }.
    responses: jsonb('responses').$type<Record<string, unknown>>(),

    // Slice B: turn-by-turn conversation log per debug + thread UI.
    // Array {role: 'guest'|'premura', content, ts}.
    conversationMessages: jsonb('conversation_messages')
      .notNull()
      .$type<Array<{ role: 'guest' | 'premura'; content: string; ts: string }>>()
      .default([]),

    // Slice B: lingua conversazione (it|en) determinata al send-time.
    language: varchar('language', { length: 8 }).notNull().default('it'),

    // Slice B: timestamp turni (utile per cron timeout).
    lastOutboundAt: timestamp('last_outbound_at', { withTimezone: true }),
    lastInboundAt: timestamp('last_inbound_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('guest_quizzes_booking_idx').on(t.bookingId),
    index('guest_quizzes_completed_at_idx').on(t.completedAt),
    // Slice B: filtro fast cron per survey pending.
    index('guest_quizzes_pending_idx').on(t.sentAt, t.completedAt, t.skippedAt),
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

// Slice B: shape `responses` per survey conversazionale.
export type ConversationalSurveyResponses = {
  specialOccasion?:
    | 'anniversary'
    | 'birthday'
    | 'honeymoon'
    | 'business'
    | 'family'
    | 'other'
    | 'none';
  foodAllergies?: string;
  preferences?: string;
};

export type ConversationTurn = {
  role: 'guest' | 'premura';
  content: string;
  ts: string;
};
