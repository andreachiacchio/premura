import { getCurrentHostId } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { startTimer, timed } from '@/lib/perf';
import { bookings, properties } from '@premura/db';
import { and, eq, ne, sql } from 'drizzle-orm';
import { ChevronRight } from 'lucide-react';
import Link from 'next/link';

// Pagina "Strutture": nome, citta', feed configurati, prenotazioni.
// Da qui si entra nel wizard "Aggiungi struttura" (/properties/new)
// e nei calendari per-property (/properties/[id]/calendars).
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

// Resilienza per sezione (regola della home, incidente produzione 30/07
// digest 3483798615): una query che fallisce — pool esaurito, RLS,
// schema drift — degrada la SUA sezione, non butta giu' la pagina.
async function safeQuery<T>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await timed(`q ${label}`, fn);
  } catch (err) {
    console.error(`[properties] ${label} failed`, err);
    return fallback;
  }
}

export default async function PropertiesPage() {
  const stop = startTimer('PAGINA /properties dati');
  const hostId = await timed('getCurrentHostId', () => getCurrentHostId());
  const { db } = await getDb();

  // Conteggi in query aggregata separata, come fa la home (bug produzione
  // 30/07: una subquery correlata nella select list qui sotto usciva con
  // ${properties.id} reso NON qualificato — "id" — che dentro la subquery
  // si risolveva su bookings, quindi b.property_id = b.id: 0 ovunque).
  const [rows, counts] = await Promise.all([
    safeQuery(
      'listProperties',
      () =>
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
      null,
    ),
    safeQuery(
      'bookingCounts',
      () =>
        db
          .select({
            propertyId: bookings.propertyId,
            total: sql<number>`count(*)::int`,
            upcoming: sql<number>`(count(*) filter (where ${bookings.checkoutAt} >= now()))::int`,
          })
          .from(bookings)
          .innerJoin(properties, eq(properties.id, bookings.propertyId))
          .where(
            and(
              eq(properties.hostId, hostId),
              ne(bookings.status, 'cancelled'),
              eq(bookings.isCalendarBlock, false),
            ),
          )
          .groupBy(bookings.propertyId),
      null,
    ),
  ]);
  stop();
  // counts null = conteggi non disponibili: si dice, non si mostra uno
  // 0 finto ("mai due verita'").
  const countsByProperty = counts ? new Map(counts.map((c) => [c.propertyId, c])) : null;

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

      <Link
        href="/properties/new"
        className="mb-6 inline-flex h-11 items-center justify-center rounded-full bg-terracotta px-6 text-body-sm font-medium text-paper shadow-md transition-colors hover:bg-terracotta-2"
      >
        + Aggiungi struttura
      </Link>

      {rows === null ? (
        <div className="rounded-card border border-line-soft bg-paper px-6 py-8 text-center text-body text-ink-soft shadow-sm">
          Le strutture non sono raggiungibili in questo momento. Ricarica la pagina fra qualche
          secondo.
        </div>
      ) : null}

      <ul className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:items-start xl:grid-cols-3">
        {(rows ?? []).map((p) => {
          const totalBookings = countsByProperty?.get(p.id)?.total ?? 0;
          const upcomingBookings = countsByProperty?.get(p.id)?.upcoming ?? 0;
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
                  {countsByProperty === null
                    ? 'conteggi non disponibili al momento'
                    : `${upcomingBookings} ${upcomingBookings === 1 ? 'soggiorno' : 'soggiorni'} in arrivo · ${totalBookings} totali`}
                </p>
                <span className="flex items-center gap-3">
                  <Link
                    href={`/properties/${p.id}/services`}
                    className="inline-flex items-center gap-1 text-body-sm font-medium text-terracotta-2 hover:underline"
                  >
                    Servizi
                  </Link>
                  <Link
                    href={`/properties/${p.id}/calendars`}
                    className="inline-flex items-center gap-1 text-body-sm font-medium text-terracotta-2 hover:underline"
                  >
                    Calendari
                  </Link>
                  <Link
                    href={`/properties/${p.id}/knowledge`}
                    className="inline-flex items-center gap-1 text-body-sm font-medium text-terracotta-2 hover:underline"
                  >
                    Info casa
                    <ChevronRight aria-hidden className="size-4" />
                  </Link>
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
