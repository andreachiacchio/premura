-- Slice F — Cleaner management UI extensions.
--
-- Aggiunte:
--  - email TEXT NULL (per magic link app cleaner slice D)
--  - notes TEXT NULL (note libere host)
--  - language_preferred VARCHAR(8) DEFAULT 'it' ('it'|'en'|'es')
--  - karen_accepted BOOLEAN DEFAULT FALSE (cleaner ha confermato uso Premura)

ALTER TABLE "cleaners"
  ADD COLUMN IF NOT EXISTS "email" TEXT,
  ADD COLUMN IF NOT EXISTS "notes" TEXT,
  ADD COLUMN IF NOT EXISTS "language_preferred" VARCHAR(8) NOT NULL DEFAULT 'it',
  ADD COLUMN IF NOT EXISTS "karen_accepted" BOOLEAN NOT NULL DEFAULT FALSE;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "cleaners_email_idx" ON "cleaners" ("email");
