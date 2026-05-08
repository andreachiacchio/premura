-- Slice B — Pre-arrival survey conversazionale.
--
-- Estende guest_quizzes per supportare survey conversazionale Sonnet 4.6
-- multi-turn (vs swipe-style di milestone 4.4 originale).
--
-- Decisioni:
--  - skipped_reason: VARCHAR(32) no enum (tassonomia evolvera':
--    'no_response_96h', 'guest_declined', 'manual', futuro 'opt_out_link')
--  - conversation_messages: jsonb array completo turn-by-turn per
--    debug + display thread UI
--  - language: 'it' | 'en' (deriva da bookings.guest_language o country)
--
-- guest_quizzes.responses esistente (Record<string,string>) viene
-- riusato per gli extracted fields della survey conversazionale:
-- { specialOccasion, foodAllergies, preferences }.

ALTER TABLE "guest_quizzes"
  ADD COLUMN IF NOT EXISTS "skipped_reason" VARCHAR(32),
  ADD COLUMN IF NOT EXISTS "conversation_messages" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS "language" VARCHAR(8) NOT NULL DEFAULT 'it',
  ADD COLUMN IF NOT EXISTS "last_outbound_at" TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS "last_inbound_at" TIMESTAMP WITH TIME ZONE;
--> statement-breakpoint

-- Index per query "survey ancora aperte" del fallback cron (48h/96h
-- timeout). Filtra rapidamente survey con sent_at NOT NULL e
-- completed_at + skipped_at NULL.
CREATE INDEX IF NOT EXISTS "guest_quizzes_pending_idx"
  ON "guest_quizzes" ("sent_at", "completed_at", "skipped_at");
