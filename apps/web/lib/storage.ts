import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

// Slice G + D — Supabase Storage helper.
//
// Upload via service_role key (env SUPABASE_SERVICE_ROLE_KEY).
// Path = UUID random (no enumeration). Bucket pubblico in lettura
// (RLS policy 0022) per semplificare email/<img src> + WA send foto.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

let cached: ReturnType<typeof createClient> | null = null;

function getServiceClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      'Storage: NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY non configurati',
    );
  }
  if (!cached) {
    cached = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cached;
}

export type Bucket = 'property-photos' | 'kit-setup-photos';

export type UploadResult =
  | { ok: true; url: string; path: string }
  | { ok: false; reason: 'invalid_mime' | 'too_large' | 'upload_error'; detail?: string };

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_SIZE_BUCKET: Record<Bucket, number> = {
  'property-photos': 10 * 1024 * 1024,
  'kit-setup-photos': 5 * 1024 * 1024,
};

export async function uploadPhotoToBucket(
  bucket: Bucket,
  buffer: Buffer,
  mime: string,
  options: { folder?: string } = {},
): Promise<UploadResult> {
  if (!ALLOWED_MIME.has(mime)) {
    return { ok: false, reason: 'invalid_mime', detail: mime };
  }
  if (buffer.byteLength > MAX_SIZE_BUCKET[bucket]) {
    return { ok: false, reason: 'too_large', detail: `${buffer.byteLength}B` };
  }

  const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
  const folder = options.folder ? `${options.folder}/` : '';
  const path = `${folder}${randomUUID()}.${ext}`;

  const supabase = getServiceClient();
  const { error } = await supabase.storage.from(bucket).upload(path, buffer, {
    contentType: mime,
    upsert: false,
  });
  if (error) {
    return { ok: false, reason: 'upload_error', detail: error.message };
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return { ok: true, url: data.publicUrl, path };
}

export async function deletePhotoFromBucket(
  bucket: Bucket,
  path: string,
): Promise<{ ok: boolean; reason?: string }> {
  const supabase = getServiceClient();
  const { error } = await supabase.storage.from(bucket).remove([path]);
  if (error) return { ok: false, reason: error.message };
  return { ok: true };
}

// Estrae il path dal public URL (per delete idempotente da DB-stored URL).
// Esempio: https://xxx.supabase.co/storage/v1/object/public/property-photos/abc.jpg
//          → "abc.jpg"
export function extractPathFromPublicUrl(bucket: Bucket, url: string): string | null {
  const marker = `/storage/v1/object/public/${bucket}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return url.substring(idx + marker.length);
}
