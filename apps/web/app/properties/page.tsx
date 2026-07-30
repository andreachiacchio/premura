import { getCurrentHostId } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { bookings, properties } from '@premura/db';
import { and, eq, ne, sql } from 'drizzle-orm';
import { ChevronRight } from 'lucide-react';
import Link from 'next/link';

// Pagina "Strutture" — elenco minimo (bug produzione 30/07: la voce di
// navigazione portava a un 404). Nome, citta', feed configurati,
// prenotazioni. Il wizard "aggiungi struttura" arriva la settimana
// prossima: qui c'e' solo la verita' su cio' che esiste.
//
// Sui feed diciamo cio' che SAPPIAMO: "configurato" o "nessun feed".
// Non "attivo" — lo stato di sincronizzazione (ultimo sync, esito) non
// e' ancora tracciato per feed, e una spia verde non verificata sarebbe
// una bugia. Quando arrivera' il tracking, qui diventera' uno stato vero.

export const dynamic = 'force-dynamic';

const SOURCE_LABELS: Record<string, string> = {
  booking: 'Booking',
  airbnb: 'Airbnb',
  channel_manager: 'Channel manager',
};

export default async function PropertiesPage() {
  const hostId = await getCurrentHostId();
  const { db } = await getDb();

  // Conteggi in query aggregata separata, come fa la home (bug produzione
  // 30/07: una subquery correlata nella select list qui sotto usciva con
  // ${properties.id} reso NON qualificato — "id" — che dentro la subquery
  // si risolveva su bookings, quindi b.property_id = b.id: 0 ovunque).
  const [rows, counts] = await Promise.all([
    db
      .select({
        id: properties.id,
        name: properties.name,
        city: properties.city,
        icalSources: properties.icalSources,
        isActive: properties.isActive,
      })
      .from(properties)
      .where(eq(properties.hostId, hostId))
      .orderBy(properties.createdAt),
    db
      .select({
        propertyId: bookings.propertyId,
        total: sql<number>`count(*)::int`,
        upcoming: sql<number>`(count(*) filter (where ${bookings.checkoutAt} >= now()))::int`,
      })
      .from(bookings)
      .innerJoin(properties, eq(properties.id, bookings.propertyId))
      .where(and(eq(properties.hostId, hostId), ne(bookings.status, 'cancelled')))
      .groupBy(bookings.propertyId),
  ]);
  const countsByProperty = new Map(counts.map((c) => [c.propertyId, c]));

  return (
    <main className="mx-auto min-h-screen w-full max-w-md bg-ivory px-5 pt-10 pb-16 lg:max-w-5xl xl:max-w-[1400px]">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-serif text-[clamp(28px,5vw,40px)] leading-tight text-ink">
            Strutture
          </h1>
          <p className="mt-1 text-body-sm text-ink-mute">Le tue case e i calendari collegati.</p>
        </div>
        <Link
          href="/dashboard"
          className="text-body-sm text-ink-mute underline-offset-2 hover:underline"
        >
          ← Dashboard
        </Link>
      </header>

      <ul className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:items-start xl:grid-cols-3">
        {rows.map((p) => {
          const totalBookings = countsByProperty.get(p.id)?.total ?? 0;
          const upcomingBookings = countsByProperty.get(p.id)?.upcoming ?? 0;
          return (
            <li key={p.id} className="rounded-card border border-line bg-paper p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-[16px] font-semibold text-ink">{p.name}</h2>
                  <p className="mt-0.5 text-body-sm text-ink-mute capitalize">{p.city}</p>
                </div>
                {!p.isActive ? (
                  <span className="rounded-full bg-line px-2 py-0.5 text-[11px] font-medium text-ink-mute">
                    Sospesa
                  </span>
                ) : null}
              </div>

              <div className="mt-3 flex flex-col gap-1">
                {p.icalSources.length === 0 ? (
                  <p className="text-body-sm text-terracotta-2">
                    Nessun calendario collegato — le prenotazioni non arrivano da sole
                  </p>
                ) : (
                  p.icalSources.map((src) => (
                    <p key={src.url} className="flex items-center gap-2 text-body-sm text-ink-soft">
                      <span aria-hidden className="size-1.5 rounded-full bg-ok" />
                      Calendario {SOURCE_LABELS[src.source] ?? src.source} configurato
                    </p>
                  ))
                )}
              </div>

              <div className="mt-3 flex items-center justify-between border-t border-line-soft pt-3">
                <p className="text-body-sm text-ink-mute">
                  {upcomingBookings} {upcomingBookings === 1 ? 'soggiorno' : 'soggiorni'} in arrivo
                  · {totalBookings} totali
                </p>
                <Link
                  href={`/properties/${p.id}/knowledge`}
                  className="inline-flex items-center gap-1 text-body-sm font-medium text-terracotta-2 hover:underline"
                >
                  Info casa
                  <ChevronRight aria-hidden className="size-4" />
                </Link>
              </div>
            </li>
          );
        })}
      </ul>

      <p className="mt-6 text-body-sm text-ink-mute">
        Aggiungere una struttura da qui arriva a breve. Nel frattempo si fa dall'onboarding.
      </p>
    </main>
  );
}
