import { type BookingForDashboard, isIncompleteDataSource } from '@/lib/types';
import { BookingRow } from './BookingRow';
import type { CompleteBookingActionFn, SkipBookingActionFn } from './CompleteBookingDialog';

// Lista verticale di prenotazioni operative (in corso o future con
// check-in da oggi - 2gg in avanti, filtro applicato in
// findByHostId), raggruppate in TRE gruppi (decisione 30/07):
//  1. "Da completare" (data_source incomplete non-iCal, non skipped)
//  2. "Date occupate" (booking_ical_only): l'iCal Booking esporta ogni
//     fascia occupata senza dire chi arriva — prenotazione vera o
//     chiusura, non si sa. Etichetta propria, MAI mescolate al resto:
//     "verifica chi arriva sull'extranet".
//  3. "Prossimi ospiti" (skipped + RICH + airbnb_ical_only)
//
// L'archivio (prenotazioni passate) non ha ancora una vista dedicata,
// vedi KNOWN-LIMITS sezione 20.

function isUnknownOccupied(b: BookingForDashboard): boolean {
  return b.dataSource === 'booking_ical_only' && !b.hostSkippedCompletion;
}

function isToComplete(b: BookingForDashboard): boolean {
  return isIncompleteDataSource(b.dataSource) && !b.hostSkippedCompletion && !isUnknownOccupied(b);
}

export function BookingsList({
  bookings,
  completeAction,
  skipAction,
}: {
  bookings: BookingForDashboard[];
  completeAction: CompleteBookingActionFn;
  skipAction: SkipBookingActionFn;
}) {
  const toComplete = bookings.filter(isToComplete);
  const unknownOccupied = bookings.filter(isUnknownOccupied);
  const others = bookings.filter((b) => !isToComplete(b) && !isUnknownOccupied(b));

  return (
    <div className="px-5 pt-6">
      {toComplete.length > 0 ? (
        <section id="incomplete" className="mb-6 scroll-mt-6">
          <SectionHeader
            title="Da completare"
            eyebrow={`${toComplete.length} ${toComplete.length === 1 ? 'prenotazione' : 'prenotazioni'}`}
          />
          <ul className="mt-3 flex flex-col gap-2.5 lg:grid lg:grid-cols-2 lg:items-start xl:grid-cols-3">
            {toComplete.map((b) => (
              <li key={b.id}>
                <BookingRow booking={b} completeAction={completeAction} skipAction={skipAction} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {unknownOccupied.length > 0 ? (
        <section className="mb-6">
          <SectionHeader
            title="Date occupate"
            eyebrow={`${unknownOccupied.length} ${unknownOccupied.length === 1 ? 'fascia' : 'fasce'}`}
          />
          <p className="mt-1 text-body-sm text-ink-mute">
            Il calendario Booking dice solo che queste date sono occupate, non chi arriva — verifica
            sull'extranet e completa i dati dell'ospite.
          </p>
          <ul className="mt-3 flex flex-col gap-2.5 lg:grid lg:grid-cols-2 lg:items-start xl:grid-cols-3">
            {unknownOccupied.map((b) => (
              <li key={b.id}>
                <BookingRow booking={b} completeAction={completeAction} skipAction={skipAction} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {others.length > 0 ? (
        <section>
          <SectionHeader
            title="Prossimi ospiti"
            eyebrow={`${others.length} ${others.length === 1 ? 'prenotazione' : 'prenotazioni'}`}
          />
          <ul className="mt-3 flex flex-col gap-2.5 lg:grid lg:grid-cols-2 lg:items-start xl:grid-cols-3">
            {others.map((b) => (
              <li key={b.id}>
                <BookingRow booking={b} completeAction={completeAction} skipAction={skipAction} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function SectionHeader({
  title,
  eyebrow,
}: {
  title: string;
  eyebrow: string;
}) {
  return (
    <div className="flex items-baseline justify-between">
      <h2 className="font-serif text-[22px] leading-tight text-ink">{title}</h2>
      <span className="text-eyebrow font-medium uppercase text-ink-mute">{eyebrow}</span>
    </div>
  );
}
