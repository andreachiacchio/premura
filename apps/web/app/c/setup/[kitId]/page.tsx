import { getCurrentCleaner } from '@/lib/cleaner-session';
import { getDb } from '@/lib/db';
import { getKitForCleaner } from '@/lib/repositories/cleaner-kits';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { SetupPhotoUploader } from './_components/SetupPhotoUploader';

export const dynamic = 'force-dynamic';

export default async function CleanerSetupPage(props: {
  params: Promise<{ kitId: string }>;
}) {
  const { kitId } = await props.params;
  const session = await getCurrentCleaner();
  if (!session.ok) redirect('/c/error');

  const { db } = await getDb();
  const kit = await getKitForCleaner(db, kitId, session.cleanerId);
  if (!kit) notFound();

  return (
    <main className="mx-auto min-h-screen w-full max-w-md bg-ivory px-5 pt-8 pb-16">
      <Link
        href={`/c/kit/${kit.kitId}`}
        className="mb-3 inline-block text-body-sm text-ink-mute hover:underline"
      >
        ← Dettaglio kit
      </Link>
      <h1 className="font-serif text-h2 leading-tight tracking-tight text-ink">Foto del setup</h1>
      <p className="mt-2 text-body text-ink-soft">
        Scatta o carica la foto del kit allestito, poi conferma.
      </p>

      <SetupPhotoUploader kitId={kit.kitId} alreadyHasPhoto={!!kit.cleanerPhotoUrl} />
    </main>
  );
}
