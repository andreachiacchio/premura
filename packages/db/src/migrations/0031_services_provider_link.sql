-- Sezione Servizi (30/07): fornitore collegato al servizio. Quando
-- l'ospite chiede il servizio, l'agente sa con chi parlare. Interno:
-- i contatti del fornitore non escono mai verso l'ospite.
ALTER TABLE "services" ADD COLUMN "provider_id" uuid;
--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE set null ON UPDATE no action;
