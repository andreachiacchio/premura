import Link from 'next/link';

// Slice C — Card sulla dashboard quando ci sono kit "proposed"/"modified"
// in attesa di approvazione del founder.

export function KitsApprovalCard({ pendingCount }: { pendingCount: number }): React.JSX.Element {
  return (
    <Link
      href="/dashboard/kits"
      className="mx-5 mt-3 block rounded-lg border border-gold-deep/20 bg-gold-soft px-4 py-3 transition-colors hover:border-gold-deep/40"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-gold-deep">
            🎁 {pendingCount} kit{' '}
            {pendingCount === 1 ? 'pronto' : 'pronti'} per approvazione
          </p>
          <p className="mt-0.5 text-xs text-ink-mute">
            Tocca per rivedere e approvare le proposte di Premura.
          </p>
        </div>
        <span className="text-gold-deep">→</span>
      </div>
    </Link>
  );
}
