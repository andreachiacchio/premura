-- Slice G — Property Knowledge UI completa.
--
-- Estende property_knowledge con:
--  - check_in_instructions / check_out_instructions (testo libero, multiline)
--  - local_tips_curated_host (jsonb): array {category, name, description,
--    address, distanceMin} curato dall'host (NON da agent), 3+ posti.
--    Usato sia da kit-generator (slice C) sia da welcome-message (slice E).
--  - house_photos (jsonb): array di URL Supabase Storage bucket
--    "property-photos" caricate dall'host. Per V1 max 10 per property.
--  - language_default (varchar 8): 'it' | 'en' default lingua per
--    template welcome-message + storytelling kit fallback.

ALTER TABLE "property_knowledge"
  ADD COLUMN IF NOT EXISTS "check_in_instructions" TEXT,
  ADD COLUMN IF NOT EXISTS "check_out_instructions" TEXT,
  ADD COLUMN IF NOT EXISTS "local_tips_curated_host" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS "house_photos" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS "language_default" VARCHAR(8) NOT NULL DEFAULT 'it';
