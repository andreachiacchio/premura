-- Fornitori di SERVIZI per gli ospiti (Antonio col gozzo, transfer,
-- chef) + collegamento alle strutture che servono.
--
-- Da non confondere con local_partners (fornitori del KIT fisico, usati
-- dal Kit Composer): qui l'agente instrada le richieste degli ospiti e
-- conversa col fornitore su WhatsApp.
--
--  - service_tags: array dell'enum service_category già esistente — il
--    routing è deterministico, la categoria richiesta seleziona i
--    provider col tag, nessuna scelta del modello.
--  - agent_description: contesto per Claude quando scrive al fornitore
--    (chi è, cosa chiedergli, i suoi limiti).
--  - typical_response_minutes / min_notice_hours: alimentano i timeout
--    ("Antonio di solito risponde in 30 min, sono passate 2 ore →
--    escalation all'host").
--  - phone nullable: censire un provider prima di avere il numero è
--    lecito, instradarlo senza numero no (guardia in-app).
--
-- Riapplicabile senza danni: IF NOT EXISTS ovunque, enum con guardia
-- duplicate_object (CREATE TYPE non supporta IF NOT EXISTS).

DO $$ BEGIN
  CREATE TYPE "public"."provider_status" AS ENUM('active', 'suspended');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "providers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "host_id" uuid NOT NULL REFERENCES "hosts"("id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "phone" varchar(32),
  "status" "provider_status" NOT NULL DEFAULT 'active',
  "service_tags" "service_category"[] NOT NULL DEFAULT '{}',
  "agent_description" text NOT NULL,
  "typical_response_minutes" integer,
  "min_notice_hours" integer,
  "notes" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "providers_host_idx" ON "providers" ("host_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "providers_status_idx" ON "providers" ("status");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "provider_properties" (
  "provider_id" uuid NOT NULL REFERENCES "providers"("id") ON DELETE CASCADE,
  "property_id" uuid NOT NULL REFERENCES "properties"("id") ON DELETE CASCADE,
  PRIMARY KEY ("provider_id", "property_id")
);
--> statement-breakpoint

-- RLS attiva come su cleaners/local_partners: l'app passa dalla
-- connessione owner (non ne è toccata), PostgREST anon resta fuori.
ALTER TABLE "providers" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "provider_properties" ENABLE ROW LEVEL SECURITY;
