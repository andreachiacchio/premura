-- Slice 8.4: estensione host_voice_profiles per inferenza automatica
-- da messaggi outbound dell'host (Modo 2 — auto-extraction).
--
-- I campi pre-esistenti (formality, emojiUsage, ...) restano validi per
-- Modo 1 (onboarding form esplicito). Aggiungiamo campi NUOVI per il
-- voice profiler automatico, popolati via Sonnet 4.6 da analisi sliding
-- window dei messaggi outbound dell'host.
--
-- Tutti additive, nullable o default safe. Niente breaking change.

ALTER TABLE "host_voice_profiles"
  ADD COLUMN "avg_sentence_length" NUMERIC(6, 2);
--> statement-breakpoint
ALTER TABLE "host_voice_profiles"
  ADD COLUMN "formality_score" NUMERIC(3, 2);
--> statement-breakpoint
ALTER TABLE "host_voice_profiles"
  ADD COLUMN "emoji_usage_rate" NUMERIC(4, 3);
--> statement-breakpoint
ALTER TABLE "host_voice_profiles"
  ADD COLUMN "common_phrases" JSONB NOT NULL DEFAULT '[]'::jsonb;
--> statement-breakpoint
ALTER TABLE "host_voice_profiles"
  ADD COLUMN "greeting_patterns" JSONB NOT NULL DEFAULT '[]'::jsonb;
--> statement-breakpoint
ALTER TABLE "host_voice_profiles"
  ADD COLUMN "closing_patterns" JSONB NOT NULL DEFAULT '[]'::jsonb;
--> statement-breakpoint
ALTER TABLE "host_voice_profiles"
  ADD COLUMN "language_distribution" JSONB NOT NULL DEFAULT '{}'::jsonb;
--> statement-breakpoint
ALTER TABLE "host_voice_profiles"
  ADD COLUMN "messages_analyzed" INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "host_voice_profiles"
  ADD COLUMN "voice_confidence" NUMERIC(4, 3) NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "host_voice_profiles"
  ADD COLUMN "processed_message_ids" JSONB NOT NULL DEFAULT '[]'::jsonb;
