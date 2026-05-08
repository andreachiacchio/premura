import { index, integer, jsonb, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { bookings } from './bookings';

// Slice B — Pre-arrival survey tap-based mini web app.
//
// 7gg pre-checkin Premura manda WA al guest con link a /s/[token].
// Guest fa 3-4 tap → submit → responses salvate qui → notifica founder
// per generazione kit (slice C).
//
// Multi-format coexistence:
//  - swipe legacy (milestone 4.4): questions/options strutturati, responses
//    {questionId: optionId}
//  - tap-app (slice B): questions_plan snapshot + responses {qid: value | string[]}
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
    // 'no_response_96h' | 'guest_declined' | 'manual'
    skippedReason: varchar('skipped_reason', { length: 32 }),

    // Domande (legacy swipe milestone 4.4: vuoto per slice B tap-app).
    questions: jsonb('questions').notNull().$type<QuizQuestion[]>().default([]),

    // Slice B: snapshot questions plan generato da survey-planner agent al
    // send-time. Inviato al frontend per render. Contiene prompt_it/en +
    // options con emoji/label.
    questionsPlan: jsonb('questions_plan').notNull().$type<QuestionPlan[]>().default([]),

    // Risposte indicizzate per question id. Slice B: { qid: optionId } per
    // single_choice, { qid: optionId[] } per multi_choice, eventuale
    // { qid: string } per text_input.
    responses: jsonb('responses').$type<Record<string, string | string[]>>(),

    // Slice B: token JWT signed (URL-safe) per accesso pubblico a /s/[token].
    // Unique tramite partial index (NULL ammessi per row legacy senza link).
    token: varchar('token', { length: 512 }),
    tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }),

    // Slice B: lingua (it|en) determinata al send-time da bookings.guest_language.
    language: varchar('language', { length: 8 }).notNull().default('it'),

    // Slice B: counter aperture link per analytics conversion funnel.
    urlOpens: integer('url_opens').notNull().default(0),
    firstOpenedAt: timestamp('first_opened_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('guest_quizzes_booking_idx').on(t.bookingId),
    index('guest_quizzes_completed_at_idx').on(t.completedAt),
    // Slice B: cron pending query (sent_at, completed_at, skipped_at).
    index('guest_quizzes_pending_idx').on(t.sentAt, t.completedAt, t.skippedAt),
    // Slice B: lookup-by-token route /s/[token] in tempo costante.
    // Partial unique index creato in migration SQL.
  ],
);

// Domanda quiz formato swipe (legacy milestone 4.4).
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

// Slice B — Question plan generato dal survey-planner agent.
// Multi-language nel plan (prompt_it/en). Frontend sceglie quello giusto.
export type QuestionPlanOption = {
  value: string;
  emoji: string;
  label_it: string;
  label_en: string;
  allow_text?: boolean; // opzione "Altro" con input free-text
};

export type QuestionPlan = {
  id: string;
  prompt_it: string;
  prompt_en: string;
  type: 'single_choice' | 'multi_choice';
  required: boolean;
  options: QuestionPlanOption[];
};

// Risposte slice B: per single_choice una stringa, per multi_choice array.
// Per opzioni con allow_text=true, il free-text viene serializzato come
// "value|<text>" (es. "other|nessuna ma evito picante").
export type SurveyResponse = string | string[];
