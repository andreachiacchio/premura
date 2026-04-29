ALTER TABLE "bookings" ADD COLUMN "data_source" varchar(32) DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "host_skipped_completion" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "manual_completion_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "bookings_data_source_property_idx" ON "bookings" USING btree ("data_source","property_id");