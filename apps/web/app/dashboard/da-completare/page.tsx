import { BackLink } from '@/components/BackLink';
import { getCurrentHostId } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { startTimer, timed } from '@/lib/perf';
import { findByHostId } from '@/lib/repositories/bookings';
import { isIncompleteDataSource } from '@/lib/types';
import { completeBookingAction, skipBookingAction } from '../actions';
import { AddBookingButton } from '../_components/AddBookingButton';
import { createDirectBookingAction } from '../actions';
import { CompletionRows, type CompletionRow } from './_components/CompletionRows';
import { findByHostId as findPropertiesByHostId } from '@/lib/repositories/properties';

// Compilazione a lista (Andrea 05/08, opzione A).
//
// Il punto 1 della sua revisione del modale: "NON SCALA — dieci slot
// anonimi sono dieci compilazioni a mano". Delle tre strade rimaste,
// questa e' quella che costa poco e si vede subito: le fasce stanno
// tutte su uno schermo, una riga ciascuna.
//
// Perche' non elimina la ricopiatura: per Booking non esiste una
// strada automatica. L'iCal e' anonimo, l'email di conferma contiene
// solo numero prenotazione e link all'extranet (verificato su email
// reale), e la Connectivity API e' chiusa ai nuovi entranti. L'unico
// percorso in cui i dati arrivano senza ricopiatura e' chiedere
// all'ospite: quello vive altrove, qui si riduce l'attrito di quello
// che resta manuale.

export const dynamic = 'force-dynamic';

export default async function DaCompletarePage(): Promise<React.JSX.Element> {
  const stop = startTimer('PAGINA /dashboard/da-completare dati');
  const hostId = await timed('getCurrentHostId', () => getCurrentHostId());
  const { db } = await getDb();
  const [bookings, hostProperties] = await Promise.all([
    timed('q findByHostId', () => findByHostId({ db, hostId })),
    timed('q findPropertiesByHostId', () => findPropertiesByHostId({ db, hostId })),
  ]);
  stop();

  const daCompletare: CompletionRow[] = bookings
    .filter((b) => isIncompleteDataSource(b.dataSource) && !b.hostSkippedCompletion)
    .map((b) => ({
      id: b.id,
      propertyName: b.propertyName,
      propertyColor: b.propertyColor,
      checkinAt: b.checkinAt.toISOString(),
      checkoutAt: b.checkoutAt.toISOString(),
      numGuests: b.numGuests,
      bookingExternalCode: b.bookingExternalCode ?? null,
    }))
    .sort((a, b) => a.checkinAt.localeCompare(b.checkinAt));

  const propertyOptions = hostProperties.map((p) => ({ id: p.id, name: p.name }));

  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl bg-ivory px-5 pt-12 pb-16">
      <header className="mb-8">
        <BackLink href="/dashboard">Oggi</BackLink>
        <h1 className="mt-2 font-serif text-h1 leading-[1.05] tracking-tight text-ink">
          Date da completare
        </h1>
        {daCompletare.length > 0 ? (
          <p className="mt-3 text-body-lg text-ink-soft">
            Booking mi manda le date ma non i nomi. Aggiungi nome e numero e me ne occupo io —
            tutte qui, senza aprire una finestra alla volta.
          </p>
        ) : (
          <p className="mt-3 text-body-lg text-ink-soft">
            Non c’è niente da completare: di ogni data occupata so già chi arriva.
          </p>
        )}
      </header>

      {daCompletare.length > 0 ? (
        <>
          <p className="mb-4 text-body-sm text-ink-mute">
            {daCompletare.length === 1
              ? '1 data da completare'
              : `${daCompletare.length} date da completare`}
          </p>
          <CompletionRows
            rows={daCompletare}
            completeAction={completeBookingAction}
            skipAction={skipBookingAction}
          />
        </>
      ) : (
        <div className="rounded-card border border-line-soft bg-paper px-6 py-10 text-center shadow-sm">
          <p className="text-body text-ink-soft">
            Se prendi una prenotazione al telefono o via email, aggiungila da qui.
          </p>
          <div className="mt-5 flex justify-center">
            <AddBookingButton
              properties={propertyOptions}
              createAction={createDirectBookingAction}
              variant="primary"
              label="Aggiungi una prenotazione"
            />
          </div>
        </div>
      )}
    </main>
  );
}
