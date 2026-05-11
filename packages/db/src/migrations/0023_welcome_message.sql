-- Slice E — Welcome message check-in automatico.
--
-- Aggiunte:
--  - kits.welcome_message_sent_at TIMESTAMP: per idempotenza cron worker
--    (skip ri-invio se gia' sent).
--  - hosts.welcome_auto_send BOOLEAN DEFAULT TRUE: host puo' disabilitare
--    auto-send via /settings/agent.
--  - hosts.welcome_time_slot VARCHAR(5) DEFAULT '08:00': finestra ora
--    preferita HH:MM (default 08:00). Cron tick ogni 30min 08:00-12:00,
--    invio iniziato quando ora corrente >= time_slot.

ALTER TABLE "kits"
  ADD COLUMN IF NOT EXISTS "welcome_message_sent_at" TIMESTAMP WITH TIME ZONE;
--> statement-breakpoint

ALTER TABLE "hosts"
  ADD COLUMN IF NOT EXISTS "welcome_auto_send" BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS "welcome_time_slot" VARCHAR(5) NOT NULL DEFAULT '08:00';
--> statement-breakpoint

-- Index per finder cron: query kit candidati = set_up + photo + checkin today + non sent.
CREATE INDEX IF NOT EXISTS "kits_welcome_finder_idx"
  ON "kits" ("status", "welcome_message_sent_at")
  WHERE "welcome_message_sent_at" IS NULL;
