import Link from 'next/link';

const DATE_FMT = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });

export type CleanersListRow = {
  id: string;
  fullName: string;
  whatsappNumber: string;
  email: string | null;
  deliveryAddress: string;
  perKitFeeEur: string;
  languagePreferred: string;
  isActive: boolean;
  karenAccepted: boolean;
  assignedPropertyCount: number;
  totalKitsCompleted: number;
  createdAt: string; // ISO
};

export function CleanersList({ rows }: { rows: CleanersListRow[] }): React.JSX.Element {
  return (
    <ul className="space-y-3">
      {rows.map((row) => (
        <li key={row.id}>
          <Link
            href={`/dashboard/cleaners/${row.id}`}
            className="block rounded-lg border border-line bg-white p-4 shadow-sm transition-colors hover:border-terracotta/40 hover:shadow"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="truncate text-base font-medium text-ink">{row.fullName}</h2>
                  {row.isActive ? (
                    <span className="inline-flex rounded-full bg-line-soft px-2 py-0.5 text-[11px] font-medium text-ok">
                      Attivo
                    </span>
                  ) : (
                    <span className="inline-flex rounded-full bg-peach px-2 py-0.5 text-[11px] font-medium text-terracotta-2">
                      Inattivo
                    </span>
                  )}
                  {row.karenAccepted && (
                    <span className="inline-flex rounded-full bg-gold-soft px-2 py-0.5 text-[11px] font-medium text-gold-deep">
                      Confermato
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-ink-mute">
                  {row.whatsappNumber}
                  {row.email ? ` · ${row.email}` : ''} ·{' '}
                  {row.assignedPropertyCount}{' '}
                  {row.assignedPropertyCount === 1 ? 'property' : 'properties'}
                </p>
                <p className="text-xs text-ink-mute">
                  €{row.perKitFeeEur} per kit · {row.totalKitsCompleted} kit completati
                </p>
              </div>
              <div className="text-right text-xs text-ink-mute">
                Aggiunta {DATE_FMT.format(new Date(row.createdAt))}
              </div>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
