import { setCleanerSessionCookie } from '@/lib/cleaner-session';
import { getDb } from '@/lib/db';
import { markCleanerAccepted } from '@/lib/repositories/cleaner-kits';
import { verifyCleanerToken } from '@premura/agents';
import { redirect } from 'next/navigation';

// Slice D — Magic link landing.
// /c/[token] verifica token + set cookie + redirect /c/dashboard.

export const dynamic = 'force-dynamic';

export default async function CleanerMagicLinkPage(props: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await props.params;
  const verified = verifyCleanerToken(token);
  if (!verified.ok) {
    redirect('/c/error');
  }
  await setCleanerSessionCookie(token);
  const { db } = await getDb();
  // Marca karen_accepted=true al primo accesso (segnale che Karen ha
  // confermato di voler usare Premura).
  await markCleanerAccepted(db, verified.payload.cid).catch(() => {});
  redirect('/c/dashboard');
}
