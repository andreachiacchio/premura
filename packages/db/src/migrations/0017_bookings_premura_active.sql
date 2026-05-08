-- Slice A — Onboarding "prossimi check-in" + bulk fill numeri WA.
--
-- Aggiunge a bookings tre colonne audit per tracciare quando/come/da chi
-- viene aggiunto il guest_phone (che e' il gate di attivazione Premura
-- per quella prenotazione).
--
-- Decisioni Andrea:
--  - guest_phone_added_by_user_id rinominato a guest_phone_added_by_host_id
--    (no tabella users in Premura, hosts e' l'utente — pattern slice 7B).
--  - guest_phone_source: VARCHAR(32) no enum (tassonomia evolvera':
--    'manual', 'import_csv', 'platform', futuro 'sms_invite', ecc).

ALTER TABLE "bookings"
  ADD COLUMN IF NOT EXISTS "premura_active_at" TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS "guest_phone_added_by_host_id" UUID
    REFERENCES "hosts"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "guest_phone_source" VARCHAR(32);
--> statement-breakpoint

-- Backfill: per i booking che hanno gia' guest_phone valorizzato (pre-A),
-- settiamo premura_active_at = updated_at e source = 'platform' come
-- migrazione conservativa. Source 'platform' indica che il numero veniva
-- gia' dal channel (Booking/Airbnb form, manual M2a.4, ecc).
UPDATE "bookings"
SET
  "premura_active_at" = COALESCE("manual_completion_at", "updated_at"),
  "guest_phone_source" = 'platform'
WHERE "guest_phone" IS NOT NULL AND "premura_active_at" IS NULL;
--> statement-breakpoint

-- Index per query "prossimi check-in" (filtro check-in window + ordering).
CREATE INDEX IF NOT EXISTS "bookings_premura_active_at_idx"
  ON "bookings" ("premura_active_at");
