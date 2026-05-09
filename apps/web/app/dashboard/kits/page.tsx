import { getCurrentHostId } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { countKitsByStatusForHost, listKitsForHost } from '@/lib/repositories/kits';
import Link from 'next/link';
import { KitsList } from './_components/KitsList';

// Slice C — Lista kit del founder.
//
// Tab per stato: Pending approval (proposed/modified) / Approved /
// In esecuzione (ordering/in_transit/arrived_at_locker/picked_up_by_cleaner) /
// Set up & delivered / Rejected.
//
// Click su una riga -> /dashboard/kits/[kitId] (detail).

export const dynamic = 'force-dynamic';

const STATUS_TABS = [
  {
    key: 'pending',
    label: 'Da approvare',
    statuses: ['proposed', 'modified'],
  },
  {
    key: 'approved',
    label: 'Approvati',
    statuses: ['approved'],
  },
  {
    key: 'executing',
    label: 'In esecuzione',
    statuses: [
      'ordering',
      'in_transit',
      'arrived_at_locker',
      'picked_up_by_cleaner',
    ],
  },
  {
    key: 'delivered',
    label: 'Consegnati',
    statuses: ['set_up', 'delivered_to_guest'],
  },
  {
    key: 'rejected',
    label: 'Rifiutati',
    statuses: ['rejected'],
  },
] as const;

type SearchParams = { tab?: string };

export default async function KitsPage({
  searchParams,
}: { searchParams: Promise<SearchParams> }): Promise<React.JSX.Element> {
  const hostId = await getCurrentHostId();
  const { db } = await getDb();
  const params = await searchParams;
  const activeTab = STATUS_TABS.find((t) => t.key === params.tab) ?? STATUS_TABS[0];

  const [rows, statusCounts] = await Promise.all([
    listKitsForHost(db, hostId, [...activeTab.statuses]),
    countKitsByStatusForHost(db, hostId),
  ]);

  const tabCounts: Record<string, number> = {};
  for (const tab of STATUS_TABS) {
    tabCounts[tab.key] = tab.statuses.reduce((s, st) => s + (statusCounts[st] ?? 0), 0);
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Kit di benvenuto</h1>
          <p className="mt-1 text-sm text-ink-mute">
            Proposte generate da Premura, da approvare/eseguire/consegnare.
          </p>
        </div>
        <Link
          href="/dashboard"
          className="text-sm text-ink-mute underline-offset-2 hover:underline"
        >
          ← Dashboard
        </Link>
      </header>

      <nav className="mb-6 flex flex-wrap gap-2 border-b border-line">
        {STATUS_TABS.map((tab) => {
          const count = tabCounts[tab.key] ?? 0;
          const isActive = tab.key === activeTab.key;
          return (
            <Link
              key={tab.key}
              href={tab.key === 'pending' ? '/dashboard/kits' : `/dashboard/kits?tab=${tab.key}`}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? 'border-terracotta text-terracotta'
                  : 'border-transparent text-ink-mute hover:text-ink'
              }`}
            >
              {tab.label}
              {count > 0 ? (
                <span
                  className={`ml-2 inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] ${
                    isActive ? 'bg-terracotta text-white' : 'bg-line text-ink-mute'
                  }`}
                >
                  {count}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <KitsList rows={rows.map((r) => ({
        ...r,
        checkinAt: r.checkinAt.toISOString(),
        proposalGeneratedAt: r.proposalGeneratedAt ? r.proposalGeneratedAt.toISOString() : null,
        approvedAt: r.approvedAt ? r.approvedAt.toISOString() : null,
        cleanerBriefedAt: r.cleanerBriefedAt ? r.cleanerBriefedAt.toISOString() : null,
        cleanerAcceptedAt: r.cleanerAcceptedAt ? r.cleanerAcceptedAt.toISOString() : null,
        cleanerPlacedAt: r.cleanerPlacedAt ? r.cleanerPlacedAt.toISOString() : null,
      }))} />
    </div>
  );
}
