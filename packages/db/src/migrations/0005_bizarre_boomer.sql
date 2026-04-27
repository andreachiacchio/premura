CREATE TYPE "public"."booking_email_event_type" AS ENUM('new_booking', 'cancellation', 'modification', 'noise');--> statement-breakpoint
CREATE TABLE "booking_email_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"host_id" uuid NOT NULL,
	"booking_id" uuid,
	"event_type" "booking_email_event_type" NOT NULL,
	"booking_external_code" varchar(64),
	"raw_subject" text NOT NULL,
	"raw_email_id" varchar(128) NOT NULL,
	"email_received_at" timestamp with time zone NOT NULL,
	"ingestion_status" varchar(16) NOT NULL,
	"ingestion_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "gmail_sync_jobs" ADD COLUMN "booking_emails_scanned" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "gmail_sync_jobs" ADD COLUMN "booking_emails_matched" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "gmail_sync_jobs" ADD COLUMN "booking_emails_unmatched" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "gmail_sync_jobs" ADD COLUMN "booking_emails_skipped" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "booking_email_events" ADD CONSTRAINT "booking_email_events_host_id_hosts_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."hosts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_email_events" ADD CONSTRAINT "booking_email_events_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "booking_email_events_host_idx" ON "booking_email_events" USING btree ("host_id");--> statement-breakpoint
CREATE INDEX "booking_email_events_booking_idx" ON "booking_email_events" USING btree ("booking_id");--> statement-breakpoint
CREATE UNIQUE INDEX "booking_email_events_email_id_uniq" ON "booking_email_events" USING btree ("raw_email_id");