-- Slice 9 prep: onboarding stepper multi-host.
--
-- hosts.onboarding_step: tracking lo step corrente del flusso onboarding
-- per supportare resume capability (utente abbandona a step 2, torna li'
-- al next login).
--
-- Valori validi (string libera per evoluzione, no enum):
--   'welcome' - step 1, nome host + lingua preferita
--   'property' - step 2, prima property
--   'gmail' - step 3, connect Gmail OAuth
--   'whatsapp' - step 4, placeholder informativo Meta WA Business
--   'completed' - flusso chiuso, redirect a dashboard
--
-- Backfill: tutti gli host esistenti vengono marcati 'completed' perche'
-- hanno gia' superato l'onboarding (Andrea pilot manuale). I nuovi host
-- partono da 'welcome'.

ALTER TABLE "hosts"
  ADD COLUMN IF NOT EXISTS "onboarding_step" VARCHAR(32) NOT NULL DEFAULT 'welcome';
--> statement-breakpoint
-- Backfill: utenti esistenti hanno gia' completato (Andrea pilot).
UPDATE "hosts" SET "onboarding_step" = 'completed' WHERE "onboarding_completed" = TRUE;
