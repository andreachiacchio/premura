import { getCurrentHostId } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { listProvidersForHost, listServicesForProperty } from '@/lib/repositories/services';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ServicesManager } from './_components/ServicesManager';

// Sezione Servizi per struttura (30/07): l'host registra i servizi
// che l'ospite vedra' nella guest app (punto 3 del flusso canonico).
// Prezzi e catalogo vivono nel DB — questa e' la prima superficie di
// gestione dall'interfaccia.

export const dynamic = 'force-dynamic';

export default async function PropertyServicesPage({
  params,
}: {
  params: Promise<{ propertyId: string }>;
}): Promise<React.JSX.Element> {
  const { propertyId } = await params;
  const hostId = await getCurrentHostId();
  const { db } = await getDb();

  const data = await listServicesForProperty(db, hostId, propertyId);
  if (!data) notFound();
  const providers = await listProvidersForHost(db, hostId);

  return (
    <main className="mx-auto min-h-screen w-full max-w-md bg-ivory px-5 pt-10 pb-16 lg:max-w-3xl">
      <header className="mb-6">
        <Link
          href="/properties"
          className="text-eyebrow uppercase text-ink-mute hover:text-ink-soft"
        >
          ← Strutture
        </Link>
        <h1 className="mt-2 font-serif text-[clamp(28px,5vw,40px)] leading-tight text-ink">
          Servizi · {data.property.name}
        </h1>
        <p className="mt-1 text-body-sm text-ink-mute">
          Quello che l'ospite può chiedere durante il soggiorno: tour, transfer, chef. Compare
          nella guest app; il fornitore collegato dice all'agente con chi parlare.
        </p>
      </header>

      <ServicesManager
        propertyId={data.property.id}
        services={data.services}
        providers={providers}
      />
    </main>
  );
}
