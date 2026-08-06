import { getCurrentHostId } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { startTimer, timed } from '@/lib/perf';
import { listUpcomingCheckins } from '@/lib/repositories/upcoming-checkins';
import { createDirectBookingAction } from '../actions';
import { AddBookingButton } from '../_components/AddBookingButton';
import Link from 'next/link';
import {
  type UpcomingCheckinCardData,
  UpcomingCheckinsBoard,
} from './_components/UpcomingCheckinsBoard';

// Pagina "prossimi check-in" — ristrutturata (richiesta Andrea 29/07):
// filtro struttura, gruppi per property, tre stati Premura, arrivo
// relativo, timeline invii, layout desktop a larghezza piena.
//
// La finestra ora include anche i soggiorni IN CORSO (checkout futuro):
// servono per vedere gli ospiti esclusi di proposito mentre sono in casa.

export const dynamic = 'force-dynamic';

export default async function UpcomingCheckinsPage(): Promise<React.JSX.Element> {
  const stop = startTimer('PAGINA /dashboard/upcoming-checkins dati');
  const hostId = await timed('getCurrentHostId', () => getCurrentHostId());
  const { db } = await getDb();
  const { rows, properties, welcomeTimeSlot } = await timed('q listUpcomingCheckins', () =>
    listUpcomingCheckins(db, hostId),
  );
  stop();

  const propertyOptions = properties.map((p) => ({ id: p.id, name: p.name }));

  const data: UpcomingCheckinCardData[] = rows.map((r) => ({
    id: r.id,
    guestFullName: r.guestFullName,
    guestFirstName: r.guestFirstName,
    propertyId: r.propertyId,
    propertyName: r.propertyName,
    propertyColor: r.propertyColor,
    checkinAt: r.checkinAt.toISOString(),
    checkoutAt: r.checkoutAt.toISOString(),
    numGuests: r.numGuests,
    platform: r.platform,
    guestPhone: r.guestPhone,
    premuraActiveAt: r.premuraActiveAt ? r.premuraActiveAt.toISOString() : null,
    premuraState: r.premuraState,
    surveyStatus: r.surveyStatus,
    surveySentAt: r.surveySentAt ? r.surveySentAt.toISOString() : null,
    surveyCompletedAt: r.surveyCompletedAt ? r.surveyCompletedAt.toISOString() : null,
    welcomeSentAt: r.welcomeSentAt ? r.welcomeSentAt.toISOString() : null,
    unknownOccupied: r.unknownOccupied,
    outbound: r.outbound.map((o) => ({
      trigger: o.trigger,
      status: o.status,
      sentAt: o.sentAt ? o.sentAt.toISOString() : null,
      dryRun: o.dryRun,
    })),
  }));

  // Conteggi solo sulle prenotazioni vere: le fasce "occupato sorgente
  // ignota" (iCal Booking senza ospite) hanno il loro numero a parte e
  // non contano mai come "senza numero" (decisione 30/07).
  const realBookings = data.filter((b) => !b.unknownOccupied);
  const total = realBookings.length;
  const missing = realBookings.filter((b) => b.premuraState === 'missing_phone').length;
  const excluded = realBookings.filter((b) => b.premuraState === 'excluded').length;
  const occupiedUnknown = data.length - realBookings.length;

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl bg-ivory px-5 pt-12 pb-16 xl:max-w-[1400px] xl:px-10">
      <header className="mb-8">
        <Link
          href="/dashboard"
          className="text-eyebrow uppercase text-ink-mute hover:text-ink-soft"
        >
          ← Oggi
        </Link>
        <h1 className="mt-2 font-serif text-h1 leading-[1.05] tracking-tight text-ink">
          Chi arriva
        </h1>
        <p className="mt-3 text-body-lg text-ink-soft">
          Soggiorni in corso e arrivi dei prossimi 14 giorni. Il numero WhatsApp attiva l'agente;
          puoi escludere un ospite in ogni momento.
        </p>
      </header>

      {total === 0 && occupiedUnknown === 0 ? (
        <div className="rounded-card border border-line-soft bg-paper px-6 py-10 text-center shadow-sm">
          <p className="font-serif text-h3 leading-tight text-ink">Tutto tranquillo qui.</p>
          <p className="mt-2 text-body text-ink-soft">
            Nessun soggiorno in corso e nessun check-in nei prossimi 14 giorni. Quando arriveranno
            nuove prenotazioni le vedrai qui.
          </p>
          {/* 05/08: e' il punto esatto in cui un host con una
              prenotazione diretta si bloccava — nessun modo di
              aggiungerla. Qui il bottone e' l'azione principale. */}
          <div className="mt-6">
            <AddBookingButton
              properties={propertyOptions}
              createAction={createDirectBookingAction}
              variant="primary"
              label="Aggiungi una prenotazione"
            />
          </div>
        </div>
      ) : (
        <>
          <div
            className={`mb-6 rounded-card border px-5 py-4 shadow-sm ${
              missing > 0
                ? 'border-terracotta-soft bg-peach text-terracotta-2'
                : 'border-ok/30 bg-line-soft text-ok'
            }`}
          >
            <p className="font-serif text-h4 leading-tight">
              {total} {total === 1 ? 'prenotazione' : 'prenotazioni'}
              {total > 0
                ? missing > 0
                  ? ` · ${missing} senza numero`
                  : ' · tutti i numeri inseriti ✓'
                : ''}
              {excluded > 0 ? ` · ${excluded} ${excluded === 1 ? 'esclusa' : 'escluse'}` : ''}
              {occupiedUnknown > 0
                ? ` · ${occupiedUnknown} ${occupiedUnknown === 1 ? 'fascia occupata' : 'fasce occupate'} da verificare`
                : ''}
            </p>
            {missing > 0 ? (
              <p className="mt-1 text-body-sm opacity-80">
                Senza numero WhatsApp non possiamo contattare l'ospite per la survey o l'omaggio al
                check-in.
              </p>
            ) : null}
          </div>

          <div className="mb-6">
            <AddBookingButton
              properties={propertyOptions}
              createAction={createDirectBookingAction}
              variant="outline"
            />
          </div>

          <UpcomingCheckinsBoard
            rows={data}
            properties={properties}
            welcomeTimeSlot={welcomeTimeSlot}
          />
        </>
      )}
    </main>
  );
}
