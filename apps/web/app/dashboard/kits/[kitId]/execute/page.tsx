import { getCurrentHostId } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { getKitForHost } from '@/lib/repositories/kits';
import {
  buildAmazonSearchUrl,
  buildGlovoSearchUrl,
  computeAmazonOrderByDate,
} from '@premura/agents';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { StatusTimeline } from '../../_components/StatusBadge';
import { ExecuteWorkflow } from './_components/ExecuteWorkflow';

export const dynamic = 'force-dynamic';

const DATE_FMT = new Intl.DateTimeFormat('it-IT', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

const DAY_FMT = new Intl.DateTimeFormat('it-IT', {
  day: '2-digit',
  month: 'short',
});

export default async function KitExecutePage({
  params,
}: { params: Promise<{ kitId: string }> }): Promise<React.JSX.Element> {
  const { kitId } = await params;
  const hostId = await getCurrentHostId();
  const { db } = await getDb();
  const kit = await getKitForHost(db, kitId, hostId);
  if (!kit) notFound();

  // Stati validi per execute: approved (prima di iniziare ordini) +
  // ordering (durante esecuzione). Altri stati → redirect detail.
  if (kit.status !== 'approved' && kit.status !== 'ordering') {
    redirect(`/dashboard/kits/${kitId}`);
  }

  const checkinFmt = DATE_FMT.format(kit.checkinAt);
  const orderByDateFmt = DAY_FMT.format(computeAmazonOrderByDate(kit.checkinAt));

  // Items split per fonte.
  const itemsWithIndex = kit.items.map((it, idx) => ({ item: it, idx }));
  const amazonItems = itemsWithIndex.filter((p) => p.item.fonte === 'amazon');
  const glovoItems = itemsWithIndex.filter((p) => p.item.fonte === 'glovo');
  const manualItems = itemsWithIndex.filter(
    (p) => p.item.fonte === 'manual_print' || p.item.fonte === 'manual_write',
  );

  const amazonItemsUI = amazonItems.map((p) => ({
    idx: p.idx,
    description: p.item.specificDescription ?? p.item.taxonomyKey ?? '',
    quantity: p.item.quantity ?? 1,
    estimatedPriceEur: p.item.estimatedPriceEur ?? 0,
    searchHint: p.item.amazonSearchHint ?? p.item.specificDescription ?? '',
    searchUrl: buildAmazonSearchUrl(p.item.amazonSearchHint ?? p.item.specificDescription ?? ''),
    executedAt: p.item.executedAt ?? null,
    reasoning: p.item.reasoning ?? '',
  }));

  const glovoItemsUI = glovoItems.map((p) => ({
    idx: p.idx,
    description: p.item.specificDescription ?? p.item.taxonomyKey ?? '',
    quantity: p.item.quantity ?? 1,
    estimatedPriceEur: p.item.estimatedPriceEur ?? 0,
    searchHint: p.item.glovoSearchHint ?? p.item.specificDescription ?? '',
    searchUrl: buildGlovoSearchUrl(p.item.glovoSearchHint ?? p.item.specificDescription ?? ''),
    executedAt: p.item.executedAt ?? null,
    reasoning: p.item.reasoning ?? '',
  }));

  const manualItemsUI = manualItems.map((p) => ({
    idx: p.idx,
    description: p.item.specificDescription ?? p.item.taxonomyKey ?? '',
    fonte: p.item.fonte ?? 'manual_print',
    cardMessage:
      p.item.fonte === 'manual_write'
        ? kit.guestLanguage === 'en'
          ? kit.cardMessageEn ?? kit.cardMessage ?? ''
          : kit.cardMessage ?? ''
        : null,
    executedAt: p.item.executedAt ?? null,
    reasoning: p.item.reasoning ?? '',
  }));

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <header className="mb-6">
        <Link
          href={`/dashboard/kits/${kitId}`}
          className="mb-3 inline-block text-sm text-ink-mute underline-offset-2 hover:underline"
        >
          ← Dettaglio kit
        </Link>
        <h1 className="text-2xl font-semibold text-ink">
          Esegui ordini — {kit.guestFullName}
        </h1>
        <p className="mt-1 text-sm text-ink-mute">
          {kit.propertyName} · check-in {checkinFmt}
        </p>
      </header>

      <section className="mb-6 rounded-lg border border-line bg-white p-4">
        <StatusTimeline current={kit.status} />
      </section>

      <ExecuteWorkflow
        kitId={kit.kitId}
        currentStatus={kit.status}
        amazonItems={amazonItemsUI}
        glovoItems={glovoItemsUI}
        manualItems={manualItemsUI}
        amazonOrderByDateFmt={orderByDateFmt}
        cleanerBriefedAt={
          kit.cleanerBriefedAt ? kit.cleanerBriefedAt.toISOString() : null
        }
        cleanerAcceptedAt={
          kit.cleanerAcceptedAt ? kit.cleanerAcceptedAt.toISOString() : null
        }
      />
    </div>
  );
}
