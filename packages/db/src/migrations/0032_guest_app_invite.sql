-- Invio automatico guest app quando compare il numero (30/07):
-- nuovo trigger outbound + URL guest app per struttura. Senza URL
-- configurato l'invito non parte (mai link rotti).
ALTER TYPE "outbound_trigger" ADD VALUE IF NOT EXISTS 'guest_app_invite';
--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "guest_app_url" text;
