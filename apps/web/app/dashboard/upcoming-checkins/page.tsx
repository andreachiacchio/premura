import { getCurrentHostId } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { listUpcomingCheckins } from '@/lib/repositories/upcoming-checkins';
import Link from 'next/link';
import {
  type UpcomingCheckinCardData,
  UpcomingCheckinsTable,
} from './_components/UpcomingCheckinsTable';

// Slice A — Pagina "prossimi check-in".
// Bulk fill numeri WhatsApp per ospiti in arrivo nei prossimi 14 giorni.
// Quando l'host inserisce un numero, il booking diventa "Premura attivo"
// e tutte le pipeline downstream (slice B/C/D/E) lo prendono.

export const dynamic = 'force-dynamic';

export default async function UpcomingCheckinsPage(): Promise<React.JSX.Element> {
  const hostId = await getCurrentHostId();
  const { db } = await getDb();
  const rows = await listUpcomingCheckins(db, hostId);

  const data: UpcomingCheckinCardData[] = rows.map((r) => ({
    id: r.id,
    guestFullName: r.guestFullName,
    guestFirstName: r.guestFirstName,
    propertyId: r.propertyId,
    propertyName: r.propertyName,
    checkinAt: r.checkinAt.toISOString(),
    checkoutAt: r.checkoutAt.toISOString(),
    numGuests: r.numGuests,
    platform: r.platform,
    guestPhone: r.guestPhone,
    premuraActiveAt: r.premuraActiveAt ? r.premuraActiveAt.toISOString() : null,
    guestPhoneSource: r.guestPhoneSource,
    surveyStatus: r.surveyStatus,
  }));

  const total = data.length;
  const missing = data.filter((b) => !b.guestPhone).length;

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl bg-ivory px-5 pt-12 pb-16">
      <header className="mb-8">
        <Link
          href="/dashboard"
          className="text-eyebrow uppercase text-ink-mute hover:text-ink-soft"
        >
          ← Dashboard
        </Link>
        <h1 className="mt-2 font-serif text-h1 leading-[1.05] tracking-tight text-ink">
          Prossimi check-in
        </h1>
        <p className="mt-3 text-body-lg text-ink-soft">
          Inserisci il numero WhatsApp dei guest in arrivo nei prossimi 14 giorni. Pensiamo noi al
          resto.
        </p>
      </header>

      {total === 0 ? (
        <div className="rounded-card border border-line-soft bg-paper px-6 py-10 text-center shadow-sm">
          <p className="font-serif text-h3 leading-tight text-ink">Tutto tranquillo qui.</p>
          <p className="mt-2 text-body text-ink-soft">
            Nessun check-in nei prossimi 14 giorni. Quando arriveranno nuove prenotazioni le vedrai
            qui.
          </p>
        </div>
      ) : (
        <>
          <div
            className={`mb-5 rounded-card border px-5 py-4 shadow-sm ${
              missing > 0
                ? 'border-terracotta-soft bg-peach text-terracotta-2'
                : 'border-ok/30 bg-line-soft text-ok'
            }`}
          >
            <p className="font-serif text-h4 leading-tight">
              {total} {total === 1 ? 'prenotazione' : 'prenotazioni'} in arrivo
              {missing > 0
                ? ` · ${missing} ${missing === 1 ? 'senza numero' : 'senza numero'}`
                : ' · tutti i numeri inseriti ✓'}
            </p>
            {missing > 0 ? (
              <p className="mt-1 text-body-sm opacity-80">
                Senza numero WhatsApp non possiamo contattare l'ospite per la survey o l'omaggio al
                check-in.
              </p>
            ) : null}
          </div>

          <UpcomingCheckinsTable rows={data} />
        </>
      )}
    </main>
  );
}
