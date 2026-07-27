-- Disclosure AI — Regolamento (UE) 2024/1689 (AI Act), art. 50 §1.
-- Applicabile dal 2 agosto 2026.
--
-- L'ospite che scrive al numero della villa si aspetta un host umano:
-- l'eccezione "è ovvio che sia un'IA" non si applica, quindi la
-- disclosure è dovuta all'inizio di ogni conversazione automatica.
--
-- Aggiunte:
--  - hosts.ai_disclosure_custom (jsonb): testo personalizzato per
--    lingua, es. {"it": "...", "en": "..."}. Default '{}' = si usano i
--    testi predefiniti di packages/shared/src/ai-disclosure.ts.
--
--    NOTA: NON esiste una colonna ai_disclosure_enabled. È deliberato.
--    Il requisito è "configurabile ma non disattivabile": l'host cambia
--    le parole, non ottiene il silenzio. Un flag booleano prima o poi
--    verrebbe messo a false. Un testo custom vuoto ricade sul default
--    (garanzia applicata in resolveAiDisclosure()).
--
--  - conversations.ai_disclosure_sent_at: quando la disclosure è stata
--    consegnata in quella conversazione. NULL = da inviare. Serve a
--    mandarla all'inizio e non a ogni messaggio.

ALTER TABLE "hosts"
  ADD COLUMN IF NOT EXISTS "ai_disclosure_custom" JSONB NOT NULL DEFAULT '{}';
--> statement-breakpoint

ALTER TABLE "conversations"
  ADD COLUMN IF NOT EXISTS "ai_disclosure_sent_at" TIMESTAMP WITH TIME ZONE;
--> statement-breakpoint

-- Finder: conversazioni attive che devono ancora ricevere la disclosure.
CREATE INDEX IF NOT EXISTS "conversations_ai_disclosure_pending_idx"
  ON "conversations" ("status")
  WHERE "ai_disclosure_sent_at" IS NULL;
