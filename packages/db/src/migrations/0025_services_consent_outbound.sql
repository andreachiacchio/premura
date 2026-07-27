-- Modulo servizi extra + consenso WhatsApp + invii automatici.
--
-- Introduce:
--  1. services / service_inquiries — catalogo servizi property-scoped
--     con doppio prezzo (costo fornitore + prezzo di vendita) e
--     tracking dei lead. Unica fonte di verita' sui prezzi.
--  2. guest_consent_events — registro append-only dei consensi
--     WhatsApp, prova GDPR con testo accettato e timestamp.
--  3. outbound_sends — slot di invio per (booking, trigger) con
--     vincolo UNIQUE: e' il lucchetto anti doppio invio.
--  4. conversation_handover — sospensione delle risposte automatiche
--     su un numero quando risponde un umano.
--  5. bookings.whatsapp_opt_in_at / _revoked_at — cache denormalizzata
--     dello stato consenso per le query dello scheduler.
--
-- Nota sugli enum: CREATE TYPE non supporta IF NOT EXISTS, quindi
-- ognuno e' avvolto in un blocco DO che ignora duplicate_object. Serve
-- perche' alcune migration di questo progetto sono state applicate a
-- mano su Supabase (vedi scripts/migrate.ts, DEBT-1) e la rieseguibilita'
-- e' l'unica difesa contro uno stato divergente.

DO $$ BEGIN
  CREATE TYPE "public"."service_category" AS ENUM('boat_tour', 'transfer', 'chef', 'cleaning', 'wellness', 'rental', 'food_delivery', 'other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE "public"."service_inquiry_source" AS ENUM('catalog_cta', 'whatsapp_inbound', 'manual');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE "public"."consent_action" AS ENUM('grant', 'revoke');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE "public"."consent_source" AS ENUM('guest_form', 'admin_panel', 'whatsapp_reply', 'import_csv');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE "public"."outbound_trigger" AS ENUM('welcome', 'midstay', 'checkout');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE "public"."outbound_send_status" AS ENUM('reserved', 'sent', 'failed', 'skipped');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

-- ─── 1. Catalogo servizi ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"slug" varchar(64) NOT NULL,
	"category" "service_category" NOT NULL,
	"title_en" varchar(160) NOT NULL,
	"title_it" varchar(160),
	"description_en" text,
	"description_it" text,
	"photo_url" text,
	"supplier_cost_eur" numeric(10, 2),
	"sale_price_eur" numeric(10, 2),
	"price_on_request" boolean DEFAULT false NOT NULL,
	"price_unit_en" varchar(64),
	"price_unit_it" varchar(64),
	"supplier_name" varchar(160),
	"supplier_notes" text,
	"duration_label_en" varchar(120),
	"duration_label_it" varchar(120),
	"sort_order" integer DEFAULT 100 NOT NULL,
	"is_featured" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "service_inquiries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_id" uuid NOT NULL,
	"booking_id" uuid,
	"source" "service_inquiry_source" NOT NULL,
	"quoted_price_eur" numeric(10, 2),
	"notes" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- ─── 2. Registro consensi (append-only) ───────────────────────────

CREATE TABLE IF NOT EXISTS "guest_consent_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"action" "consent_action" NOT NULL,
	"source" "consent_source" NOT NULL,
	"phone_e164" varchar(20),
	"consent_text_version" varchar(64),
	"ip_hash" varchar(64),
	"user_agent" varchar(255),
	"recorded_by_host_id" uuid,
	"notes" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- ─── 3. Slot di invio (lucchetto anti doppio invio) ───────────────

CREATE TABLE IF NOT EXISTS "outbound_sends" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"trigger" "outbound_trigger" NOT NULL,
	"status" "outbound_send_status" DEFAULT 'reserved' NOT NULL,
	"phone_e164" varchar(20) NOT NULL,
	"dry_run" boolean DEFAULT true NOT NULL,
	"phone_on_whatsapp" boolean,
	"template_key" varchar(64),
	"language" varchar(8),
	"message_id" uuid,
	"provider_message_id" varchar(128),
	"jitter_applied_ms" integer,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"reserved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint

-- ─── 4. Handover umano ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "conversation_handover" (
	"phone_e164" varchar(20) PRIMARY KEY NOT NULL,
	"until" timestamp with time zone NOT NULL,
	"reason" varchar(32) NOT NULL,
	"booking_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- ─── 5. Cache stato consenso su bookings ──────────────────────────

ALTER TABLE "bookings"
  ADD COLUMN IF NOT EXISTS "whatsapp_opt_in_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "whatsapp_opt_in_revoked_at" timestamp with time zone;
--> statement-breakpoint

-- ─── Foreign keys ─────────────────────────────────────────────────

DO $$ BEGIN
  ALTER TABLE "services" ADD CONSTRAINT "services_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "service_inquiries" ADD CONSTRAINT "service_inquiries_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "service_inquiries" ADD CONSTRAINT "service_inquiries_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "guest_consent_events" ADD CONSTRAINT "guest_consent_events_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "outbound_sends" ADD CONSTRAINT "outbound_sends_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "outbound_sends" ADD CONSTRAINT "outbound_sends_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "conversation_handover" ADD CONSTRAINT "conversation_handover_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

-- ─── Indici ───────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS "services_property_idx" ON "services" ("property_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "services_property_slug_uniq" ON "services" ("property_id", "slug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "services_category_idx" ON "services" ("category");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "services_property_active_idx" ON "services" ("property_id", "is_active", "sort_order");--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "service_inquiries_service_idx" ON "service_inquiries" ("service_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "service_inquiries_booking_idx" ON "service_inquiries" ("booking_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "service_inquiries_occurred_at_idx" ON "service_inquiries" ("occurred_at");--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "guest_consent_events_booking_idx" ON "guest_consent_events" ("booking_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "guest_consent_events_booking_occurred_idx" ON "guest_consent_events" ("booking_id", "occurred_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "guest_consent_events_phone_idx" ON "guest_consent_events" ("phone_e164");--> statement-breakpoint

-- IL VINCOLO: un solo invio per (prenotazione, trigger).
CREATE UNIQUE INDEX IF NOT EXISTS "outbound_sends_booking_trigger_uniq" ON "outbound_sends" ("booking_id", "trigger");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "outbound_sends_status_idx" ON "outbound_sends" ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "outbound_sends_sent_at_idx" ON "outbound_sends" ("sent_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "outbound_sends_dry_run_idx" ON "outbound_sends" ("dry_run", "sent_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "outbound_sends_phone_idx" ON "outbound_sends" ("phone_e164");--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "conversation_handover_until_idx" ON "conversation_handover" ("until");
