-- Slice 8.1: estensione guest_profiles per Pipeline 2 (Guest DNA
-- extractor da messaggi inbound).
--
-- Modifiche additive (non breaking):
--   1. message_insights jsonb DEFAULT '{}': pacchetto di insights
--      estratti da Sonnet 4.6 ad ogni messaggio inbound. Schema:
--        preferred_language: string ISO 639-1
--        communication_style: { score: 1-5, label: 'formal'|'casual'|'mixed' }
--        topics_mentioned: string[] (vocabolario chiuso 20 topics)
--        urgency_signals: boolean
--        sentiment_avg: number [-1, 1] moving average pesata
--   2. first_message_at, last_message_at: timestamp dei limiti della
--      finestra messaggi processati. Indici per query "ultimi N
--      ospiti attivi".
--   3. message_count: contatore incrementato ad ogni extraction
--      run idempotente (no double count via per-message idempotency).
--
-- Backfill: tutti default sicuri ({}, NULL, 0). Profili pre-esistenti
-- restano coerenti.

ALTER TABLE "guest_profiles"
  ADD COLUMN "message_insights" JSONB NOT NULL DEFAULT '{}'::jsonb;
--> statement-breakpoint
ALTER TABLE "guest_profiles"
  ADD COLUMN "first_message_at" TIMESTAMP WITH TIME ZONE;
--> statement-breakpoint
ALTER TABLE "guest_profiles"
  ADD COLUMN "last_message_at" TIMESTAMP WITH TIME ZONE;
--> statement-breakpoint
ALTER TABLE "guest_profiles"
  ADD COLUMN "message_count" INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "guest_profiles_last_message_at_idx"
  ON "guest_profiles" ("last_message_at" DESC NULLS LAST);
