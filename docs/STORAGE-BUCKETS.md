# Supabase Storage buckets — fallback procedurale

## Buckets richiesti

V1 Premura usa 2 bucket Supabase Storage:

| Bucket | Scope | Max size | Slice |
|---|---|---|---|
| `property-photos` | foto della casa caricate da host | 10MB | G |
| `kit-setup-photos` | foto setup cleaner per ogni kit | 5MB | D |

## Migration 0022

`packages/db/src/migrations/0022_storage_buckets.sql` tenta di creare i bucket via:

```sql
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES (...);
```

E setta RLS policies su `storage.objects` (read pubblico, insert/delete solo `service_role`).

## ⚠️ Attenzione: schema `storage` è reserved Supabase

Lo schema `storage` è gestito da Supabase. La migration via Drizzle/`pnpm db:migrate` può **fallire** per privilegi insufficienti se la connessione DB usa un role diverso da `service_role` o `postgres`.

## Fallback: applicare manualmente

Se la migration 0022 fallisce con errore tipo:

```
ERROR: permission denied for schema storage
```

esegui il contenuto di `0022_storage_buckets.sql` direttamente nel **Supabase SQL Editor** (loggati come admin):

1. Apri https://app.supabase.com/project/_/sql
2. Copia il contenuto di `packages/db/src/migrations/0022_storage_buckets.sql`
3. Esegui (Run)
4. Verifica buckets: https://app.supabase.com/project/_/storage/buckets

## Verifica post-applicazione

```sql
-- Buckets esistono
SELECT id, name, public, file_size_limit FROM storage.buckets
WHERE id IN ('property-photos', 'kit-setup-photos');

-- Policies attive
SELECT polname, polcmd FROM pg_policy WHERE polrelid = 'storage.objects'::regclass
AND polname LIKE 'premura_storage_%';
```

Devi vedere 2 buckets e 3 policies (`premura_storage_public_read`, `premura_storage_service_insert`, `premura_storage_service_delete`).

## Path conventions

- `property-photos/{propertyId}/{uuid}.{ext}` — folder per property, UUID random per file (no enumeration).
- `kit-setup-photos/{kitId}-{uuid}.{ext}` — UUID random sotto kitId folder (slice D).

URLs sono pubbliche (helper `extractPathFromPublicUrl` per delete idempotente).

## Env vars richiesti

- `NEXT_PUBLIC_SUPABASE_URL` — già configurato (slice 6 auth)
- `SUPABASE_SERVICE_ROLE_KEY` — service_role key per upload backend

Helper: `apps/web/lib/storage.ts` — `uploadPhotoToBucket`, `deletePhotoFromBucket`,
`extractPathFromPublicUrl`.
