-- Slice 7a.3: estensione schema pending_drafts per supportare draft di
-- tipo "deflection" (nudge proattivo all'arrivo di una prenotazione,
-- non risposta a un messaggio inbound).
--
-- Modifiche:
--   1. message_id diventa nullable. I draft "deflection_wa_invite" non
--      hanno un messaggio inbound da rispondere (la prenotazione e'
--      appena arrivata e l'ospite non ha ancora scritto).
--   2. kind: classificatore del tipo di draft. Default 'message_reply'
--      per i draft esistenti (Conversation Agent). I nuovi deflection
--      sono 'deflection_wa_invite'.
--   3. metadata jsonb: contesto extra del draft (es. target_channel,
--      source_booking_id, deflection_attempt). Default {}.
--
-- Backfill: i draft esistenti restano semanticamente intatti (kind
-- default 'message_reply', message_id NOT NULL gia' soddisfatto). Niente
-- breaking change.

-- IF NOT EXISTS aggiunto il 29/07/2026 (DEBT-1 bis). Parte delle migration
-- 0009-0023 era stata applicata a mano su Supabase in ordine non contiguo:
-- il tracking Drizzle e' lineare (riapplica tutto cio' che sta oltre
-- l'ultimo timestamp registrato) e non sa saltare i buchi. L'unico modo di
-- riempirli e' ripassare dall'inizio, quindi ogni migration deve poter
-- essere rieseguita senza esplodere. Vedi docs/DB-MIGRATIONS.md.

ALTER TABLE "pending_drafts" ALTER COLUMN "message_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "pending_drafts" ADD COLUMN IF NOT EXISTS "kind" VARCHAR(64) NOT NULL DEFAULT 'message_reply';
--> statement-breakpoint
ALTER TABLE "pending_drafts" ADD COLUMN IF NOT EXISTS "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pending_drafts_kind_idx" ON "pending_drafts" ("kind");
