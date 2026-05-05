-- Slice 8.2: estensione agent_actions per audit trail piu' ricco.
--
-- Modifiche additive (non breaking):
--   1. guest_profile_id: FK a guest_profiles (nullable, on delete set null).
--      Permette query "tutte le decisioni AI sul profilo X".
--   2. message_id: FK a messages (nullable, on delete set null).
--      Permette query "tutte le decisioni AI scaturite dal messaggio X".
--   3. human_override: boolean. Settato a true quando l'host modifica/
--      scarta la decisione dell'agente (es. rifiuta un draft pending).
--      Default false. Update lazy quando si registra un override.
--   4. cache_read_tokens / cache_write_tokens (opzionali) erano gia'
--      presenti dallo schema originale, niente da aggiungere.
--
-- Indici aggiuntivi per query "ultime N decisioni per agent" e
-- "azioni sul profilo X".

ALTER TABLE "agent_actions"
  ADD COLUMN "guest_profile_id" UUID
  REFERENCES "guest_profiles"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "agent_actions"
  ADD COLUMN "message_id" UUID
  REFERENCES "messages"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "agent_actions"
  ADD COLUMN "human_override" BOOLEAN NOT NULL DEFAULT FALSE;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_actions_guest_profile_idx"
  ON "agent_actions" ("guest_profile_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_actions_message_idx"
  ON "agent_actions" ("message_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_actions_human_override_idx"
  ON "agent_actions" ("human_override")
  WHERE "human_override" = TRUE;
