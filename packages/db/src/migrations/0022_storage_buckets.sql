-- Slice G + D — Supabase Storage buckets per foto property + setup kit.
--
-- ATTENZIONE: Questa migration tocca lo schema "storage" (Supabase reserved).
-- storage.objects appartiene al ruolo supabase_storage_admin: eseguita con un
-- ruolo diverso, le CREATE POLICY falliscono per privilegi insufficienti.
--
-- Il 29/07/2026 (DEBT-1 bis) ogni statement e' stato avvolto in un blocco DO
-- che cattura insufficient_privilege e prosegue con un RAISE NOTICE. Motivo:
-- questa migration sta in mezzo alla catena, e la catena viene rieseguita per
-- riempire i buchi lasciati dalle applicazioni manuali fuori ordine. Senza la
-- cattura, un errore di privilegi qui abortirebbe la transazione e
-- impedirebbe a 0023-0026 di essere applicate — cioe' un problema di permessi
-- sui bucket bloccherebbe outbound_sends e la disclosure AI.
--
-- Se nei log compare il NOTICE, i bucket vanno creati a mano come
-- service_role dal Supabase SQL Editor. Vedi docs/STORAGE-BUCKETS.md.

-- Bucket property-photos: foto della casa caricate da host (max 10MB).
DO $$ BEGIN
  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES (
    'property-photos',
    'property-photos',
    true,
    10485760,
    ARRAY['image/jpeg', 'image/png', 'image/webp']
  )
  ON CONFLICT (id) DO NOTHING;
EXCEPTION WHEN insufficient_privilege OR undefined_table THEN
  RAISE NOTICE '0022: bucket property-photos non creato (privilegi). Crearlo a mano come service_role.';
END $$;
--> statement-breakpoint

-- Bucket kit-setup-photos: foto setup cleaner (max 5MB).
DO $$ BEGIN
  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES (
    'kit-setup-photos',
    'kit-setup-photos',
    true,
    5242880,
    ARRAY['image/jpeg', 'image/png', 'image/webp']
  )
  ON CONFLICT (id) DO NOTHING;
EXCEPTION WHEN insufficient_privilege OR undefined_table THEN
  RAISE NOTICE '0022: bucket kit-setup-photos non creato (privilegi). Crearlo a mano come service_role.';
END $$;
--> statement-breakpoint

-- RLS: read pubblico (path = UUID random, niente enumeration possibile).
-- Insert solo via service_role (backend Premura).
DO $$ BEGIN
  DROP POLICY IF EXISTS "premura_storage_public_read" ON storage.objects;
  CREATE POLICY "premura_storage_public_read"
    ON storage.objects
    FOR SELECT
    TO anon, authenticated
    USING (bucket_id IN ('property-photos', 'kit-setup-photos'));
EXCEPTION WHEN insufficient_privilege OR undefined_table THEN
  RAISE NOTICE '0022: policy premura_storage_public_read non applicata (privilegi).';
END $$;
--> statement-breakpoint

DO $$ BEGIN
  DROP POLICY IF EXISTS "premura_storage_service_insert" ON storage.objects;
  CREATE POLICY "premura_storage_service_insert"
    ON storage.objects
    FOR INSERT
    TO service_role
    WITH CHECK (bucket_id IN ('property-photos', 'kit-setup-photos'));
EXCEPTION WHEN insufficient_privilege OR undefined_table THEN
  RAISE NOTICE '0022: policy premura_storage_service_insert non applicata (privilegi).';
END $$;
--> statement-breakpoint

DO $$ BEGIN
  DROP POLICY IF EXISTS "premura_storage_service_delete" ON storage.objects;
  CREATE POLICY "premura_storage_service_delete"
    ON storage.objects
    FOR DELETE
    TO service_role
    USING (bucket_id IN ('property-photos', 'kit-setup-photos'));
EXCEPTION WHEN insufficient_privilege OR undefined_table THEN
  RAISE NOTICE '0022: policy premura_storage_service_delete non applicata (privilegi).';
END $$;
