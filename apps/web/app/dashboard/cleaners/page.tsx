import { getCurrentHostId } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { startTimer, timed } from '@/lib/perf';
import { listCleanersForHost } from '@/lib/repositories/cleaners';
import Link from 'next/link';
import { CleanersList } from './_components/CleanersList';

// Slice F — Lista cleaner del host.

export const dynamic = 'force-dynamic';

export default async function CleanersPage(): Promise<React.JSX.Element> {
  const stop = startTimer('PAGINA /dashboard/cleaners dati');
  const hostId = await timed('getCurrentHostId', () => getCurrentHostId());
  const { db } = await getDb();
  const cleaners = await timed('q listCleanersForHost', () => listCleanersForHost(db, hostId));
  stop();

  return (
    <div className="mx-auto max-w-4xl px-6 py-8 lg:max-w-5xl xl:max-w-[1400px]">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Cleaner</h1>
          <p className="mt-1 text-sm text-ink-mute">
            Le persone che si occupano delle pulizie e dei kit di benvenuto.
          </p>
        </div>
        <Link
          href="/dashboard/cleaners/new"
          className="rounded-md bg-terracotta px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-terracotta-2"
        >
          + Aggiungi cleaner
        </Link>
      </header>

      {cleaners.length === 0 ? (
        <div className="rounded-lg border border-line bg-bg-soft p-8 text-center">
          <h2 className="text-base font-medium text-ink">Nessun cleaner ancora</h2>
          <p className="mt-2 text-sm text-ink-mute">
            Aggiungi la prima persona che si occupa delle pulizie e Premura potrà coordinare i kit
            di benvenuto.
          </p>
          <Link
            href="/dashboard/cleaners/new"
            className="mt-4 inline-block rounded-md bg-terracotta px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-terracotta-2"
          >
            + Aggiungi cleaner
          </Link>
        </div>
      ) : (
        <CleanersList
          rows={cleaners.map((c) => ({
            ...c,
            createdAt: c.createdAt.toISOString(),
          }))}
        />
      )}

      <p className="mt-8 text-xs text-ink-mute">
        <Link href="/dashboard" className="underline-offset-2 hover:underline">
          ← Oggi
        </Link>
      </p>
    </div>
  );
}
