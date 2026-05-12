import { SubmitButton } from '@/components/forms/SubmitButton';
import { getCurrentCleaner } from '@/lib/cleaner-session';
import { getDb } from '@/lib/db';
import { getCleanerForHost } from '@/lib/repositories/cleaners';
import { cleaners } from '@premura/db';
import { eq } from 'drizzle-orm';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { cleanerLogoutAction } from '../actions';

export const dynamic = 'force-dynamic';

export default async function CleanerProfilePage() {
  const session = await getCurrentCleaner();
  if (!session.ok) redirect('/c/error');

  const { db } = await getDb();
  const [row] = await db
    .select({
      id: cleaners.id,
      fullName: cleaners.fullName,
      whatsappNumber: cleaners.whatsappNumber,
      hostId: cleaners.hostId,
    })
    .from(cleaners)
    .where(eq(cleaners.id, session.cleanerId))
    .limit(1);

  // hostId per ownership re-check (paranoia).
  if (!row) redirect('/c/error');
  await getCleanerForHost(db, row.id, row.hostId);

  return (
    <main className="mx-auto min-h-screen w-full max-w-md bg-ivory px-5 pt-8 pb-16">
      <Link
        href="/c/dashboard"
        className="mb-3 inline-block text-body-sm text-ink-mute hover:underline"
      >
        ← Lista kit
      </Link>
      <h1 className="font-serif text-h2 leading-tight tracking-tight text-ink">Profilo</h1>

      <section className="mt-6 rounded-card border border-line bg-paper p-4">
        <p className="text-body font-medium text-ink">{row.fullName}</p>
        <p className="mt-1 text-body-sm text-ink-mute">{row.whatsappNumber}</p>
      </section>

      <section className="mt-6 rounded-card border border-line bg-paper p-4">
        <h2 className="text-body font-medium text-ink">Aggiungi alla schermata Home</h2>
        <p className="mt-2 text-body-sm text-ink-soft">
          Su iPhone: tocca <strong>Condividi</strong> → <strong>Aggiungi a Home</strong>.
          <br />
          Su Android: tocca <strong>⋮</strong> → <strong>Aggiungi a Home</strong>.
        </p>
      </section>

      <form action={cleanerLogoutAction} className="mt-8">
        <SubmitButton
          asSkip
          pendingLabel="Uscita…"
          className="text-terracotta-2 decoration-terracotta-2/60 hover:text-terracotta-2 hover:decoration-terracotta-2"
        >
          Esci da Premura
        </SubmitButton>
      </form>
    </main>
  );
}
