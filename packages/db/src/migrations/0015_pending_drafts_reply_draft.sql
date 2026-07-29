-- Slice 11: estensione pending_drafts per draft di tipo "reply" generati
-- dal Conversation Agent. Pattern coerente con slice 7a.3
-- ('deflection_wa_invite').
--
-- pending_drafts.kind e' gia' VARCHAR(64) (slice 7a.3): nessun cambio
-- enum, basta usare il nuovo valore 'reply_draft'.
--
-- Nuova FK reply_to_message_id: collega il draft al messaggio inbound
-- che lo ha triggerato (per dedup, audit, tracking conversion).
-- ON DELETE SET NULL per coerenza con messageId esistente.
--
-- Index su reply_to_message_id per query "esiste gia' draft per
-- questo messaggio?" idempotency check pre-insert.

ALTER TABLE "pending_drafts"
  ADD COLUMN IF NOT EXISTS "reply_to_message_id" UUID
  REFERENCES "messages"("id") ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pending_drafts_reply_to_message_idx"
  ON "pending_drafts" ("reply_to_message_id");
