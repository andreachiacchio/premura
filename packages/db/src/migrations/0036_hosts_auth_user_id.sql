-- 0036 — Separazione hosts.id da auth.users.id (Punto 2 Parte A, 04/08).
--
-- Decisione Andrea (confermata): hosts.id diventa chiave propria,
-- hosts.auth_user_id referenzia auth.users con vincolo di unicita'.
-- Additiva e IDEMPOTENTE: rieseguibile senza danni, funziona anche su
-- database popolato (backfill auth_user_id = id SOLO dove esiste il
-- corrispondente utente auth — le righe orfane restano scollegate).
--
-- Le policy RLS smettono di assumere host_id == auth.uid(): passano
-- dalla funzione premura_host_id() (lookup hosts per auth_user_id).
-- NB: la dashboard usa la connessione owner (bypassa RLS): le policy
-- sono la seconda linea di difesa, come da 0007.

ALTER TABLE "hosts" ADD COLUMN IF NOT EXISTS "auth_user_id" uuid;--> statement-breakpoint

UPDATE "hosts" h SET "auth_user_id" = h."id"
WHERE h."auth_user_id" IS NULL
  AND EXISTS (SELECT 1 FROM auth.users u WHERE u."id" = h."id");--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "hosts_auth_user_id_uniq" ON "hosts" ("auth_user_id");--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hosts_auth_user_id_auth_users_fk') THEN
    ALTER TABLE "hosts" ADD CONSTRAINT "hosts_auth_user_id_auth_users_fk"
      FOREIGN KEY ("auth_user_id") REFERENCES auth.users("id") ON DELETE CASCADE;
  END IF;
END $$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.premura_host_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $premura$ SELECT id FROM hosts WHERE auth_user_id = auth.uid() $premura$;--> statement-breakpoint

-- ============================================================
-- hosts: l'host vede/aggiorna la propria riga via auth_user_id.
-- INSERT resta service role (ensure-host applicativo via owner conn).
-- ============================================================

DROP POLICY IF EXISTS "hosts_select_own" ON "hosts";--> statement-breakpoint
CREATE POLICY "hosts_select_own" ON "hosts" FOR SELECT TO authenticated
  USING ("auth_user_id" = auth.uid());--> statement-breakpoint
DROP POLICY IF EXISTS "hosts_update_own" ON "hosts";--> statement-breakpoint
CREATE POLICY "hosts_update_own" ON "hosts" FOR UPDATE TO authenticated
  USING ("auth_user_id" = auth.uid())
  WITH CHECK ("auth_user_id" = auth.uid());--> statement-breakpoint

-- ============================================================
-- Policy di 0007 riscritte: auth.uid() -> premura_host_id()
-- ============================================================

DROP POLICY IF EXISTS "properties_select_own" ON "properties";--> statement-breakpoint
CREATE POLICY "properties_select_own" ON "properties" FOR SELECT TO authenticated
  USING ("host_id" = public.premura_host_id());--> statement-breakpoint
DROP POLICY IF EXISTS "properties_insert_own" ON "properties";--> statement-breakpoint
CREATE POLICY "properties_insert_own" ON "properties" FOR INSERT TO authenticated
  WITH CHECK ("host_id" = public.premura_host_id());--> statement-breakpoint
DROP POLICY IF EXISTS "properties_update_own" ON "properties";--> statement-breakpoint
CREATE POLICY "properties_update_own" ON "properties" FOR UPDATE TO authenticated
  USING ("host_id" = public.premura_host_id())
  WITH CHECK ("host_id" = public.premura_host_id());--> statement-breakpoint
DROP POLICY IF EXISTS "properties_delete_own" ON "properties";--> statement-breakpoint
CREATE POLICY "properties_delete_own" ON "properties" FOR DELETE TO authenticated
  USING ("host_id" = public.premura_host_id());--> statement-breakpoint
DROP POLICY IF EXISTS "guest_profiles_select_own" ON "guest_profiles";--> statement-breakpoint
CREATE POLICY "guest_profiles_select_own" ON "guest_profiles" FOR SELECT TO authenticated
  USING ("host_id" = public.premura_host_id());--> statement-breakpoint
DROP POLICY IF EXISTS "guest_profiles_insert_own" ON "guest_profiles";--> statement-breakpoint
CREATE POLICY "guest_profiles_insert_own" ON "guest_profiles" FOR INSERT TO authenticated
  WITH CHECK ("host_id" = public.premura_host_id());--> statement-breakpoint
DROP POLICY IF EXISTS "guest_profiles_update_own" ON "guest_profiles";--> statement-breakpoint
CREATE POLICY "guest_profiles_update_own" ON "guest_profiles" FOR UPDATE TO authenticated
  USING ("host_id" = public.premura_host_id())
  WITH CHECK ("host_id" = public.premura_host_id());--> statement-breakpoint
DROP POLICY IF EXISTS "guest_profiles_delete_own" ON "guest_profiles";--> statement-breakpoint
CREATE POLICY "guest_profiles_delete_own" ON "guest_profiles" FOR DELETE TO authenticated
  USING ("host_id" = public.premura_host_id());--> statement-breakpoint
DROP POLICY IF EXISTS "cleaners_select_own" ON "cleaners";--> statement-breakpoint
CREATE POLICY "cleaners_select_own" ON "cleaners" FOR SELECT TO authenticated
  USING ("host_id" = public.premura_host_id());--> statement-breakpoint
DROP POLICY IF EXISTS "cleaners_insert_own" ON "cleaners";--> statement-breakpoint
CREATE POLICY "cleaners_insert_own" ON "cleaners" FOR INSERT TO authenticated
  WITH CHECK ("host_id" = public.premura_host_id());--> statement-breakpoint
DROP POLICY IF EXISTS "cleaners_update_own" ON "cleaners";--> statement-breakpoint
CREATE POLICY "cleaners_update_own" ON "cleaners" FOR UPDATE TO authenticated
  USING ("host_id" = public.premura_host_id())
  WITH CHECK ("host_id" = public.premura_host_id());--> statement-breakpoint
DROP POLICY IF EXISTS "cleaners_delete_own" ON "cleaners";--> statement-breakpoint
CREATE POLICY "cleaners_delete_own" ON "cleaners" FOR DELETE TO authenticated
  USING ("host_id" = public.premura_host_id());--> statement-breakpoint
DROP POLICY IF EXISTS "host_voice_profiles_select_own" ON "host_voice_profiles";--> statement-breakpoint
CREATE POLICY "host_voice_profiles_select_own" ON "host_voice_profiles" FOR SELECT TO authenticated
  USING ("host_id" = public.premura_host_id());--> statement-breakpoint
DROP POLICY IF EXISTS "host_voice_profiles_insert_own" ON "host_voice_profiles";--> statement-breakpoint
CREATE POLICY "host_voice_profiles_insert_own" ON "host_voice_profiles" FOR INSERT TO authenticated
  WITH CHECK ("host_id" = public.premura_host_id());--> statement-breakpoint
DROP POLICY IF EXISTS "host_voice_profiles_update_own" ON "host_voice_profiles";--> statement-breakpoint
CREATE POLICY "host_voice_profiles_update_own" ON "host_voice_profiles" FOR UPDATE TO authenticated
  USING ("host_id" = public.premura_host_id())
  WITH CHECK ("host_id" = public.premura_host_id());--> statement-breakpoint
DROP POLICY IF EXISTS "host_voice_profiles_delete_own" ON "host_voice_profiles";--> statement-breakpoint
CREATE POLICY "host_voice_profiles_delete_own" ON "host_voice_profiles" FOR DELETE TO authenticated
  USING ("host_id" = public.premura_host_id());--> statement-breakpoint
DROP POLICY IF EXISTS "autopilot_rules_select_own" ON "autopilot_rules";--> statement-breakpoint
CREATE POLICY "autopilot_rules_select_own" ON "autopilot_rules" FOR SELECT TO authenticated
  USING ("host_id" = public.premura_host_id());--> statement-breakpoint
DROP POLICY IF EXISTS "autopilot_rules_insert_own" ON "autopilot_rules";--> statement-breakpoint
CREATE POLICY "autopilot_rules_insert_own" ON "autopilot_rules" FOR INSERT TO authenticated
  WITH CHECK ("host_id" = public.premura_host_id());--> statement-breakpoint
DROP POLICY IF EXISTS "autopilot_rules_update_own" ON "autopilot_rules";--> statement-breakpoint
CREATE POLICY "autopilot_rules_update_own" ON "autopilot_rules" FOR UPDATE TO authenticated
  USING ("host_id" = public.premura_host_id())
  WITH CHECK ("host_id" = public.premura_host_id());--> statement-breakpoint
DROP POLICY IF EXISTS "autopilot_rules_delete_own" ON "autopilot_rules";--> statement-breakpoint
CREATE POLICY "autopilot_rules_delete_own" ON "autopilot_rules" FOR DELETE TO authenticated
  USING ("host_id" = public.premura_host_id());--> statement-breakpoint
DROP POLICY IF EXISTS "pending_drafts_select_own" ON "pending_drafts";--> statement-breakpoint
CREATE POLICY "pending_drafts_select_own" ON "pending_drafts" FOR SELECT TO authenticated
  USING ("host_id" = public.premura_host_id());--> statement-breakpoint
DROP POLICY IF EXISTS "pending_drafts_insert_own" ON "pending_drafts";--> statement-breakpoint
CREATE POLICY "pending_drafts_insert_own" ON "pending_drafts" FOR INSERT TO authenticated
  WITH CHECK ("host_id" = public.premura_host_id());--> statement-breakpoint
DROP POLICY IF EXISTS "pending_drafts_update_own" ON "pending_drafts";--> statement-breakpoint
CREATE POLICY "pending_drafts_update_own" ON "pending_drafts" FOR UPDATE TO authenticated
  USING ("host_id" = public.premura_host_id())
  WITH CHECK ("host_id" = public.premura_host_id());--> statement-breakpoint
DROP POLICY IF EXISTS "pending_drafts_delete_own" ON "pending_drafts";--> statement-breakpoint
CREATE POLICY "pending_drafts_delete_own" ON "pending_drafts" FOR DELETE TO authenticated
  USING ("host_id" = public.premura_host_id());--> statement-breakpoint
DROP POLICY IF EXISTS "agent_actions_select_own" ON "agent_actions";--> statement-breakpoint
CREATE POLICY "agent_actions_select_own" ON "agent_actions" FOR SELECT TO authenticated
  USING ("host_id" = public.premura_host_id());--> statement-breakpoint
DROP POLICY IF EXISTS "agent_actions_insert_own" ON "agent_actions";--> statement-breakpoint
CREATE POLICY "agent_actions_insert_own" ON "agent_actions" FOR INSERT TO authenticated
  WITH CHECK ("host_id" = public.premura_host_id());--> statement-breakpoint
DROP POLICY IF EXISTS "agent_actions_update_own" ON "agent_actions";--> statement-breakpoint
CREATE POLICY "agent_actions_update_own" ON "agent_actions" FOR UPDATE TO authenticated
  USING ("host_id" = public.premura_host_id())
  WITH CHECK ("host_id" = public.premura_host_id());--> statement-breakpoint
DROP POLICY IF EXISTS "agent_actions_delete_own" ON "agent_actions";--> statement-breakpoint
CREATE POLICY "agent_actions_delete_own" ON "agent_actions" FOR DELETE TO authenticated
  USING ("host_id" = public.premura_host_id());--> statement-breakpoint
DROP POLICY IF EXISTS "booking_email_events_select_own" ON "booking_email_events";--> statement-breakpoint
CREATE POLICY "booking_email_events_select_own" ON "booking_email_events" FOR SELECT TO authenticated
  USING ("host_id" = public.premura_host_id());--> statement-breakpoint
DROP POLICY IF EXISTS "booking_email_events_insert_own" ON "booking_email_events";--> statement-breakpoint
CREATE POLICY "booking_email_events_insert_own" ON "booking_email_events" FOR INSERT TO authenticated
  WITH CHECK ("host_id" = public.premura_host_id());--> statement-breakpoint
DROP POLICY IF EXISTS "booking_email_events_update_own" ON "booking_email_events";--> statement-breakpoint
CREATE POLICY "booking_email_events_update_own" ON "booking_email_events" FOR UPDATE TO authenticated
  USING ("host_id" = public.premura_host_id())
  WITH CHECK ("host_id" = public.premura_host_id());--> statement-breakpoint
DROP POLICY IF EXISTS "booking_email_events_delete_own" ON "booking_email_events";--> statement-breakpoint
CREATE POLICY "booking_email_events_delete_own" ON "booking_email_events" FOR DELETE TO authenticated
  USING ("host_id" = public.premura_host_id());--> statement-breakpoint
DROP POLICY IF EXISTS "gmail_sync_jobs_select_own" ON "gmail_sync_jobs";--> statement-breakpoint
CREATE POLICY "gmail_sync_jobs_select_own" ON "gmail_sync_jobs" FOR SELECT TO authenticated
  USING ("host_id" = public.premura_host_id());--> statement-breakpoint
DROP POLICY IF EXISTS "gmail_sync_jobs_insert_own" ON "gmail_sync_jobs";--> statement-breakpoint
CREATE POLICY "gmail_sync_jobs_insert_own" ON "gmail_sync_jobs" FOR INSERT TO authenticated
  WITH CHECK ("host_id" = public.premura_host_id());--> statement-breakpoint
DROP POLICY IF EXISTS "gmail_sync_jobs_update_own" ON "gmail_sync_jobs";--> statement-breakpoint
CREATE POLICY "gmail_sync_jobs_update_own" ON "gmail_sync_jobs" FOR UPDATE TO authenticated
  USING ("host_id" = public.premura_host_id())
  WITH CHECK ("host_id" = public.premura_host_id());--> statement-breakpoint
DROP POLICY IF EXISTS "gmail_sync_jobs_delete_own" ON "gmail_sync_jobs";--> statement-breakpoint
CREATE POLICY "gmail_sync_jobs_delete_own" ON "gmail_sync_jobs" FOR DELETE TO authenticated
  USING ("host_id" = public.premura_host_id());--> statement-breakpoint
DROP POLICY IF EXISTS "google_tokens_select_own" ON "google_tokens";--> statement-breakpoint
CREATE POLICY "google_tokens_select_own" ON "google_tokens" FOR SELECT TO authenticated
  USING ("host_id" = public.premura_host_id());--> statement-breakpoint
DROP POLICY IF EXISTS "google_tokens_insert_own" ON "google_tokens";--> statement-breakpoint
CREATE POLICY "google_tokens_insert_own" ON "google_tokens" FOR INSERT TO authenticated
  WITH CHECK ("host_id" = public.premura_host_id());--> statement-breakpoint
DROP POLICY IF EXISTS "google_tokens_update_own" ON "google_tokens";--> statement-breakpoint
CREATE POLICY "google_tokens_update_own" ON "google_tokens" FOR UPDATE TO authenticated
  USING ("host_id" = public.premura_host_id())
  WITH CHECK ("host_id" = public.premura_host_id());--> statement-breakpoint
DROP POLICY IF EXISTS "google_tokens_delete_own" ON "google_tokens";--> statement-breakpoint
CREATE POLICY "google_tokens_delete_own" ON "google_tokens" FOR DELETE TO authenticated
  USING ("host_id" = public.premura_host_id());--> statement-breakpoint
DROP POLICY IF EXISTS "bookings_select_own" ON "bookings";--> statement-breakpoint
CREATE POLICY "bookings_select_own" ON "bookings" FOR SELECT TO authenticated
  USING ("property_id" IN (SELECT "id" FROM "properties" WHERE "host_id" = public.premura_host_id()));--> statement-breakpoint
DROP POLICY IF EXISTS "bookings_insert_own" ON "bookings";--> statement-breakpoint
CREATE POLICY "bookings_insert_own" ON "bookings" FOR INSERT TO authenticated
  WITH CHECK ("property_id" IN (SELECT "id" FROM "properties" WHERE "host_id" = public.premura_host_id()));--> statement-breakpoint
DROP POLICY IF EXISTS "bookings_update_own" ON "bookings";--> statement-breakpoint
CREATE POLICY "bookings_update_own" ON "bookings" FOR UPDATE TO authenticated
  USING ("property_id" IN (SELECT "id" FROM "properties" WHERE "host_id" = public.premura_host_id()))
  WITH CHECK ("property_id" IN (SELECT "id" FROM "properties" WHERE "host_id" = public.premura_host_id()));--> statement-breakpoint
DROP POLICY IF EXISTS "bookings_delete_own" ON "bookings";--> statement-breakpoint
CREATE POLICY "bookings_delete_own" ON "bookings" FOR DELETE TO authenticated
  USING ("property_id" IN (SELECT "id" FROM "properties" WHERE "host_id" = public.premura_host_id()));--> statement-breakpoint
DROP POLICY IF EXISTS "property_knowledge_base_select_own" ON "property_knowledge_base";--> statement-breakpoint
CREATE POLICY "property_knowledge_base_select_own" ON "property_knowledge_base" FOR SELECT TO authenticated
  USING ("property_id" IN (SELECT "id" FROM "properties" WHERE "host_id" = public.premura_host_id()));--> statement-breakpoint
DROP POLICY IF EXISTS "property_knowledge_base_insert_own" ON "property_knowledge_base";--> statement-breakpoint
CREATE POLICY "property_knowledge_base_insert_own" ON "property_knowledge_base" FOR INSERT TO authenticated
  WITH CHECK ("property_id" IN (SELECT "id" FROM "properties" WHERE "host_id" = public.premura_host_id()));--> statement-breakpoint
DROP POLICY IF EXISTS "property_knowledge_base_update_own" ON "property_knowledge_base";--> statement-breakpoint
CREATE POLICY "property_knowledge_base_update_own" ON "property_knowledge_base" FOR UPDATE TO authenticated
  USING ("property_id" IN (SELECT "id" FROM "properties" WHERE "host_id" = public.premura_host_id()))
  WITH CHECK ("property_id" IN (SELECT "id" FROM "properties" WHERE "host_id" = public.premura_host_id()));--> statement-breakpoint
DROP POLICY IF EXISTS "property_knowledge_base_delete_own" ON "property_knowledge_base";--> statement-breakpoint
CREATE POLICY "property_knowledge_base_delete_own" ON "property_knowledge_base" FOR DELETE TO authenticated
  USING ("property_id" IN (SELECT "id" FROM "properties" WHERE "host_id" = public.premura_host_id()));--> statement-breakpoint
DROP POLICY IF EXISTS "conversations_select_own" ON "conversations";--> statement-breakpoint
CREATE POLICY "conversations_select_own" ON "conversations" FOR SELECT TO authenticated
  USING ("booking_id" IN (
    SELECT "id" FROM "bookings" WHERE "property_id" IN (
      SELECT "id" FROM "properties" WHERE "host_id" = public.premura_host_id()
    )
  ));--> statement-breakpoint
DROP POLICY IF EXISTS "conversations_insert_own" ON "conversations";--> statement-breakpoint
CREATE POLICY "conversations_insert_own" ON "conversations" FOR INSERT TO authenticated
  WITH CHECK ("booking_id" IN (
    SELECT "id" FROM "bookings" WHERE "property_id" IN (
      SELECT "id" FROM "properties" WHERE "host_id" = public.premura_host_id()
    )
  ));--> statement-breakpoint
DROP POLICY IF EXISTS "conversations_update_own" ON "conversations";--> statement-breakpoint
CREATE POLICY "conversations_update_own" ON "conversations" FOR UPDATE TO authenticated
  USING ("booking_id" IN (
    SELECT "id" FROM "bookings" WHERE "property_id" IN (
      SELECT "id" FROM "properties" WHERE "host_id" = public.premura_host_id()
    )
  ))
  WITH CHECK ("booking_id" IN (
    SELECT "id" FROM "bookings" WHERE "property_id" IN (
      SELECT "id" FROM "properties" WHERE "host_id" = public.premura_host_id()
    )
  ));--> statement-breakpoint
DROP POLICY IF EXISTS "conversations_delete_own" ON "conversations";--> statement-breakpoint
CREATE POLICY "conversations_delete_own" ON "conversations" FOR DELETE TO authenticated
  USING ("booking_id" IN (
    SELECT "id" FROM "bookings" WHERE "property_id" IN (
      SELECT "id" FROM "properties" WHERE "host_id" = public.premura_host_id()
    )
  ));--> statement-breakpoint
DROP POLICY IF EXISTS "guest_quizzes_select_own" ON "guest_quizzes";--> statement-breakpoint
CREATE POLICY "guest_quizzes_select_own" ON "guest_quizzes" FOR SELECT TO authenticated
  USING ("booking_id" IN (
    SELECT "id" FROM "bookings" WHERE "property_id" IN (
      SELECT "id" FROM "properties" WHERE "host_id" = public.premura_host_id()
    )
  ));--> statement-breakpoint
DROP POLICY IF EXISTS "guest_quizzes_insert_own" ON "guest_quizzes";--> statement-breakpoint
CREATE POLICY "guest_quizzes_insert_own" ON "guest_quizzes" FOR INSERT TO authenticated
  WITH CHECK ("booking_id" IN (
    SELECT "id" FROM "bookings" WHERE "property_id" IN (
      SELECT "id" FROM "properties" WHERE "host_id" = public.premura_host_id()
    )
  ));--> statement-breakpoint
DROP POLICY IF EXISTS "guest_quizzes_update_own" ON "guest_quizzes";--> statement-breakpoint
CREATE POLICY "guest_quizzes_update_own" ON "guest_quizzes" FOR UPDATE TO authenticated
  USING ("booking_id" IN (
    SELECT "id" FROM "bookings" WHERE "property_id" IN (
      SELECT "id" FROM "properties" WHERE "host_id" = public.premura_host_id()
    )
  ))
  WITH CHECK ("booking_id" IN (
    SELECT "id" FROM "bookings" WHERE "property_id" IN (
      SELECT "id" FROM "properties" WHERE "host_id" = public.premura_host_id()
    )
  ));--> statement-breakpoint
DROP POLICY IF EXISTS "guest_quizzes_delete_own" ON "guest_quizzes";--> statement-breakpoint
CREATE POLICY "guest_quizzes_delete_own" ON "guest_quizzes" FOR DELETE TO authenticated
  USING ("booking_id" IN (
    SELECT "id" FROM "bookings" WHERE "property_id" IN (
      SELECT "id" FROM "properties" WHERE "host_id" = public.premura_host_id()
    )
  ));--> statement-breakpoint
DROP POLICY IF EXISTS "kits_select_own" ON "kits";--> statement-breakpoint
CREATE POLICY "kits_select_own" ON "kits" FOR SELECT TO authenticated
  USING ("booking_id" IN (
    SELECT "id" FROM "bookings" WHERE "property_id" IN (
      SELECT "id" FROM "properties" WHERE "host_id" = public.premura_host_id()
    )
  ));--> statement-breakpoint
DROP POLICY IF EXISTS "kits_insert_own" ON "kits";--> statement-breakpoint
CREATE POLICY "kits_insert_own" ON "kits" FOR INSERT TO authenticated
  WITH CHECK ("booking_id" IN (
    SELECT "id" FROM "bookings" WHERE "property_id" IN (
      SELECT "id" FROM "properties" WHERE "host_id" = public.premura_host_id()
    )
  ));--> statement-breakpoint
DROP POLICY IF EXISTS "kits_update_own" ON "kits";--> statement-breakpoint
CREATE POLICY "kits_update_own" ON "kits" FOR UPDATE TO authenticated
  USING ("booking_id" IN (
    SELECT "id" FROM "bookings" WHERE "property_id" IN (
      SELECT "id" FROM "properties" WHERE "host_id" = public.premura_host_id()
    )
  ))
  WITH CHECK ("booking_id" IN (
    SELECT "id" FROM "bookings" WHERE "property_id" IN (
      SELECT "id" FROM "properties" WHERE "host_id" = public.premura_host_id()
    )
  ));--> statement-breakpoint
DROP POLICY IF EXISTS "kits_delete_own" ON "kits";--> statement-breakpoint
CREATE POLICY "kits_delete_own" ON "kits" FOR DELETE TO authenticated
  USING ("booking_id" IN (
    SELECT "id" FROM "bookings" WHERE "property_id" IN (
      SELECT "id" FROM "properties" WHERE "host_id" = public.premura_host_id()
    )
  ));--> statement-breakpoint
DROP POLICY IF EXISTS "reviews_select_own" ON "reviews";--> statement-breakpoint
CREATE POLICY "reviews_select_own" ON "reviews" FOR SELECT TO authenticated
  USING ("booking_id" IN (
    SELECT "id" FROM "bookings" WHERE "property_id" IN (
      SELECT "id" FROM "properties" WHERE "host_id" = public.premura_host_id()
    )
  ));--> statement-breakpoint
DROP POLICY IF EXISTS "reviews_insert_own" ON "reviews";--> statement-breakpoint
CREATE POLICY "reviews_insert_own" ON "reviews" FOR INSERT TO authenticated
  WITH CHECK ("booking_id" IN (
    SELECT "id" FROM "bookings" WHERE "property_id" IN (
      SELECT "id" FROM "properties" WHERE "host_id" = public.premura_host_id()
    )
  ));--> statement-breakpoint
DROP POLICY IF EXISTS "reviews_update_own" ON "reviews";--> statement-breakpoint
CREATE POLICY "reviews_update_own" ON "reviews" FOR UPDATE TO authenticated
  USING ("booking_id" IN (
    SELECT "id" FROM "bookings" WHERE "property_id" IN (
      SELECT "id" FROM "properties" WHERE "host_id" = public.premura_host_id()
    )
  ))
  WITH CHECK ("booking_id" IN (
    SELECT "id" FROM "bookings" WHERE "property_id" IN (
      SELECT "id" FROM "properties" WHERE "host_id" = public.premura_host_id()
    )
  ));--> statement-breakpoint
DROP POLICY IF EXISTS "reviews_delete_own" ON "reviews";--> statement-breakpoint
CREATE POLICY "reviews_delete_own" ON "reviews" FOR DELETE TO authenticated
  USING ("booking_id" IN (
    SELECT "id" FROM "bookings" WHERE "property_id" IN (
      SELECT "id" FROM "properties" WHERE "host_id" = public.premura_host_id()
    )
  ));--> statement-breakpoint
DROP POLICY IF EXISTS "messages_select_own" ON "messages";--> statement-breakpoint
CREATE POLICY "messages_select_own" ON "messages" FOR SELECT TO authenticated
  USING (
    ("booking_id" IS NOT NULL AND "booking_id" IN (
      SELECT "id" FROM "bookings" WHERE "property_id" IN (
        SELECT "id" FROM "properties" WHERE "host_id" = public.premura_host_id()
      )
    ))
    OR
    ("conversation_id" IS NOT NULL AND "conversation_id" IN (
      SELECT "id" FROM "conversations" WHERE "booking_id" IN (
        SELECT "id" FROM "bookings" WHERE "property_id" IN (
          SELECT "id" FROM "properties" WHERE "host_id" = public.premura_host_id()
        )
      )
    ))
  );--> statement-breakpoint
DROP POLICY IF EXISTS "messages_insert_own" ON "messages";--> statement-breakpoint
CREATE POLICY "messages_insert_own" ON "messages" FOR INSERT TO authenticated
  WITH CHECK (
    ("booking_id" IS NOT NULL AND "booking_id" IN (
      SELECT "id" FROM "bookings" WHERE "property_id" IN (
        SELECT "id" FROM "properties" WHERE "host_id" = public.premura_host_id()
      )
    ))
    OR
    ("conversation_id" IS NOT NULL AND "conversation_id" IN (
      SELECT "id" FROM "conversations" WHERE "booking_id" IN (
        SELECT "id" FROM "bookings" WHERE "property_id" IN (
          SELECT "id" FROM "properties" WHERE "host_id" = public.premura_host_id()
        )
      )
    ))
  );--> statement-breakpoint
DROP POLICY IF EXISTS "messages_update_own" ON "messages";--> statement-breakpoint
CREATE POLICY "messages_update_own" ON "messages" FOR UPDATE TO authenticated
  USING (
    ("booking_id" IS NOT NULL AND "booking_id" IN (
      SELECT "id" FROM "bookings" WHERE "property_id" IN (
        SELECT "id" FROM "properties" WHERE "host_id" = public.premura_host_id()
      )
    ))
    OR
    ("conversation_id" IS NOT NULL AND "conversation_id" IN (
      SELECT "id" FROM "conversations" WHERE "booking_id" IN (
        SELECT "id" FROM "bookings" WHERE "property_id" IN (
          SELECT "id" FROM "properties" WHERE "host_id" = public.premura_host_id()
        )
      )
    ))
  )
  WITH CHECK (
    ("booking_id" IS NOT NULL AND "booking_id" IN (
      SELECT "id" FROM "bookings" WHERE "property_id" IN (
        SELECT "id" FROM "properties" WHERE "host_id" = public.premura_host_id()
      )
    ))
    OR
    ("conversation_id" IS NOT NULL AND "conversation_id" IN (
      SELECT "id" FROM "conversations" WHERE "booking_id" IN (
        SELECT "id" FROM "bookings" WHERE "property_id" IN (
          SELECT "id" FROM "properties" WHERE "host_id" = public.premura_host_id()
        )
      )
    ))
  );--> statement-breakpoint
DROP POLICY IF EXISTS "messages_delete_own" ON "messages";--> statement-breakpoint
CREATE POLICY "messages_delete_own" ON "messages" FOR DELETE TO authenticated
  USING (
    ("booking_id" IS NOT NULL AND "booking_id" IN (
      SELECT "id" FROM "bookings" WHERE "property_id" IN (
        SELECT "id" FROM "properties" WHERE "host_id" = public.premura_host_id()
      )
    ))
    OR
    ("conversation_id" IS NOT NULL AND "conversation_id" IN (
      SELECT "id" FROM "conversations" WHERE "booking_id" IN (
        SELECT "id" FROM "bookings" WHERE "property_id" IN (
          SELECT "id" FROM "properties" WHERE "host_id" = public.premura_host_id()
        )
      )
    ))
  );--> statement-breakpoint
DROP POLICY IF EXISTS "pending_payouts_select_own" ON "pending_payouts";--> statement-breakpoint
CREATE POLICY "pending_payouts_select_own" ON "pending_payouts" FOR SELECT TO authenticated
  USING ("cleaner_id" IN (SELECT "id" FROM "cleaners" WHERE "host_id" = public.premura_host_id()));--> statement-breakpoint
DROP POLICY IF EXISTS "pending_payouts_insert_own" ON "pending_payouts";--> statement-breakpoint
CREATE POLICY "pending_payouts_insert_own" ON "pending_payouts" FOR INSERT TO authenticated
  WITH CHECK ("cleaner_id" IN (SELECT "id" FROM "cleaners" WHERE "host_id" = public.premura_host_id()));--> statement-breakpoint
DROP POLICY IF EXISTS "pending_payouts_update_own" ON "pending_payouts";--> statement-breakpoint
CREATE POLICY "pending_payouts_update_own" ON "pending_payouts" FOR UPDATE TO authenticated
  USING ("cleaner_id" IN (SELECT "id" FROM "cleaners" WHERE "host_id" = public.premura_host_id()))
  WITH CHECK ("cleaner_id" IN (SELECT "id" FROM "cleaners" WHERE "host_id" = public.premura_host_id()));--> statement-breakpoint
DROP POLICY IF EXISTS "pending_payouts_delete_own" ON "pending_payouts";--> statement-breakpoint
CREATE POLICY "pending_payouts_delete_own" ON "pending_payouts" FOR DELETE TO authenticated
  USING ("cleaner_id" IN (SELECT "id" FROM "cleaners" WHERE "host_id" = public.premura_host_id()));--> statement-breakpoint
DROP POLICY IF EXISTS "local_partners_select_public_or_own" ON "local_partners";--> statement-breakpoint
CREATE POLICY "local_partners_select_public_or_own" ON "local_partners" FOR SELECT TO authenticated
  USING ("host_id" IS NULL OR "host_id" = public.premura_host_id());--> statement-breakpoint
DROP POLICY IF EXISTS "local_partners_insert_own" ON "local_partners";--> statement-breakpoint
CREATE POLICY "local_partners_insert_own" ON "local_partners" FOR INSERT TO authenticated
  WITH CHECK ("host_id" = public.premura_host_id());--> statement-breakpoint
DROP POLICY IF EXISTS "local_partners_update_own" ON "local_partners";--> statement-breakpoint
CREATE POLICY "local_partners_update_own" ON "local_partners" FOR UPDATE TO authenticated
  USING ("host_id" = public.premura_host_id())
  WITH CHECK ("host_id" = public.premura_host_id());--> statement-breakpoint
DROP POLICY IF EXISTS "local_partners_delete_own" ON "local_partners";--> statement-breakpoint
CREATE POLICY "local_partners_delete_own" ON "local_partners" FOR DELETE TO authenticated
  USING ("host_id" = public.premura_host_id());--> statement-breakpoint

-- ============================================================
-- property_knowledge (0014) riscritte allo stesso modo
-- ============================================================

DROP POLICY IF EXISTS "property_knowledge_select_own" ON "property_knowledge";--> statement-breakpoint
CREATE POLICY "property_knowledge_select_own" ON "property_knowledge"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "properties" p
      WHERE p."id" = "property_knowledge"."property_id"
        AND p."host_id" = public.premura_host_id()
    )
  );--> statement-breakpoint
DROP POLICY IF EXISTS "property_knowledge_insert_own" ON "property_knowledge";--> statement-breakpoint
CREATE POLICY "property_knowledge_insert_own" ON "property_knowledge"
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "properties" p
      WHERE p."id" = "property_knowledge"."property_id"
        AND p."host_id" = public.premura_host_id()
    )
  );--> statement-breakpoint
DROP POLICY IF EXISTS "property_knowledge_update_own" ON "property_knowledge";--> statement-breakpoint
CREATE POLICY "property_knowledge_update_own" ON "property_knowledge"
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM "properties" p
      WHERE p."id" = "property_knowledge"."property_id"
        AND p."host_id" = public.premura_host_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "properties" p
      WHERE p."id" = "property_knowledge"."property_id"
        AND p."host_id" = public.premura_host_id()
    )
  );--> statement-breakpoint
DROP POLICY IF EXISTS "property_knowledge_delete_own" ON "property_knowledge";--> statement-breakpoint
CREATE POLICY "property_knowledge_delete_own" ON "property_knowledge"
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM "properties" p
      WHERE p."id" = "property_knowledge"."property_id"
        AND p."host_id" = public.premura_host_id()
    )
  );--> statement-breakpoint
