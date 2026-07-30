'use client';

import type { BookingForDashboard } from '@/lib/types';
import {
  type OccupiedRange,
  abbreviatePropertyName,
  distanceLabel,
  fullDateRange,
  splitByUrgency,
} from '@/lib/occupied-ranges';
import { useState } from 'react';
import { CompleteBookingDialog } from './CompleteBookingDialog';
import type { CompleteBookingActionFn, SkipBookingActionFn } from './CompleteBookingDialog';

// Sezione "Date occupate" condivisa tra home e pagina check-in
// (ristrutturazione Andrea 30/07): due gruppi per urgenza, struttura
// come chip a inizio riga, date complete mai troncate, niente badge
// ripetuti — lo dice gia' il titolo della sezione.
//
// Sulla home le righe restano cliccabili: aprono il dialog di
// completamento (e' cosi' che una fascia anonima diventa un ospite
// vero). Sulla pagina check-in la sezione e' informativa: senza le
// server action il click non c'e'.

const LATER_COLLAPSED_COUNT = 3;

// Chip colorato deterministico per struttura: palette soft, scelta per
// hash del nome — stessa struttura, stesso colore, ovunque.
const CHIP_PALETTE = [
  'bg-peach text-terracotta-2',
  'bg-gold-soft text-gold-deep',
  'bg-line-soft text-ink-soft',
  'bg-ivory-warm text-ink-soft border border-line-soft',
];

function chipClass(propertyName: string): string {
  let hash = 0;
  for (const ch of propertyName) hash = (hash * 31 + ch.charCodeAt(0)) % 997;
  return CHIP_PALETTE[hash % CHIP_PALETTE.length] ?? 'bg-line-soft text-ink-soft';
}

function PropertyChip({ name }: { name: string }): React.JSX.Element {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${chipClass(name)}`}
      title={name}
    >
      {abbreviatePropertyName(name)}
    </span>
  );
}

export type OccupiedRangesSectionProps = {
  ranges: OccupiedRange[];
  /** Prenotazioni complete per il dialog (solo home). Chiave = range.id. */
  bookingsById?: Record<string, BookingForDashboard>;
  completeAction?: CompleteBookingActionFn;
  skipAction?: SkipBookingActionFn;
};

export function OccupiedRangesSection({
  ranges,
  bookingsById,
  completeAction,
  skipAction,
}: OccupiedRangesSectionProps): React.JSX.Element | null {
  const [showAllLater, setShowAllLater] = useState(false);
  const [openRangeId, setOpenRangeId] = useState<string | null>(null);
  // now al mount: le etichette "fra N giorni" non cambiano sotto gli occhi.
  const [now] = useState(() => new Date());

  if (ranges.length === 0) return null;

  const { soon, later } = splitByUrgency(ranges, now);
  const laterVisible = showAllLater ? later : later.slice(0, LATER_COLLAPSED_COUNT);

  const clickable = Boolean(bookingsById && completeAction && skipAction);
  const openBooking = openRangeId ? bookingsById?.[openRangeId] : undefined;

  const row = (r: OccupiedRange): React.JSX.Element => {
    const content = (
      <>
        <PropertyChip name={r.propertyName} />
        <span className="text-body text-ink">{fullDateRange(r.checkinAtIso, r.checkoutAtIso)}</span>
        <span className="ml-auto text-[12px] text-ink-mute">{distanceLabel(r, now)}</span>
      </>
    );
    if (clickable) {
      return (
        <button
          type="button"
          onClick={() => setOpenRangeId(r.id)}
          className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left hover:bg-ivory"
        >
          {content}
        </button>
      );
    }
    return <div className="flex items-center gap-2.5 px-3.5 py-2.5">{content}</div>;
  };

  return (
    <div className="flex flex-col gap-5">
      {soon.length > 0 ? (
        <div>
          <h3 className="mb-2 text-eyebrow uppercase tracking-wider text-gold-deep">
            Da verificare ora · prossimi 30 giorni · {soon.length}
          </h3>
          <ul className="overflow-hidden rounded-card border border-line bg-paper shadow-sm">
            {soon.map((r) => (
              <li key={r.id} className="border-t border-line-soft first:border-t-0">
                {row(r)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {later.length > 0 ? (
        <div>
          <h3 className="mb-2 text-eyebrow uppercase tracking-wider text-ink-mute">
            Più avanti · {later.length}
          </h3>
          <ul className="overflow-hidden rounded-card border border-line-soft bg-paper shadow-sm">
            {laterVisible.map((r) => (
              <li key={r.id} className="border-t border-line-soft first:border-t-0">
                {row(r)}
              </li>
            ))}
          </ul>
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
