import { getCurrentHostId } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { getCleanerForHost } from '@/lib/repositories/cleaners';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CleanerForm } from '../../_components/CleanerForm';

export const dynamic = 'force-dynamic';

export default async function EditCleanerPage({
  params,
}: { params: Promise<{ cleanerId: string }> }): Promise<React.JSX.Element> {
  const { cleanerId } = await params;
  const hostId = await getCurrentHostId();
  const { db } = await getDb();
  const cleaner = await getCleanerForHost(db, cleanerId, hostId);
  if (!cleaner) notFound();

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <header className="mb-6">
        <Link
          href={`/dashboard/cleaners/${cleaner.id}`}
          className="mb-3 inline-block text-sm text-ink-mute underline-offset-2 hover:underline"
        >
          ← Dettaglio cleaner
        </Link>
        <h1 className="text-2xl font-semibold text-ink">Modifica {cleaner.fullName}</h1>
      </header>
      <CleanerForm
        cleanerId={cleaner.id}
        initial={{
          fullName: cleaner.fullName,
          whatsappNumber: cleaner.whatsappNumber,
          email: cleaner.email ?? '',
          deliveryAddress: cleaner.deliveryAddress,
          pickupPointCode: cleaner.pickupPointCode ?? '',
          perKitFeeEur: cleaner.perKitFeeEur,
          payoutMethod: (cleaner.payoutMethod === 'cash' ? 'cash' : 'stripe_connect') as
            | 'cash'
            | 'stripe_connect',
          payoutIban: cleaner.payoutIban ?? '',
          languagePreferred: (cleaner.languagePreferred as 'it' | 'en' | 'es') || 'it',
          notes: cleaner.notes ?? '',
        }}
      />
    </div>
  );
}
