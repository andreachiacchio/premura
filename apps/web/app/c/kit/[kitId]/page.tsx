import { getCurrentCleaner } from '@/lib/cleaner-session';
import { getDb } from '@/lib/db';
import { getKitForCleaner } from '@/lib/repositories/cleaner-kits';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

// Slice D — Dettaglio kit per cleaner.

export const dynamic = 'force-dynamic';

const FMT_TIME = new Intl.DateTimeFormat('it-IT', {
  weekday: 'long',
  day: '2-digit',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
});

export default async function CleanerKitDetailPage(props: {
  params: Promise<{ kitId: string }>;
}) {
  const { kitId } = await props.params;
  const session = await getCurrentCleaner();
  if (!session.ok) redirect('/c/error');

  const { db } = await getDb();
  const kit = await getKitForCleaner(db, kitId, session.cleanerId);
  if (!kit) notFound();

  const cardMessage =
    kit.guestLanguage === 'en'
      ? (kit.cardMessageEn ?? kit.cardMessage ?? '')
      : (kit.cardMessage ?? '');
  const placement = kit.kitDefaultPlacement ?? 'tavolo cucina';

  return (
    <main className="mx-auto min-h-screen w-full max-w-md bg-ivory px-5 pt-8 pb-16">
      <Link
        href="/c/dashboard"
        className="mb-3 inline-block text-body-sm text-ink-mute hover:underline"
      >
        ← Tutti i kit
      </Link>
      <h1 className="font-serif text-h2 leading-tight tracking-tight text-ink">
        {kit.propertyName}
      </h1>
      <p className="mt-2 text-body-sm text-ink-mute">Check-in: {FMT_TIME.format(kit.checkinAt)}</p>
      {kit.propertyAddress && <p className="text-body-sm text-ink-mute">{kit.propertyAddress}</p>}

      <section className="mt-6 rounded-card border border-line bg-paper p-4">
        <h2 className="text-body font-medium text-ink">Cosa fare</h2>
        <ul className="mt-3 space-y-2 text-body-sm">
          {kit.items.map((it, idx) => (
            <li key={`${idx}-${it.taxonomyKey}`} className="border-l-2 border-line pl-3">
              <p className="text-ink">{cleanerLabelForItem(it)}</p>
              {it.fonte === 'manual_write' && cardMessage && (
                <p className="mt-1 text-body-sm text-ink-mute">
                  Scrivi a mano sul biglietto: <em>"{cardMessage}"</em>
                </p>
              )}
            </li>
          ))}
        </ul>
        <p className="mt-4 rounded-card bg-bg-soft p-3 text-body-sm text-ink">
          📋 Lascia tutto su: <strong>{placement}</strong>
        </p>
      </section>

      <section className="mt-6 rounded-card border border-line bg-paper p-4">
        <h2 className="text-body font-medium text-ink">Foto del setup</h2>
        {kit.cleanerPhotoUrl ? (
          <div className="mt-3">
            <img src={kit.cleanerPhotoUrl} alt="Setup completato" className="w-full rounded-card" />
            <p className="mt-2 text-body-sm text-ok">✓ Setup confermato</p>
          </div>
        ) : (
          <Link
            href={`/c/setup/${kit.kitId}`}
            className="mt-3 inline-flex h-12 w-full items-center justify-center rounded-full bg-terracotta px-6 text-body font-medium text-paper shadow-md hover:bg-terracotta-2"
          >
            📸 Carica foto del setup
          </Link>
        )}
      </section>
    </main>
  );
}

function cleanerLabelForItem(item: {
  fonte?: string;
  specificDescription?: string;
  taxonomyKey?: string;
  quantity?: number;
}): string {
  const name = item.specificDescription ?? item.taxonomyKey ?? 'item';
  const qty = item.quantity && item.quantity > 1 ? `${item.quantity}× ` : '';
  const fonteHint =
    item.fonte === 'glovo'
      ? ' (lo ordino io a Glovo)'
      : item.fonte === 'amazon'
        ? ' (te lo porto io)'
        : item.fonte === 'manual_write'
          ? ' (biglietto manoscritto)'
          : '';
  return `${qty}${name}${fonteHint}`;
}
