import Link from 'next/link';
import { StatusBadge } from './StatusBadge';

const DATE_FMT = new Intl.DateTimeFormat('it-IT', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

export type KitsListRowUI = {
  kitId: string;
  bookingId: string;
  status: string;
  guestFullName: string;
  propertyName: string;
  checkinAt: string; // ISO
  nights: number;
  proposalGeneratedAt: string | null;
  approvedAt: string | null;
  cleanerBriefedAt: string | null;
  cleanerAcceptedAt: string | null;
  cleanerPlacedAt: string | null;
  itemsTotalEur: string | null;
  budgetEur: string;
  itemCount: number;
};

export function KitsList({ rows }: { rows: KitsListRowUI[] }): React.JSX.Element {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-line bg-bg-soft p-8 text-center">
        <p className="text-ink-mute">Nessun kit in questa categoria.</p>
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {rows.map((row) => {
        const checkin = new Date(row.checkinAt);
        const checkinFmt = DATE_FMT.format(checkin);
        return (
          <li key={row.kitId}>
            <Link
              href={`/dashboard/kits/${row.kitId}`}
              className="block rounded-lg border border-line bg-white p-4 shadow-sm transition-colors hover:border-terracotta/40 hover:shadow"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="truncate text-base font-medium text-ink">
                      {row.guestFullName}
                    </h2>
                    <StatusBadge status={row.status} />
                  </div>
                  <p className="mt-1 truncate text-sm text-ink-mute">
                    {row.propertyName} · check-in {checkinFmt} · {row.nights}{' '}
                    {row.nights === 1 ? 'notte' : 'notti'}
                  </p>
                </div>
                <div className="text-right text-sm">
                  <div className="font-medium text-ink">
                    €{row.itemsTotalEur ?? '?'} <span className="text-ink-mute">/ €{row.budgetEur}</span>
                  </div>
                  <div className="text-xs text-ink-mute">
                    {row.itemCount} {row.itemCount === 1 ? 'item' : 'items'}
                  </div>
                </div>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
