-- Slice G + D — Supabase Storage buckets per foto property + setup kit.
--
-- ATTENZIONE: Questa migration tocca lo schema "storage" (Supabase reserved).
-- Se eseguita con role "authenticator" (default Drizzle), potrebbe fallire
-- per privilegi insufficienti. In quel caso eseguire MANUALMENTE come
-- service_role via Supabase SQL Editor.
--
-- Vedi docs/STORAGE-BUCKETS.md per fallback procedurale.

-- Bucket property-photos: foto della casa caricate da host (max 10MB).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'property-photos',
  'property-photos',
  true,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint

-- Bucket kit-setup-photos: foto setup cleaner (max 5MB).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'kit-setup-photos',
  'kit-setup-photos',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint

-- RLS: read pubblico (path = UUID random, niente enumeration possibile).
-- Insert solo via service_role (backend Premura).
DROP POLICY IF EXISTS "premura_storage_public_read" ON storage.objects;
CREATE POLICY "premura_storage_public_read"
  ON storage.objects
  FOR SELECT
  TO anon, authenticated
  USING (bucket_id IN ('property-photos', 'kit-setup-photos'));
--> statement-breakpoint

DROP POLICY IF EXISTS "premura_storage_service_insert" ON storage.objects;
CREATE POLICY "premura_storage_service_insert"
  ON storage.objects
  FOR INSERT
  TO service_role
  WITH CHECK (bucket_id IN ('property-photos', 'kit-setup-photos'));
--> statement-breakpoint

DROP POLICY IF EXISTS "premura_storage_service_delete" ON storage.objects;
CREATE POLICY "premura_storage_service_delete"
  ON storage.objects
  FOR DELETE
  TO service_role
  USING (bucket_id IN ('property-photos', 'kit-setup-photos'));
