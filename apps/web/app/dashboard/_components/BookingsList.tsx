import type { OccupiedRange } from '@/lib/occupied-ranges';
import { propertyColorOrFallback } from '@/lib/property-color';
import { type BookingForDashboard, isIncompleteDataSource } from '@/lib/types';
import Link from 'next/link';
import { BookingRow } from './BookingRow';
import type { CompleteBookingActionFn, SkipBookingActionFn } from './CompleteBookingDialog';
import { OccupiedRangesSection } from './OccupiedRangesSection';

// Liste prenotazioni della HOME (ristrutturazione 30/07):
//  - "Da completare" (data_source incomplete non-iCal, non skipped)
//  - "Date occupate" (booking_ical_only): fasce senza ospite noto,
//    etichetta propria, mai mescolate al resto
//  - NIENTE "Prossimi ospiti" qui: era il duplicato della pagina
//    Prossimi check-in, che resta l'elenco operativo completo.
//
// Regole mobile: righe RAGGRUPPATE PER STRUTTURA con intestazione
// sticky; massimo 6 righe per sezione + "Vedi tutte (N)". Ogni riga
// dice comunque di quale struttura parla (titolo o sottotitolo).

const HOME_ROWS_LIMIT = 6;

function isUnknownOccupied(b: BookingForDashboard): boolean {
  return b.dataSource === 'booking_ical_only' && !b.hostSkippedCompletion;
}

function isToComplete(b: BookingForDashboard): boolean {
  return isIncompleteDataSource(b.dataSource) && !b.hostSkippedCompletion && !isUnknownOccupied(b);
}

function groupByProperty(items: BookingForDashboard[]): Map<string, BookingForDashboard[]> {
  const groups = new Map<string, BookingForDashboard[]>();
  for (const b of items) {
    const list = groups.get(b.propertyName) ?? [];
    list.push(b);
    groups.set(b.propertyName, list);
  }
  return groups;
}

function GroupedRows({
  items,
  completeAction,
  skipAction,
}: {
  items: BookingForDashboard[];
  completeAction: CompleteBookingActionFn;
  skipAction: SkipBookingActionFn;
}) {
  const groups = groupByProperty(items);
  return (
    <div className="mt-3 flex flex-col gap-1.5">
      {[...groups.entries()].map(([propertyName, rows]) => (
        <section key={propertyName}>
          <h3
            className="sticky top-0 z-10 -mx-1 bg-ivory/95 px-1 py-1.5 text-[12px] font-semibold uppercase tracking-[0.1em] backdrop-blur-sm"
            style={{ color: propertyColorOrFallback(rows[0]?.propertyColor ?? null, propertyName) }}
          >
            {propertyName}
          </h3>
          {/* Desktop: griglia 2-3 colonne; mobile: colonna del prototipo. */}
          <ul className="flex flex-col gap-2 md:grid md:grid-cols-2 md:items-start xl:grid-cols-3">
            {rows.map((b) => (
              <li key={b.id}>
                <BookingRow booking={b} completeAction={completeAction} skipAction={skipAction} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function SectionHeader({ title, eyebrow }: { title: string; eyebrow: string }) {
  return (
    <div className="flex items-baseline justify-between pt-2">
      <h2 className="font-serif text-[24px] font-medium leading-tight text-ink">{title}</h2>
      <span className="text-eyebrow font-medium uppercase text-ink-mute">{eyebrow}</span>
    </div>
  );
}

function SeeAll({ total }: { total: number }) {
  return (
    <Link
      href="/dashboard/upcoming-checkins"
      className="mt-2.5 inline-block text-body-sm font-medium text-terracotta-2 underline-offset-2 hover:underline"
    >
      Vedi tutte ({total})
    </Link>
  );
}

export function BookingsList({
  bookings,
  properties,
  completeAction,
  skipAction,
}: {
  bookings: BookingForDashboard[];
  /** Tutte le strutture dell'host (per i segmenti Date occupate). */
  properties: Array<{ id: string; name: string; color: string | null }>;
  completeAction: CompleteBookingActionFn;
  skipAction: SkipBookingActionFn;
}) {
  const toComplete = bookings.filter(isToComplete);
  const unknownOccupied = bookings.filter(isUnknownOccupied);

  return (
    <div className="px-5 pt-8 md:px-0">
      {toComplete.length > 0 ? (
        <section id="incomplete" className="mb-8 scroll-mt-6">
          <SectionHeader
            title="Da completare"
            eyebrow={`${toComplete.length} ${toComplete.length === 1 ? 'prenotazione' : 'prenotazioni'}`}
          />
          <GroupedRows
            items={toComplete.slice(0, HOME_ROWS_LIMIT)}
            completeAction={completeAction}
            skipAction={skipAction}
          />
          {toComplete.length > HOME_ROWS_LIMIT ? <SeeAll total={toComplete.length} /> : null}
        </section>
      ) : null}

      {unknownOccupied.length > 0 ? (
        <section className="mb-8">
          <SectionHeader
            title="Date occupate"
            eyebrow={`${unknownOccupied.length} ${unknownOccupied.length === 1 ? 'fascia' : 'fasce'}`}
          />
          <p className="mb-3 mt-1 text-body-sm text-ink-mute">
            Il calendario Booking dice solo che queste date sono occupate, non chi arriva — verifica
            sull'extranet e tocca la fascia per completare i dati dell'ospite.
          </p>
          {/* Ristrutturazione 30/07: gruppi per urgenza, chip struttura,
              date complete — vedi OccupiedRangesSection. */}
          <OccupiedRangesSection
            ranges={unknownOccupied.map(
              (b): OccupiedRange => ({
                id: b.id,
                propertyId: b.propertyId,
                propertyName: b.propertyName,
                propertyColor: b.propertyColor,
                checkinAtIso: b.checkinAt.toISOString(),
                checkoutAtIso: b.checkoutAt.toISOString(),
              }),
            )}
            properties={properties}
            bookingsById={Object.fromEntries(unknownOccupied.map((b) => [b.id, b]))}
            completeAction={completeAction}
            skipAction={skipAction}
          />
        </section>
      ) : null}
    </div>
  );
}
