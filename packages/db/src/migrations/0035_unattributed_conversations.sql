-- Fase 2 weekend (30/07): conversazioni cablate.
-- 1) Un inbound da numero SCONOSCIUTO crea comunque una conversation,
--    marcata non attribuita: booking_id diventa nullable (nessun dato
--    perso, vincolo solo allentato).
-- 2) Ogni messaggio registra uno stato esplicito (received / queued /
--    sent / failed / blocked...): varchar libero come data_source, per
--    non richiedere una migration a ogni stato nuovo.
ALTER TABLE "conversations" ALTER COLUMN "booking_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "status" varchar(16) NOT NULL DEFAULT 'received';
