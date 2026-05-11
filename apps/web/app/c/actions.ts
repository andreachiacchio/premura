'use server';

import { clearCleanerSessionCookie, getCurrentCleaner } from '@/lib/cleaner-session';
import { getDb } from '@/lib/db';
import { setKitSetupComplete } from '@/lib/repositories/cleaner-kits';
import { uploadPhotoToBucket } from '@/lib/storage';
import { loadKitNotificationContext, sendKitEmail } from '@premura/agents';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

// Slice D — Server actions PWA cleaner.

const idSchema = z.string().uuid();

export type UploadSetupPhotoResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | 'no_session'
        | 'not_found'
        | 'invalid_mime'
        | 'too_large'
        | 'upload_error'
        | 'no_file';
      detail?: string;
    };

export async function uploadKitSetupPhotoAction(
  kitId: string,
  formData: FormData,
): Promise<UploadSetupPhotoResult> {
  const id = idSchema.parse(kitId);
  const session = await getCurrentCleaner();
  if (!session.ok) return { ok: false, reason: 'no_session' };

  const file = formData.get('photo');
  if (!(file instanceof File)) return { ok: false, reason: 'no_file' };
  const buffer = Buffer.from(await file.arrayBuffer());

  const uploaded = await uploadPhotoToBucket('kit-setup-photos', buffer, file.type, {
    folder: id,
  });
  if (!uploaded.ok) {
    return { ok: false, reason: uploaded.reason, detail: uploaded.detail };
  }

  const { db } = await getDb();
  const updated = await setKitSetupComplete(db, id, session.cleanerId, uploaded.url);
  if (!updated.ok) {
    return { ok: false, reason: 'not_found' };
  }

  // Email founder cleaner_uploaded_photo (best-effort).
  try {
    const ctx = await loadKitNotificationContext(db, id);
    if (ctx) await sendKitEmail('cleaner_uploaded_photo', ctx, { photoUrl: uploaded.url });
  } catch {
    // silenzio: workflow cleaner non bloccato da email errore.
  }

  revalidatePath('/c/dashboard');
  revalidatePath(`/c/kit/${id}`);
  return { ok: true };
}

export async function cleanerLogoutAction(): Promise<void> {
  await clearCleanerSessionCookie();
  redirect('/c/bye');
}
