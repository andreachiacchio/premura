import {
  isIncompleteDataSource,
  type BookingForDashboard,
} from "@/lib/types";
import { BookingRow } from "./BookingRow";
import type {
  CompleteBookingActionFn,
  SkipBookingActionFn,
} from "./CompleteBookingDialog";

// Lista verticale di prenotazioni, raggruppate in due gruppi:
//  1. "Da completare" (data_source incomplete, non skipped)
//  2. "Tutte le prenotazioni" (skipped + RICH + airbnb_ical_only)
//
// Il gruppo 2 mostra anche le skipped con badge "Saltata": l'host puo
// sempre tornare e cliccarle per completarle, ma in slice 5 le righe
// non sono cliccabili (BookingRow apre il dialog solo per INCOMPLETE
// non skipped). Sara' rifinito quando avremo dettaglio ospite (M3).

function isToComplete(b: BookingForDashboard): boolean {
  return isIncompleteDataSource(b.dataSource) && !b.hostSkippedCompletion;
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
  const others = bookings.filter((b) => !isToComplete(b));

  return (
    <div className="px-5 pt-6">
      {toComplete.length > 0 ? (
        <section id="incomplete" className="mb-6 scroll-mt-6">
          <SectionHeader
            title="Da completare"
            eyebrow={`${toComplete.length} ${toComplete.length === 1 ? "prenotazione" : "prenotazioni"}`}
          />
          <ul className="mt-3 flex flex-col gap-2.5">
            {toComplete.map((b) => (
              <li key={b.id}>
                <BookingRow
                  booking={b}
                  completeAction={completeAction}
                  skipAction={skipAction}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {others.length > 0 ? (
        <section>
          <SectionHeader
            title="Tutte le prenotazioni"
            eyebrow={`${others.length} ${others.length === 1 ? "prenotazione" : "prenotazioni"}`}
          />
          <ul className="mt-3 flex flex-col gap-2.5">
            {others.map((b) => (
              <li key={b.id}>
                <BookingRow
                  booking={b}
                  completeAction={completeAction}
                  skipAction={skipAction}
                />
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
      <span className="text-eyebrow font-medium uppercase text-ink-mute">
        {eyebrow}
      </span>
    </div>
  );
}
