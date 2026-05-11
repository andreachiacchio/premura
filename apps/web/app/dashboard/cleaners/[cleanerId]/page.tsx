import { getCurrentHostId } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { getCleanerForHost, listPropertiesForCleaner } from '@/lib/repositories/cleaners';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CleanerActions } from './_components/CleanerActions';

export const dynamic = 'force-dynamic';

const LANGUAGE_LABELS: Record<string, string> = {
  it: 'Italiano',
  en: 'English',
  es: 'Español',
};

export default async function CleanerDetailPage({
  params,
}: { params: Promise<{ cleanerId: string }> }): Promise<React.JSX.Element> {
  const { cleanerId } = await params;
  const hostId = await getCurrentHostId();
  const { db } = await getDb();
  const cleaner = await getCleanerForHost(db, cleanerId, hostId);
  if (!cleaner) notFound();

  const assignedProperties = await listPropertiesForCleaner(db, cleanerId, hostId);

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <header className="mb-6">
        <Link
          href="/dashboard/cleaners"
          className="mb-3 inline-block text-sm text-ink-mute underline-offset-2 hover:underline"
        >
          ← Cleaner
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-ink">{cleaner.fullName}</h1>
            <p className="mt-1 text-sm text-ink-mute">
              {cleaner.whatsappNumber}
              {cleaner.email ? ` · ${cleaner.email}` : ''}
            </p>
          </div>
          <Link
            href={`/dashboard/cleaners/${cleaner.id}/edit`}
            className="rounded-md border border-line bg-white px-4 py-2 text-sm font-medium text-ink hover:border-terracotta"
          >
            Modifica
          </Link>
        </div>
      </header>

      <section className="mb-6 grid gap-4 md:grid-cols-2">
        <DetailCard label="Indirizzo consegna" value={cleaner.deliveryAddress} />
        <DetailCard label="Punto ritiro" value={cleaner.pickupPointCode || '—'} />
        <DetailCard label="Fee per kit" value={`€${cleaner.perKitFeeEur}`} />
        <DetailCard
          label="Metodo pagamento"
          value={cleaner.payoutMethod === 'stripe_connect' ? 'Stripe Connect' : 'Cash'}
        />
        <DetailCard
          label="Lingua preferita"
          value={LANGUAGE_LABELS[cleaner.languagePreferred] ?? cleaner.languagePreferred}
        />
        <DetailCard label="Stato" value={cleaner.isActive ? 'Attivo' : 'Inattivo'} />
      </section>

      <section className="mb-6 rounded-lg border border-line bg-white p-4">
        <h2 className="mb-3 text-base font-medium text-ink">
          Property assegnate ({assignedProperties.length})
        </h2>
        {assignedProperties.length === 0 ? (
          <p className="text-sm text-ink-mute">
            Nessuna property assegnata. Vai sulle{' '}
            <Link href="/dashboard" className="text-terracotta underline-offset-2 hover:underline">
              property
            </Link>{' '}
            per assegnare.
          </p>
        ) : (
          <ul className="space-y-2">
            {assignedProperties.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between rounded border border-line px-3 py-2 text-sm"
              >
                <div>
                  <p className="font-medium">{p.name}</p>
                  {p.addressLine && <p className="text-xs text-ink-mute">{p.addressLine}</p>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {cleaner.notes && (
        <section className="mb-6 rounded-lg border border-line bg-bg-soft p-4">
          <h2 className="mb-2 text-sm font-medium text-ink-mute">Note</h2>
          <p className="whitespace-pre-line text-sm">{cleaner.notes}</p>
        </section>
      )}

      <CleanerActions
        cleanerId={cleaner.id}
        isActive={cleaner.isActive}
        karenAccepted={cleaner.karenAccepted}
      />
    </div>
  );
}

function DetailCard({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div className="rounded-lg border border-line bg-white p-4">
      <p className="text-xs text-ink-mute">{label}</p>
      <p className="mt-1 text-sm font-medium text-ink">{value}</p>
    </div>
  );
}
