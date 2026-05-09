import { getCurrentHostId } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { getKitForHost } from '@/lib/repositories/kits';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { StatusTimeline } from '../_components/StatusBadge';
import { KitDetail } from './_components/KitDetail';

export const dynamic = 'force-dynamic';

const DATE_FMT = new Intl.DateTimeFormat('it-IT', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

export default async function KitDetailPage({
  params,
}: { params: Promise<{ kitId: string }> }): Promise<React.JSX.Element> {
  const { kitId } = await params;
  const hostId = await getCurrentHostId();
  const { db } = await getDb();
  const kit = await getKitForHost(db, kitId, hostId);
  if (!kit) notFound();

  const checkinFmt = DATE_FMT.format(kit.checkinAt);
  const checkoutFmt = DATE_FMT.format(kit.checkoutAt);

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <header className="mb-6">
        <Link
          href="/dashboard/kits"
          className="mb-3 inline-block text-sm text-ink-mute underline-offset-2 hover:underline"
        >
          ← Tutti i kit
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-ink">
              Kit per {kit.guestFullName}
            </h1>
            <p className="mt-1 text-sm text-ink-mute">
              {kit.propertyName} · {checkinFmt} → {checkoutFmt} · {kit.nights}{' '}
              {kit.nights === 1 ? 'notte' : 'notti'} · {kit.numAdults}A
              {kit.numChildren > 0 ? ` ${kit.numChildren}C` : ''}
            </p>
          </div>
          {(kit.status === 'approved' || kit.status === 'ordering') && (
            <Link
              href={`/dashboard/kits/${kit.kitId}/execute`}
              className="rounded-md bg-terracotta px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-terracotta-2"
            >
              Esegui ordini →
            </Link>
          )}
        </div>
      </header>

      <section className="mb-6 rounded-lg border border-line bg-white p-4">
        <StatusTimeline current={kit.status} />
      </section>

      <KitDetail
        kit={{
          ...kit,
          proposalGeneratedAt: kit.proposalGeneratedAt
            ? kit.proposalGeneratedAt.toISOString()
            : null,
          approvedAt: kit.approvedAt ? kit.approvedAt.toISOString() : null,
          rejectedAt: kit.rejectedAt ? kit.rejectedAt.toISOString() : null,
          cleanerBriefedAt: kit.cleanerBriefedAt
            ? kit.cleanerBriefedAt.toISOString()
            : null,
          cleanerAcceptedAt: kit.cleanerAcceptedAt
            ? kit.cleanerAcceptedAt.toISOString()
            : null,
          cleanerPlacedAt: kit.cleanerPlacedAt
            ? kit.cleanerPlacedAt.toISOString()
            : null,
          guestConfirmedAt: kit.guestConfirmedAt
            ? kit.guestConfirmedAt.toISOString()
            : null,
          checkinAt: kit.checkinAt.toISOString(),
          checkoutAt: kit.checkoutAt.toISOString(),
        }}
      />
    </div>
  );
}
