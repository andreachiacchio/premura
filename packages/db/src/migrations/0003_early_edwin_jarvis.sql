CREATE TYPE "public"."gmail_sync_job_status" AS ENUM('running', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "gmail_sync_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"host_id" uuid NOT NULL,
	"google_email" varchar(255) NOT NULL,
	"status" "gmail_sync_job_status" DEFAULT 'running' NOT NULL,
	"total_emails" integer DEFAULT 0 NOT NULL,
	"processed_emails" integer DEFAULT 0 NOT NULL,
	"enriched_count" integer DEFAULT 0 NOT NULL,
	"created_count" integer DEFAULT 0 NOT NULL,
	"skipped_past" integer DEFAULT 0 NOT NULL,
	"skipped_no_match" integer DEFAULT 0 NOT NULL,
	"skipped_not_confirmation" integer DEFAULT 0 NOT NULL,
	"cancelled_count" integer DEFAULT 0 NOT NULL,
	"guest_profiles_created" integer DEFAULT 0 NOT NULL,
	"guest_profiles_updated" integer DEFAULT 0 NOT NULL,
	"error_log" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"fatal_error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "guest_profiles" DROP CONSTRAINT "guest_profiles_booking_id_unique";--> statement-breakpoint
ALTER TABLE "guest_profiles" DROP CONSTRAINT "guest_profiles_booking_id_bookings_id_fk";
--> statement-breakpoint
ALTER TABLE "guest_profiles" ALTER COLUMN "booking_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "guest_profiles" ALTER COLUMN "archetype" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "guest_profiles" ALTER COLUMN "archetype_description" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "guest_profiles" ALTER COLUMN "signals" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "guest_profiles" ALTER COLUMN "risks" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "guest_profiles" ALTER COLUMN "confidence" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "booking_external_code" varchar(64);--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "guest_first_name" varchar(128);--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "guest_language" varchar(8);--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "guest_message_original" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "guest_message_lang" varchar(8);--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "host_payout_amount" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "host_payout_currency" varchar(3);--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "listing_url" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "raw_email_id" varchar(128);--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "last_email_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "guest_profile_id" uuid;--> statement-breakpoint
ALTER TABLE "guest_profiles" ADD COLUMN "host_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "guest_profiles" ADD COLUMN "full_name" varchar(255) NOT NULL;--> statement-breakpoint
ALTER TABLE "guest_profiles" ADD COLUMN "first_name" varchar(128);--> statement-breakpoint
ALTER TABLE "guest_profiles" ADD COLUMN "country_code" varchar(2);--> statement-breakpoint
ALTER TABLE "guest_profiles" ADD COLUMN "language" varchar(8);--> statement-breakpoint
ALTER TABLE "guest_profiles" ADD COLUMN "email_hash" varchar(64);--> statement-breakpoint
ALTER TABLE "guest_profiles" ADD COLUMN "total_stays_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "guest_profiles" ADD COLUMN "last_seen_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "gmail_sync_jobs_host_idx" ON "gmail_sync_jobs" USING btree ("host_id");--> statement-breakpoint
CREATE INDEX "gmail_sync_jobs_status_idx" ON "gmail_sync_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "gmail_sync_jobs_created_at_idx" ON "gmail_sync_jobs" USING btree ("created_at");--> statement-breakpoint
ALTER TABLE "guest_profiles" ADD CONSTRAINT "guest_profiles_host_id_hosts_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."hosts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_profiles" ADD CONSTRAINT "guest_profiles_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_property_external_code_uniq" ON "bookings" USING btree ("property_id","booking_external_code") WHERE "booking_external_code" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "bookings_guest_profile_idx" ON "bookings" USING btree ("guest_profile_id");--> statement-breakpoint
CREATE INDEX "guest_profiles_host_idx" ON "guest_profiles" USING btree ("host_id");--> statement-breakpoint
CREATE UNIQUE INDEX "guest_profiles_host_name_uniq" ON "guest_profiles" USING btree ("host_id","full_name");--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_guest_profile_id_guest_profiles_id_fk" FOREIGN KEY ("guest_profile_id") REFERENCES "public"."guest_profiles"("id") ON DELETE set null ON UPDATE no action;