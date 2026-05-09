-- Slice B — Pre-arrival survey tap-based mini web app.
--
-- guest_quizzes esteso per supportare survey via link pubblico
-- /s/[token]. Differenze dalla milestone 4.4 swipe quiz:
--  - questions array generato dinamicamente per booking (Sonnet 4.6
--    survey-planner) e snapshotted in questions_plan
--  - responses + completed_at popolati da submitSurveyAction (server
--    action route pubblica, no auth — token JWT)
--  - skipped_reason audit
--  - language determinata al send-time per i prompt
--  - url_opens analytics conversion funnel

ALTER TABLE "guest_quizzes"
  ADD COLUMN IF NOT EXISTS "token" VARCHAR(512),
  ADD COLUMN IF NOT EXISTS "token_expires_at" TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS "questions_plan" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS "language" VARCHAR(8) NOT NULL DEFAULT 'it',
  ADD COLUMN IF NOT EXISTS "url_opens" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "skipped_reason" VARCHAR(32),
  ADD COLUMN IF NOT EXISTS "first_opened_at" TIMESTAMP WITH TIME ZONE;
--> statement-breakpoint

-- Token unique: signed JWT — l'unicita' lookup-by-token serve per
-- la route pubblica /s/[token] in tempo costante.
CREATE UNIQUE INDEX IF NOT EXISTS "guest_quizzes_token_uniq"
  ON "guest_quizzes" ("token")
  WHERE "token" IS NOT NULL;
--> statement-breakpoint

-- Index per cron query "trova candidati senza survey ancora inviata".
CREATE INDEX IF NOT EXISTS "guest_quizzes_pending_idx"
  ON "guest_quizzes" ("sent_at", "completed_at", "skipped_at");
