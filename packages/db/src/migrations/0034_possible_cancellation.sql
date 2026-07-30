-- Rilevamento cancellazioni 2-poll (30/07): un evento iCal che sparisce
-- dal feed per DUE poll RIUSCITI consecutivi diventa "possibile
-- cancellazione" da mostrare all'host. Un poll fallito (HTTP error,
-- timeout, body non parsabile) NON incrementa mai il contatore.
ALTER TABLE "bookings" ADD COLUMN "feed_missing_count" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "possible_cancellation_at" timestamp with time zone;
