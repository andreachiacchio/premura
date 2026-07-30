'use client';

import {
  type OccupiedRange,
  abbreviatePropertyName,
  distanceLabel,
  fullDateRange,
  splitByUrgency,
} from '@/lib/occupied-ranges';
import { propertyColorOrFallback } from '@/lib/property-color';
import type { BookingForDashboard } from '@/lib/types';
import { useEffect, useState } from 'react';
import { CompleteBookingDialog } from './CompleteBookingDialog';
import type { CompleteBookingActionFn, SkipBookingActionFn } from './CompleteBookingDialog';

// Sezione "Date occupate" condivisa tra home e pagina check-in
// (iterazione 30/07 pomeriggio):
//  - "IN CORSO ORA" in evidenza: fascia occupata adesso = qualcuno in
//    casa e non sappiamo chi, il caso piu' urgente della sezione
//  - filtro a segmenti coi conteggi ([Tutte · 18][Villa Cristina · 8]),
//    strutture a zero visibili in grigio, persistenza localStorage
//  - le DATE sono l'elemento principale della riga; la struttura e' un
//    sottotitolo COLORATO sotto (colore = properties.color)
//
// Sulla home le righe restano cliccabili (dialog di completamento).

const LATER_COLLAPSED_COUNT = 3;
const FILTER_STORAGE_KEY = 'premura.occupied.propertyFilter';

export type OccupiedRangesSectionProps = {
  ranges: OccupiedRange[];
  /** Tutte le strutture dell'host (anche a zero fasce), per i segmenti. */
  properties: Array<{ id: string; name: string; color: string | null }>;
  /** Prenotazioni complete per il dialog (solo home). Chiave = range.id. */
  bookingsById?: Record<string, BookingForDashboard>;
  completeAction?: CompleteBookingActionFn;
  skipAction?: SkipBookingActionFn;
};

export function OccupiedRangesSection({
  ranges,
  properties,
  bookingsById,
  completeAction,
  skipAction,
}: OccupiedRangesSectionProps): React.JSX.Element | null {
  const [showAllLater, setShowAllLater] = useState(false);
  const [openRangeId, setOpenRangeId] = useState<string | null>(null);
  // Filtro persistente (stessa regola dei check-in): letto DOPO il
  // mount per non rompere l'hydration.
  const [filter, setFilter] = useState<string>('all');
  useEffect(() => {
    const saved = window.localStorage.getItem(FILTER_STORAGE_KEY);
    if (saved && (saved === 'all' || properties.some((p) => p.id === saved))) {
      setFilter(saved);
    }
  }, [properties]);
  const changeFilter = (value: string): void => {
    setFilter(value);
    window.localStorage.setItem(FILTER_STORAGE_KEY, value);
  };
  // now al mount: le etichette "fra N giorni" non cambiano sotto gli occhi.
  const [now] = useState(() => new Date());

  if (ranges.length === 0) return null;

  const countByProperty = new Map<string, number>();
  for (const r of ranges) {
    countByProperty.set(r.propertyId, (countByProperty.get(r.propertyId) ?? 0) + 1);
  }

  const visible = filter === 'all' ? ranges : ranges.filter((r) => r.propertyId === filter);
  const { current, soon, later } = splitByUrgency(visible, now);
  const laterVisible = showAllLater ? later : later.slice(0, LATER_COLLAPSED_COUNT);

  const clickable = Boolean(bookingsById && completeAction && skipAction);
  const openBooking = openRangeId ? bookingsById?.[openRangeId] : undefined;

  const row = (r: OccupiedRange, emphasized = false): React.JSX.Element => {
    const color = propertyColorOrFallback(r.propertyColor, r.propertyName);
    const content = (
      <>
        <div className="min-w-0 flex-1">
          <p className={`text-body ${emphasized ? 'font-semibold' : 'font-medium'} text-ink`}>
            {fullDateRange(r.checkinAtIso, r.checkoutAtIso)}
          </p>
          {/* Struttura: sottotitolo colorato SOTTO le date, non chip. */}
          <p className="truncate text-[12px] font-medium" style={{ color }}>
            {r.propertyName}
          </p>
        </div>
        <span
          className={`shrink-0 text-[12px] ${emphasized ? 'font-semibold text-terracotta-2' : 'text-ink-mute'}`}
        >
          {distanceLabel(r, now)}
        </span>
      </>
    );
    const rowClass = 'flex w-full items-center gap-3 px-3.5 py-2.5 text-left';
    const border = { borderLeft: `3px solid ${color}` };
    if (clickable) {
      return (
        <button
          type="button"
          onClick={() => setOpenRangeId(r.id)}
          className={`${rowClass} hover:bg-ivory`}
          style={border}
        >
          {content}
        </button>
      );
    }
    return (
      <div className={rowClass} style={border}>
        {content}
      </div>
    );
  };

  const group = (
    title: string,
    titleClass: string,
    items: OccupiedRange[],
    emphasized = false,
  ): React.JSX.Element => (
    <div>
      <h3 className={`mb-2 text-eyebrow uppercase tracking-wider ${titleClass}`}>{title}</h3>
      <ul
        className={`overflow-hidden rounded-card border bg-paper shadow-sm ${
          emphasized ? 'border-terracotta-soft' : 'border-line'
        }`}
      >
        {items.map((r) => (
          <li key={r.id} className="border-t border-line-soft first:border-t-0">
            {row(r, emphasized)}
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <div className="flex flex-col gap-5">
      {/* Filtro a segmenti coi conteggi. Le strutture a zero restano
          visibili in grigio: dice che li' non c'e' niente da fare. */}
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => changeFilter('all')}
          className={`rounded-full px-3 py-1 text-[12px] font-medium ${
            filter === 'all' ? 'bg-ink text-paper' : 'bg-line-soft text-ink-soft hover:bg-line'
          }`}
        >
          Tutte · {ranges.length}
        </button>
        {properties.map((p) => {
          const n = countByProperty.get(p.id) ?? 0;
          const active = filter === p.id;
          const color = propertyColorOrFallback(p.color, p.name);
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => changeFilter(p.id)}
              className={`rounded-full px-3 py-1 text-[12px] font-medium ${
                active
                  ? 'text-paper'
                  : n === 0
                    ? 'bg-line-soft text-ink-ghost'
                    : 'bg-line-soft text-ink-soft hover:bg-line'
              }`}
              style={active ? { backgroundColor: color } : undefined}
            >
              {abbreviatePropertyName(p.name)} · {n}
            </button>
          );
        })}
      </div>

      {current.length > 0
        ? group(`In corso ora · ${current.length}`, 'text-terracotta-2', current, true)
        : null}

      {soon.length > 0
        ? group(
            `Da verificare ora · prossimi 30 giorni · ${soon.length}`,
            'text-gold-deep',
            soon,
          )
        : null}

      {later.length > 0 ? (
        <div>
          {group(`Più avanti · ${later.length}`, 'text-ink-mute', laterVisible)}
          {later.length > LATER_COLLAPSED_COUNT && !showAllLater ? (
            <button
              type="button"
              onClick={() => setShowAllLater(true)}
              className="mt-2 text-body-sm font-medium text-terracotta-2 underline-offset-2 hover:underline"
            >
              Vedi tutte ({later.length})
            </button>
          ) : null}
        </div>
      ) : null}

      {visible.length === 0 ? (
        <p className="rounded-card border border-line-soft bg-paper px-4 py-3 text-body-sm text-ink-soft">
          Nessuna fascia occupata per questa struttura.
        </p>
      ) : null}

      {openBooking && completeAction && skipAction ? (
        <CompleteBookingDialog
          booking={openBooking}
          open={true}
          onOpenChange={(open) => {
            if (!open) setOpenRangeId(null);
          }}
          completeAction={completeAction}
          skipAction={skipAction}
        />
      ) : null}
    </div>
  );
}
