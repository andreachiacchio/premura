-- Slice 6: ENABLE ROW LEVEL SECURITY + policy multi-tenant scoped a auth.uid().
--
-- Tutte le policy "per-host" usano TO authenticated: anon ha auth.uid() = NULL
-- quindi i check fallirebbero comunque, ma TO authenticated rende l'intento
-- esplicito al lettore. Service role bypassa RLS by design (worker iCal,
-- parser email, Gmail sync, script admin).
--
-- 3 pattern standardizzati:
--   A. Diretta su host_id
--   B. Indiretta via properties (1 livello)
--   C. Indiretta via bookings -> properties (2 livelli)
--
-- Casi speciali: hosts (PK), messages (OR booking_id/conversation_id),
-- local_partners (read public + write own), pending_payouts (via cleaners),
-- waitlist (INSERT-only public).
--
-- UPDATE policy hanno SEMPRE sia USING che WITH CHECK con stessa espressione,
-- per impedire row migration tra domini (un host non puo' modificare una
-- riga in modo che cessi di appartenergli).

-- ============================================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE "hosts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "properties" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "bookings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "guest_profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "cleaners" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "host_voice_profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "autopilot_rules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "pending_drafts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "agent_actions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "booking_email_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "gmail_sync_jobs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "google_tokens" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "conversations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "guest_quizzes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "kits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "reviews" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "property_knowledge_base" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "pending_payouts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "local_partners" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "waitlist" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

-- ============================================================
-- hosts: PK = auth.uid(). Solo SELECT + UPDATE.
-- INSERT (signup trigger) e DELETE (chiusura account) restano service role.
-- ============================================================

CREATE POLICY "hosts_select_own" ON "hosts" FOR SELECT TO authenticated
  USING ("id" = auth.uid());--> statement-breakpoint
CREATE POLICY "hosts_update_own" ON "hosts" FOR UPDATE TO authenticated
  USING ("id" = auth.uid())
  WITH CHECK ("id" = auth.uid());--> statement-breakpoint

-- ============================================================
-- Pattern A: catena diretta su host_id
-- ============================================================

-- properties --------------------------------------------------
CREATE POLICY "properties_select_own" ON "properties" FOR SELECT TO authenticated
  USING ("host_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "properties_insert_own" ON "properties" FOR INSERT TO authenticated
  WITH CHECK ("host_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "properties_update_own" ON "properties" FOR UPDATE TO authenticated
  USING ("host_id" = auth.uid())
  WITH CHECK ("host_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "properties_delete_own" ON "properties" FOR DELETE TO authenticated
  USING ("host_id" = auth.uid());--> statement-breakpoint

-- guest_profiles ----------------------------------------------
CREATE POLICY "guest_profiles_select_own" ON "guest_profiles" FOR SELECT TO authenticated
  USING ("host_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "guest_profiles_insert_own" ON "guest_profiles" FOR INSERT TO authenticated
  WITH CHECK ("host_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "guest_profiles_update_own" ON "guest_profiles" FOR UPDATE TO authenticated
  USING ("host_id" = auth.uid())
  WITH CHECK ("host_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "guest_profiles_delete_own" ON "guest_profiles" FOR DELETE TO authenticated
  USING ("host_id" = auth.uid());--> statement-breakpoint

-- cleaners ----------------------------------------------------
CREATE POLICY "cleaners_select_own" ON "cleaners" FOR SELECT TO authenticated
  USING ("host_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "cleaners_insert_own" ON "cleaners" FOR INSERT TO authenticated
  WITH CHECK ("host_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "cleaners_update_own" ON "cleaners" FOR UPDATE TO authenticated
  USING ("host_id" = auth.uid())
  WITH CHECK ("host_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "cleaners_delete_own" ON "cleaners" FOR DELETE TO authenticated
  USING ("host_id" = auth.uid());--> statement-breakpoint

-- host_voice_profiles -----------------------------------------
CREATE POLICY "host_voice_profiles_select_own" ON "host_voice_profiles" FOR SELECT TO authenticated
  USING ("host_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "host_voice_profiles_insert_own" ON "host_voice_profiles" FOR INSERT TO authenticated
  WITH CHECK ("host_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "host_voice_profiles_update_own" ON "host_voice_profiles" FOR UPDATE TO authenticated
  USING ("host_id" = auth.uid())
  WITH CHECK ("host_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "host_voice_profiles_delete_own" ON "host_voice_profiles" FOR DELETE TO authenticated
  USING ("host_id" = auth.uid());--> statement-breakpoint

-- autopilot_rules ---------------------------------------------
CREATE POLICY "autopilot_rules_select_own" ON "autopilot_rules" FOR SELECT TO authenticated
  USING ("host_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "autopilot_rules_insert_own" ON "autopilot_rules" FOR INSERT TO authenticated
  WITH CHECK ("host_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "autopilot_rules_update_own" ON "autopilot_rules" FOR UPDATE TO authenticated
  USING ("host_id" = auth.uid())
  WITH CHECK ("host_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "autopilot_rules_delete_own" ON "autopilot_rules" FOR DELETE TO authenticated
  USING ("host_id" = auth.uid());--> statement-breakpoint

-- pending_drafts ----------------------------------------------
CREATE POLICY "pending_drafts_select_own" ON "pending_drafts" FOR SELECT TO authenticated
  USING ("host_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "pending_drafts_insert_own" ON "pending_drafts" FOR INSERT TO authenticated
  WITH CHECK ("host_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "pending_drafts_update_own" ON "pending_drafts" FOR UPDATE TO authenticated
  USING ("host_id" = auth.uid())
  WITH CHECK ("host_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "pending_drafts_delete_own" ON "pending_drafts" FOR DELETE TO authenticated
  USING ("host_id" = auth.uid());--> statement-breakpoint

-- agent_actions -----------------------------------------------
CREATE POLICY "agent_actions_select_own" ON "agent_actions" FOR SELECT TO authenticated
  USING ("host_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "agent_actions_insert_own" ON "agent_actions" FOR INSERT TO authenticated
  WITH CHECK ("host_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "agent_actions_update_own" ON "agent_actions" FOR UPDATE TO authenticated
  USING ("host_id" = auth.uid())
  WITH CHECK ("host_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "agent_actions_delete_own" ON "agent_actions" FOR DELETE TO authenticated
  USING ("host_id" = auth.uid());--> statement-breakpoint

-- booking_email_events ----------------------------------------
CREATE POLICY "booking_email_events_select_own" ON "booking_email_events" FOR SELECT TO authenticated
  USING ("host_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "booking_email_events_insert_own" ON "booking_email_events" FOR INSERT TO authenticated
  WITH CHECK ("host_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "booking_email_events_update_own" ON "booking_email_events" FOR UPDATE TO authenticated
  USING ("host_id" = auth.uid())
  WITH CHECK ("host_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "booking_email_events_delete_own" ON "booking_email_events" FOR DELETE TO authenticated
  USING ("host_id" = auth.uid());--> statement-breakpoint

-- gmail_sync_jobs ---------------------------------------------
CREATE POLICY "gmail_sync_jobs_select_own" ON "gmail_sync_jobs" FOR SELECT TO authenticated
  USING ("host_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "gmail_sync_jobs_insert_own" ON "gmail_sync_jobs" FOR INSERT TO authenticated
  WITH CHECK ("host_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "gmail_sync_jobs_update_own" ON "gmail_sync_jobs" FOR UPDATE TO authenticated
  USING ("host_id" = auth.uid())
  WITH CHECK ("host_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "gmail_sync_jobs_delete_own" ON "gmail_sync_jobs" FOR DELETE TO authenticated
  USING ("host_id" = auth.uid());--> statement-breakpoint

-- google_tokens -----------------------------------------------
CREATE POLICY "google_tokens_select_own" ON "google_tokens" FOR SELECT TO authenticated
  USING ("host_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "google_tokens_insert_own" ON "google_tokens" FOR INSERT TO authenticated
  WITH CHECK ("host_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "google_tokens_update_own" ON "google_tokens" FOR UPDATE TO authenticated
  USING ("host_id" = auth.uid())
  WITH CHECK ("host_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "google_tokens_delete_own" ON "google_tokens" FOR DELETE TO authenticated
  USING ("host_id" = auth.uid());--> statement-breakpoint

-- ============================================================
-- Pattern B: indiretta via properties (1 livello)
-- ============================================================

-- bookings ----------------------------------------------------
CREATE POLICY "bookings_select_own" ON "bookings" FOR SELECT TO authenticated
  USING ("property_id" IN (SELECT "id" FROM "properties" WHERE "host_id" = auth.uid()));--> statement-breakpoint
CREATE POLICY "bookings_insert_own" ON "bookings" FOR INSERT TO authenticated
  WITH CHECK ("property_id" IN (SELECT "id" FROM "properties" WHERE "host_id" = auth.uid()));--> statement-breakpoint
CREATE POLICY "bookings_update_own" ON "bookings" FOR UPDATE TO authenticated
  USING ("property_id" IN (SELECT "id" FROM "properties" WHERE "host_id" = auth.uid()))
  WITH CHECK ("property_id" IN (SELECT "id" FROM "properties" WHERE "host_id" = auth.uid()));--> statement-breakpoint
CREATE POLICY "bookings_delete_own" ON "bookings" FOR DELETE TO authenticated
  USING ("property_id" IN (SELECT "id" FROM "properties" WHERE "host_id" = auth.uid()));--> statement-breakpoint

-- property_knowledge_base -------------------------------------
CREATE POLICY "property_knowledge_base_select_own" ON "property_knowledge_base" FOR SELECT TO authenticated
  USING ("property_id" IN (SELECT "id" FROM "properties" WHERE "host_id" = auth.uid()));--> statement-breakpoint
CREATE POLICY "property_knowledge_base_insert_own" ON "property_knowledge_base" FOR INSERT TO authenticated
  WITH CHECK ("property_id" IN (SELECT "id" FROM "properties" WHERE "host_id" = auth.uid()));--> statement-breakpoint
CREATE POLICY "property_knowledge_base_update_own" ON "property_knowledge_base" FOR UPDATE TO authenticated
  USING ("property_id" IN (SELECT "id" FROM "properties" WHERE "host_id" = auth.uid()))
  WITH CHECK ("property_id" IN (SELECT "id" FROM "properties" WHERE "host_id" = auth.uid()));--> statement-breakpoint
CREATE POLICY "property_knowledge_base_delete_own" ON "property_knowledge_base" FOR DELETE TO authenticated
  USING ("property_id" IN (SELECT "id" FROM "properties" WHERE "host_id" = auth.uid()));--> statement-breakpoint

-- ============================================================
-- Pattern C: indiretta via bookings -> properties (2 livelli)
-- ============================================================

-- conversations -----------------------------------------------
CREATE POLICY "conversations_select_own" ON "conversations" FOR SELECT TO authenticated
  USING ("booking_id" IN (
    SELECT "id" FROM "bookings" WHERE "property_id" IN (
      SELECT "id" FROM "properties" WHERE "host_id" = auth.uid()
    )
  ));--> statement-breakpoint
CREATE POLICY "conversations_insert_own" ON "conversations" FOR INSERT TO authenticated
  WITH CHECK ("booking_id" IN (
    SELECT "id" FROM "bookings" WHERE "property_id" IN (
      SELECT "id" FROM "properties" WHERE "host_id" = auth.uid()
    )
  ));--> statement-breakpoint
CREATE POLICY "conversations_update_own" ON "conversations" FOR UPDATE TO authenticated
  USING ("booking_id" IN (
    SELECT "id" FROM "bookings" WHERE "property_id" IN (
      SELECT "id" FROM "properties" WHERE "host_id" = auth.uid()
    )
  ))
  WITH CHECK ("booking_id" IN (
    SELECT "id" FROM "bookings" WHERE "property_id" IN (
      SELECT "id" FROM "properties" WHERE "host_id" = auth.uid()
    )
  ));--> statement-breakpoint
CREATE POLICY "conversations_delete_own" ON "conversations" FOR DELETE TO authenticated
  USING ("booking_id" IN (
    SELECT "id" FROM "bookings" WHERE "property_id" IN (
      SELECT "id" FROM "properties" WHERE "host_id" = auth.uid()
    )
  ));--> statement-breakpoint

-- guest_quizzes -----------------------------------------------
CREATE POLICY "guest_quizzes_select_own" ON "guest_quizzes" FOR SELECT TO authenticated
  USING ("booking_id" IN (
    SELECT "id" FROM "bookings" WHERE "property_id" IN (
      SELECT "id" FROM "properties" WHERE "host_id" = auth.uid()
    )
  ));--> statement-breakpoint
CREATE POLICY "guest_quizzes_insert_own" ON "guest_quizzes" FOR INSERT TO authenticated
  WITH CHECK ("booking_id" IN (
    SELECT "id" FROM "bookings" WHERE "property_id" IN (
      SELECT "id" FROM "properties" WHERE "host_id" = auth.uid()
    )
  ));--> statement-breakpoint
CREATE POLICY "guest_quizzes_update_own" ON "guest_quizzes" FOR UPDATE TO authenticated
  USING ("booking_id" IN (
    SELECT "id" FROM "bookings" WHERE "property_id" IN (
      SELECT "id" FROM "properties" WHERE "host_id" = auth.uid()
    )
  ))
  WITH CHECK ("booking_id" IN (
    SELECT "id" FROM "bookings" WHERE "property_id" IN (
      SELECT "id" FROM "properties" WHERE "host_id" = auth.uid()
    )
  ));--> statement-breakpoint
CREATE POLICY "guest_quizzes_delete_own" ON "guest_quizzes" FOR DELETE TO authenticated
  USING ("booking_id" IN (
    SELECT "id" FROM "bookings" WHERE "property_id" IN (
      SELECT "id" FROM "properties" WHERE "host_id" = auth.uid()
    )
  ));--> statement-breakpoint

-- kits --------------------------------------------------------
CREATE POLICY "kits_select_own" ON "kits" FOR SELECT TO authenticated
  USING ("booking_id" IN (
    SELECT "id" FROM "bookings" WHERE "property_id" IN (
      SELECT "id" FROM "properties" WHERE "host_id" = auth.uid()
    )
  ));--> statement-breakpoint
CREATE POLICY "kits_insert_own" ON "kits" FOR INSERT TO authenticated
  WITH CHECK ("booking_id" IN (
    SELECT "id" FROM "bookings" WHERE "property_id" IN (
      SELECT "id" FROM "properties" WHERE "host_id" = auth.uid()
    )
  ));--> statement-breakpoint
CREATE POLICY "kits_update_own" ON "kits" FOR UPDATE TO authenticated
  USING ("booking_id" IN (
    SELECT "id" FROM "bookings" WHERE "property_id" IN (
      SELECT "id" FROM "properties" WHERE "host_id" = auth.uid()
    )
  ))
  WITH CHECK ("booking_id" IN (
    SELECT "id" FROM "bookings" WHERE "property_id" IN (
      SELECT "id" FROM "properties" WHERE "host_id" = auth.uid()
    )
  ));--> statement-breakpoint
CREATE POLICY "kits_delete_own" ON "kits" FOR DELETE TO authenticated
  USING ("booking_id" IN (
    SELECT "id" FROM "bookings" WHERE "property_id" IN (
      SELECT "id" FROM "properties" WHERE "host_id" = auth.uid()
    )
  ));--> statement-breakpoint

-- reviews -----------------------------------------------------
CREATE POLICY "reviews_select_own" ON "reviews" FOR SELECT TO authenticated
  USING ("booking_id" IN (
    SELECT "id" FROM "bookings" WHERE "property_id" IN (
      SELECT "id" FROM "properties" WHERE "host_id" = auth.uid()
    )
  ));--> statement-breakpoint
CREATE POLICY "reviews_insert_own" ON "reviews" FOR INSERT TO authenticated
  WITH CHECK ("booking_id" IN (
    SELECT "id" FROM "bookings" WHERE "property_id" IN (
      SELECT "id" FROM "properties" WHERE "host_id" = auth.uid()
    )
  ));--> statement-breakpoint
CREATE POLICY "reviews_update_own" ON "reviews" FOR UPDATE TO authenticated
  USING ("booking_id" IN (
    SELECT "id" FROM "bookings" WHERE "property_id" IN (
      SELECT "id" FROM "properties" WHERE "host_id" = auth.uid()
    )
  ))
  WITH CHECK ("booking_id" IN (
    SELECT "id" FROM "bookings" WHERE "property_id" IN (
      SELECT "id" FROM "properties" WHERE "host_id" = auth.uid()
    )
  ));--> statement-breakpoint
CREATE POLICY "reviews_delete_own" ON "reviews" FOR DELETE TO authenticated
  USING ("booking_id" IN (
    SELECT "id" FROM "bookings" WHERE "property_id" IN (
      SELECT "id" FROM "properties" WHERE "host_id" = auth.uid()
    )
  ));--> statement-breakpoint

-- ============================================================
-- messages: catena difensiva con OR su booking_id e conversation_id.
-- Entrambi nullable: i messaggi system (booking_id null e conversation_id
-- null) restano invisibili agli host - service role only.
-- ============================================================

CREATE POLICY "messages_select_own" ON "messages" FOR SELECT TO authenticated
  USING (
    ("booking_id" IS NOT NULL AND "booking_id" IN (
      SELECT "id" FROM "bookings" WHERE "property_id" IN (
        SELECT "id" FROM "properties" WHERE "host_id" = auth.uid()
      )
    ))
    OR
    ("conversation_id" IS NOT NULL AND "conversation_id" IN (
      SELECT "id" FROM "conversations" WHERE "booking_id" IN (
        SELECT "id" FROM "bookings" WHERE "property_id" IN (
          SELECT "id" FROM "properties" WHERE "host_id" = auth.uid()
        )
      )
    ))
  );--> statement-breakpoint
CREATE POLICY "messages_insert_own" ON "messages" FOR INSERT TO authenticated
  WITH CHECK (
    ("booking_id" IS NOT NULL AND "booking_id" IN (
      SELECT "id" FROM "bookings" WHERE "property_id" IN (
        SELECT "id" FROM "properties" WHERE "host_id" = auth.uid()
      )
    ))
    OR
    ("conversation_id" IS NOT NULL AND "conversation_id" IN (
      SELECT "id" FROM "conversations" WHERE "booking_id" IN (
        SELECT "id" FROM "bookings" WHERE "property_id" IN (
          SELECT "id" FROM "properties" WHERE "host_id" = auth.uid()
        )
      )
    ))
  );--> statement-breakpoint
CREATE POLICY "messages_update_own" ON "messages" FOR UPDATE TO authenticated
  USING (
    ("booking_id" IS NOT NULL AND "booking_id" IN (
      SELECT "id" FROM "bookings" WHERE "property_id" IN (
        SELECT "id" FROM "properties" WHERE "host_id" = auth.uid()
      )
    ))
    OR
    ("conversation_id" IS NOT NULL AND "conversation_id" IN (
      SELECT "id" FROM "conversations" WHERE "booking_id" IN (
        SELECT "id" FROM "bookings" WHERE "property_id" IN (
          SELECT "id" FROM "properties" WHERE "host_id" = auth.uid()
        )
      )
    ))
  )
  WITH CHECK (
    ("booking_id" IS NOT NULL AND "booking_id" IN (
      SELECT "id" FROM "bookings" WHERE "property_id" IN (
        SELECT "id" FROM "properties" WHERE "host_id" = auth.uid()
      )
    ))
    OR
    ("conversation_id" IS NOT NULL AND "conversation_id" IN (
      SELECT "id" FROM "conversations" WHERE "booking_id" IN (
        SELECT "id" FROM "bookings" WHERE "property_id" IN (
          SELECT "id" FROM "properties" WHERE "host_id" = auth.uid()
        )
      )
    ))
  );--> statement-breakpoint
CREATE POLICY "messages_delete_own" ON "messages" FOR DELETE TO authenticated
  USING (
    ("booking_id" IS NOT NULL AND "booking_id" IN (
      SELECT "id" FROM "bookings" WHERE "property_id" IN (
        SELECT "id" FROM "properties" WHERE "host_id" = auth.uid()
      )
    ))
    OR
    ("conversation_id" IS NOT NULL AND "conversation_id" IN (
      SELECT "id" FROM "conversations" WHERE "booking_id" IN (
        SELECT "id" FROM "bookings" WHERE "property_id" IN (
          SELECT "id" FROM "properties" WHERE "host_id" = auth.uid()
        )
      )
    ))
  );--> statement-breakpoint

-- ============================================================
-- pending_payouts: catena via cleaners (cleaner_id NOT NULL nello schema).
-- ============================================================

CREATE POLICY "pending_payouts_select_own" ON "pending_payouts" FOR SELECT TO authenticated
  USING ("cleaner_id" IN (SELECT "id" FROM "cleaners" WHERE "host_id" = auth.uid()));--> statement-breakpoint
CREATE POLICY "pending_payouts_insert_own" ON "pending_payouts" FOR INSERT TO authenticated
  WITH CHECK ("cleaner_id" IN (SELECT "id" FROM "cleaners" WHERE "host_id" = auth.uid()));--> statement-breakpoint
CREATE POLICY "pending_payouts_update_own" ON "pending_payouts" FOR UPDATE TO authenticated
  USING ("cleaner_id" IN (SELECT "id" FROM "cleaners" WHERE "host_id" = auth.uid()))
  WITH CHECK ("cleaner_id" IN (SELECT "id" FROM "cleaners" WHERE "host_id" = auth.uid()));--> statement-breakpoint
CREATE POLICY "pending_payouts_delete_own" ON "pending_payouts" FOR DELETE TO authenticated
  USING ("cleaner_id" IN (SELECT "id" FROM "cleaners" WHERE "host_id" = auth.uid()));--> statement-breakpoint

-- ============================================================
-- local_partners: read public-or-own, write only own.
-- I partner pubblici (host_id NULL) sono curatela editoriale di Premura,
-- gestiti via service role / admin. Gli host non possono ne' creare ne'
-- modificare partner pubblici dall'app.
-- ============================================================

CREATE POLICY "local_partners_select_public_or_own" ON "local_partners" FOR SELECT TO authenticated
  USING ("host_id" IS NULL OR "host_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "local_partners_insert_own" ON "local_partners" FOR INSERT TO authenticated
  WITH CHECK ("host_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "local_partners_update_own" ON "local_partners" FOR UPDATE TO authenticated
  USING ("host_id" = auth.uid())
  WITH CHECK ("host_id" = auth.uid());--> statement-breakpoint
CREATE POLICY "local_partners_delete_own" ON "local_partners" FOR DELETE TO authenticated
  USING ("host_id" = auth.uid());--> statement-breakpoint

-- ============================================================
-- waitlist: signup landing pubblico. Solo INSERT per anon/authenticated,
-- niente SELECT/UPDATE/DELETE policy: la lista resta opaca al pubblico,
-- service role legge per dashboard admin / export marketing.
-- ============================================================

CREATE POLICY "waitlist_insert_anon" ON "waitlist" FOR INSERT TO anon, authenticated
  WITH CHECK (true);--> statement-breakpoint
