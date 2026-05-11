-- Slice I — Landing aggiornamento beta aperta.
--
-- La tabella waitlist da pre-lancio diventa "beta access requests": ora
-- l'host segnala interesse alla beta privata e Andrea risponde
-- personalmente entro 24h.
--
-- Aggiunte:
--  - requested_beta_access BOOLEAN DEFAULT TRUE: distingue le row nuove
--    (slice I, landing v2) dalle row legacy waitlist pre-lancio.
--    I record pre-esistenti restano FALSE (default applicato solo a nuove
--    insert via ADD COLUMN ... DEFAULT). I record nuovi del form beta
--    arrivano con TRUE.
--  - contacted_at TIMESTAMPTZ: quando Andrea ha risposto.
--  - onboarded_at TIMESTAMPTZ: quando il lead ha completato signup vero
--    (host row creata).
--  - notes TEXT: note libere founder per follow-up.

ALTER TABLE "waitlist"
  ADD COLUMN IF NOT EXISTS "requested_beta_access" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "contacted_at" TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS "onboarded_at" TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS "notes" TEXT;
--> statement-breakpoint

-- Indice partial per founder dashboard: lead beta aperti
-- (richiesti ma non ancora contattati).
CREATE INDEX IF NOT EXISTS "waitlist_beta_open_idx"
  ON "waitlist" ("created_at")
  WHERE "requested_beta_access" = TRUE AND "contacted_at" IS NULL;
