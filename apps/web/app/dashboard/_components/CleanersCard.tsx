import Link from 'next/link';

// Slice F — Card cleaner sulla dashboard.

export function CleanersCard({ activeCount }: { activeCount: number }): React.JSX.Element {
  return (
    <Link
      href="/dashboard/cleaners"
      className="mx-5 mt-3 block rounded-lg border border-line bg-white px-4 py-3 transition-colors hover:border-terracotta/40 hover:shadow"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-ink">
            🧹{' '}
            {activeCount === 0
              ? 'Nessun cleaner ancora'
              : `${activeCount} cleaner ${activeCount === 1 ? 'attiva' : 'attive'}`}
          </p>
          <p className="mt-0.5 text-xs text-ink-mute">
            {activeCount === 0
              ? 'Aggiungi la prima persona che si occupa delle pulizie.'
              : 'Gestisci, aggiungi o assegna alle property.'}
          </p>
        </div>
        <span className="text-ink-mute">→</span>
      </div>
    </Link>
  );
}
