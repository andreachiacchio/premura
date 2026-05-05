-- Slice 12: tabella property_knowledge.
--
-- Premura raccoglie qui tutte le info specifiche di una struttura
-- (codice keybox, WiFi, regole, contatti emergenza, essenziali nelle
-- vicinanze) che servono al Conversation Agent per rispondere
-- contestualizzato. Senza questa knowledge, draft generator (slice 11
-- futura) esce generico.
--
-- Drop di property_knowledge_base orphan: la tabella era stata creata
-- in migration 0000 ma non usata da nessun codice in apps/web o
-- apps/api. Nessun dato in produzione, drop sicuro. Schema TS dead
-- code rimosso da packages/db/src/schema/property-knowledge-base.ts.
--
-- Scope nuova tabella: 1:1 con properties. UNIQUE su property_id.
-- Ownership: via properties.host_id.
-- RLS: SELECT/UPDATE/INSERT/DELETE solo per host owner della property.

DROP TABLE IF EXISTS "property_knowledge_base" CASCADE;
--> statement-breakpoint

CREATE TABLE "property_knowledge" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "property_id" UUID NOT NULL UNIQUE
    REFERENCES "properties"("id") ON DELETE CASCADE,

  -- Sezioni knowledge (jsonb permissive, validate Zod lato app):
  --   keybox: { code, instructions, photoUrl? }
  --   wifi: { ssid, password, notes? }
  --   parking: { available, type, instructions }
  --   houseRules: { quietHoursStart, quietHoursEnd, smokingAllowed,
  --                 petsAllowed, additionalNotes }
  --   emergencyContacts: [{ name, phone, role }]
  --   nearbyEssentials: [{ category, name, address, distanceM }]
  "keybox" JSONB,
  "wifi" JSONB,
  "parking" JSONB,
  "house_rules" JSONB,
  "emergency_contacts" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "nearby_essentials" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "additional_info" TEXT,

  "updated_by" UUID REFERENCES "hosts"("id") ON DELETE SET NULL,
  "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
--> statement-breakpoint

CREATE INDEX "property_knowledge_property_idx" ON "property_knowledge" ("property_id");
--> statement-breakpoint

ALTER TABLE "property_knowledge" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY "property_knowledge_select_own" ON "property_knowledge"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "properties" p
      WHERE p."id" = "property_knowledge"."property_id"
        AND p."host_id" = auth.uid()
    )
  );
--> statement-breakpoint

CREATE POLICY "property_knowledge_insert_own" ON "property_knowledge"
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "properties" p
      WHERE p."id" = "property_knowledge"."property_id"
        AND p."host_id" = auth.uid()
    )
  );
--> statement-breakpoint

CREATE POLICY "property_knowledge_update_own" ON "property_knowledge"
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM "properties" p
      WHERE p."id" = "property_knowledge"."property_id"
        AND p."host_id" = auth.uid()
    )
  );
--> statement-breakpoint

CREATE POLICY "property_knowledge_delete_own" ON "property_knowledge"
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM "properties" p
      WHERE p."id" = "property_knowledge"."property_id"
        AND p."host_id" = auth.uid()
    )
  );
