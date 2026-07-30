import { getCurrentHostId } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { properties } from '@premura/db';
import { and, eq } from 'drizzle-orm';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CalendarManager } from './_components/CalendarManager';

// Calendari di una struttura: piu' feed iCal (Booking + Airbnb + channel
// manager) con verifica immediata. Da qui si aggiunge ad es. il feed
// Airbnb a una property che ha solo Booking.

export const dynamic = 'force-dynamic';

export default async function PropertyCalendarsPage(props: {
  params: Promise<{ propertyId: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const { propertyId } = await props.params;
  const { created } = await props.searchParams;
  const hostId = await getCurrentHostId();
  const { db } = await getDb();

  const [property] = await db
    .select({ id: properties.id, name: properties.name, icalSources: properties.icalSources })
    .from(properties)
    .where(and(eq(properties.id, propertyId), eq(properties.hostId, hostId)))
    .limit(1);
  if (!property) notFound();

  return (
    <main className="mx-auto min-h-screen w-full max-w-md bg-ivory px-5 pt-10 pb-16 lg:max-w-2xl">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-serif text-[clamp(28px,5vw,40px)] leading-tight text-ink">
            Calendari
          </h1>
          <p className="mt-1 text-body-sm text-ink-mute">{property.name}</p>
        </div>
        <Link
          href="/properties"
          className="text-body-sm text-ink-mute underline-offset-2 hover:underline"
        >
          ← Strutture
        </Link>
      </header>

      {created ? (
        <p className="mb-6 rounded-card border border-line bg-paper px-4 py-3 text-body-sm text-ink-soft">
          Struttura creata. Ultimo passo: collega i calendari, così le prenotazioni arrivano da
          sole.
        </p>
      ) : null}

      <CalendarManager propertyId={property.id} feeds={property.icalSources} />
    </main>
  );
}
