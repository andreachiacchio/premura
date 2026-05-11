import { getCurrentCleaner } from '@/lib/cleaner-session';
import { getDb } from '@/lib/db';
import { listKitsForCleaner } from '@/lib/repositories/cleaner-kits';
import Link from 'next/link';
import { redirect } from 'next/navigation';

// Slice D — Dashboard cleaner PWA. Lista kit visibili.

export const dynamic = 'force-dynamic';

const FMT_TIME = new Intl.DateTimeFormat('it-IT', {
  weekday: 'short',
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

export default async function CleanerDashboardPage(props: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await getCurrentCleaner();
  if (!session.ok) {
    redirect('/c/error');
  }
  const { db } = await getDb();
  const allKits = await listKitsForCleaner(db, session.cleanerId);
  const searchParams = await props.searchParams;
  const tab = searchParams.tab === 'done' ? 'done' : searchParams.tab === 'week' ? 'week' : 'today';

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(startOfToday.getTime() + 24 * 3600 * 1000);
  const endOfWeek = new Date(startOfToday.getTime() + 7 * 24 * 3600 * 1000);

  const filtered = allKits.filter((k) => {
    if (tab === 'done') return k.cleanerPlacedAt !== null;
    if (tab === 'today')
      return k.checkinAt >= startOfToday && k.checkinAt < endOfToday && !k.cleanerPlacedAt;
    return k.checkinAt >= startOfToday && k.checkinAt < endOfWeek && !k.cleanerPlacedAt;
  });

  return (
    <main className="mx-auto min-h-screen w-full max-w-md bg-ivory px-5 pt-8 pb-16">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-eyebrow uppercase text-ink-mute">Premura</p>
          <h1 className="mt-1 font-serif text-h2 leading-tight tracking-tight text-ink">
            I miei kit
          </h1>
        </div>
        <Link
          href="/c/profile"
          className="rounded-full border border-line bg-paper px-3 py-1 text-body-sm text-ink-mute hover:text-ink"
          aria-label="Profilo"
        >
          ☰
        </Link>
      </header>

      <nav className="mb-4 flex gap-2 border-b border-line">
        <TabLink current={tab} value="today" label="Oggi" />
        <TabLink current={tab} value="week" label="Questa settimana" />
        <TabLink current={tab} value="done" label="Completati" />
      </nav>

      {filtered.length === 0 ? (
        <div className="rounded-card border border-line bg-paper p-6 text-center text-body-sm text-ink-mute">
          {tab === 'done' ? 'Nessun kit completato.' : 'Nessun kit in questa lista.'}
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {filtered.map((k) => (
            <li key={k.kitId}>
              <Link
                href={`/c/kit/${k.kitId}`}
                className="block rounded-card border border-line bg-paper p-4 shadow-sm transition-colors hover:border-terracotta/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-body font-medium text-ink">{k.propertyName}</p>
                    <p className="mt-0.5 text-body-sm text-ink-mute">
                      Check-in {FMT_TIME.format(k.checkinAt)}
                    </p>
                    <p className="mt-2 text-body-sm">
                      <StatusBadge
                        placed={!!k.cleanerPlacedAt}
                        briefed={!!k.cleanerBriefedAt}
                        status={k.status}
                      />
                    </p>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function TabLink({ current, value, label }: { current: string; value: string; label: string }) {
  const isActive = current === value;
  const href = value === 'today' ? '/c/dashboard' : `/c/dashboard?tab=${value}`;
  return (
    <Link
      href={href}
      className={`-mb-px border-b-2 px-3 py-2 text-body-sm font-medium ${
        isActive ? 'border-terracotta text-terracotta' : 'border-transparent text-ink-mute'
      }`}
    >
      {label}
    </Link>
  );
}

function StatusBadge({
  placed,
  briefed,
  status,
}: { placed: boolean; briefed: boolean; status: string }) {
  if (placed || status === 'delivered_to_guest') {
    return (
      <span className="inline-flex rounded-full bg-line-soft px-2 py-0.5 text-[11px] text-ok">
        📸 Setup completato
      </span>
    );
  }
  if (briefed || status === 'arrived_at_locker' || status === 'picked_up_by_cleaner') {
    return (
      <span className="inline-flex rounded-full bg-gold-soft px-2 py-0.5 text-[11px] text-gold-deep">
        ✅ Pronto da setup
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-full bg-bg-soft px-2 py-0.5 text-[11px] text-ink-mute">
      📦 In arrivo
    </span>
  );
}
