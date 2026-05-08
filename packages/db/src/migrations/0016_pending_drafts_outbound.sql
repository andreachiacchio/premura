-- Slice 7B — outbound WhatsApp pipeline.
--
-- Estende pending_drafts per tracciare lo stato post-approvazione:
-- - 'sent': Meta Cloud API ha accettato il messaggio (200 OK + wamid)
-- - 'failed': Meta ha rejected o retry esauriti
--
-- Nuove colonne per audit + retry:
-- - sent_at: timestamp accettazione Meta (separato da approved_at: il
--   click host puo' essere precedente alla send se la API lagga)
-- - rejection_reason: motivazione opzionale fornita dall'host al click Scarta
-- - meta_message_id: wamid Meta (duplica messages.platform_message_id ma
--   evita un join in fast path UI)
-- - error_log: ultima failure response Meta (4xx body o 5xx errore retry)
-- - retry_count: contatore tentativi BullMQ (default 0; max 3 prima di failed)

ALTER TYPE "pending_draft_status" ADD VALUE IF NOT EXISTS 'sent';
--> statement-breakpoint
ALTER TYPE "pending_draft_status" ADD VALUE IF NOT EXISTS 'failed';
--> statement-breakpoint
ALTER TABLE "pending_drafts"
  ADD COLUMN IF NOT EXISTS "sent_at" TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS "rejection_reason" TEXT,
  ADD COLUMN IF NOT EXISTS "meta_message_id" VARCHAR(255),
  ADD COLUMN IF NOT EXISTS "error_log" TEXT,
  ADD COLUMN IF NOT EXISTS "retry_count" INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pending_drafts_meta_message_idx"
  ON "pending_drafts" ("meta_message_id");
