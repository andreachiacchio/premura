'use client';

import { Badge } from '@/components/ui/badge';
import { type BookingForDashboard, isIncompleteDataSource, isRichDataSource } from '@/lib/types';
import { useState } from 'react';
import { CompleteBookingDialog } from './CompleteBookingDialog';
import type { CompleteBookingActionFn, SkipBookingActionFn } from './CompleteBookingDialog';

// Riga della lista prenotazioni dashboard. Calata sulla .guest-card del
// prototipo (riga 544 sgg.): card paper con border line-soft, avatar
// rotondo iniziale + bandiera paese in basso a destra, dot di stato a
// sinistra del nome, sub property + date.
//
// Cosa cambia rispetto al prototipo: lo slice 5 e' data hygiene, niente
// "stato del soggiorno" ancora. La dot riflette lo stato data_source:
//  - terracotta (alert) = INCOMPLETE non skipped (l'host deve compilare)
//  - giallo (warn)      = INCOMPLETE skipped (rumore visibile ma muted)
//  - verde (ok)         = RICH (workflow agente AI puo girare)
//  - grigio             = airbnb_ical_only / unknown (in attesa email)
//
// Click: se la riga e' INCOMPLETE non skipped, apre il dialog di
// completamento manuale. Altrimenti la card e' inerte (slice 5 non
// implementa il dettaglio ospite, arrivera in M3).

// Regola data condivisa con la pagina check-in: anno visibile quando
// non e' l'anno corrente (una prenotazione 2027 senza anno sembra passata).
import { formatDayMonth } from '@/lib/format-date';

type DotKind = 'alert' | 'warn' | 'ok' | 'muted';

function dotClass(kind: DotKind): string {
  switch (kind) {
    case 'alert':
      return 'bg-terracotta shadow-[0_0_0_3px_rgba(198,93,58,0.18)]';
    case 'warn':
      return 'bg-warn';
    case 'ok':
      return 'bg-ok';
    case 'muted':
      return 'bg-ink-ghost';
  }
}

function pickDot(b: BookingForDashboard): DotKind {
  if (isIncompleteDataSource(b.dataSource)) {
    return b.hostSkippedCompletion ? 'warn' : 'alert';
  }
  if (isRichDataSource(b.dataSource)) return 'ok';
  return 'muted';
}

type BadgeVariant = 'neutral' | 'warn' | 'gold' | 'ok' | 'ink';

function badgeFor(b: BookingForDashboard): {
  label: string;
  variant: BadgeVariant;
} {
  if (b.hostSkippedCompletion) return { label: 'Saltata', variant: 'warn' };
  switch (b.dataSource) {
    case 'airbnb_email_parsed':
      return { label: 'Airbnb', variant: 'gold' };
    case 'booking_manual_filled':
      return { label: 'Booking · completata', variant: 'ok' };
    case 'booking_via_channel_manager':
      return { label: 'Channel manager', variant: 'ok' };
    case 'booking_ical_only':
      // L'iCal Booking non dice chi arriva: fascia occupata, non ospite.
      return { label: 'Date occupate · verifica extranet', variant: 'warn' };
    case 'booking_email_only':
      return { label: 'Booking · email', variant: 'warn' };
    case 'airbnb_ical_only':
      return { label: 'Airbnb · in attesa', variant: 'neutral' };
    default:
      return { label: 'In attesa', variant: 'neutral' };
  }
}

// Bandiera unicode da country code ISO-2. Niente PNG, niente fetch.
// Browser desktop su Windows non rendono le bandiere unicode: degrada a
// caratteri leggibili (es. "IT") senza rompere la riga.
function flagEmoji(cc: string | null): string | null {
  if (!cc || cc.length !== 2) return null;
  const base = 0x1f1e6;
  const A = 'A'.charCodeAt(0);
  const upper = cc.toUpperCase();
  return (
    String.fromCodePoint(base + (upper.charCodeAt(0) - A)) +
    String.fromCodePoint(base + (upper.charCodeAt(1) - A))
  );
}

// Nomi segnaposto dell'iCal: un elenco di venti "Ospite" identici non
// comunica niente (mobile brief 30/07). Quando il nome vero non c'e',
// il TITOLO della riga e' la struttura e il sottotitolo le date.
const PLACEHOLDER_NAMES = new Set(['ospite', 'reserved', 'booking guest']);

function hasRealName(b: BookingForDashboard): boolean {
  if (isIncompleteDataSource(b.dataSource) && !b.hostSkippedCompletion) return false;
  const name = b.guestFullName?.trim().toLowerCase() ?? '';
  return name.length > 0 && !PLACEHOLDER_NAMES.has(name);
}

function avatarLetter(b: BookingForDashboard): string {
  const source = hasRealName(b) ? (b.guestFirstName ?? b.guestFullName) : b.propertyName;
  const ch = source.trim().charAt(0).toUpperCase();
  return ch || '?';
}

export function BookingRow({
  booking,
  completeAction,
  skipAction,
}: {
  booking: BookingForDashboard;
  completeAction: CompleteBookingActionFn;
  skipAction: SkipBookingActionFn;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);

  const isIncomplete = isIncompleteDataSource(booking.dataSource) && !booking.hostSkippedCompletion;
  const dotKind = pickDot(booking);
  const badge = badgeFor(booking);
  const flag = flagEmoji(booking.guestCountryCode);
  const dateRange = `${formatDayMonth(booking.checkinAt)} – ${formatDayMonth(booking.checkoutAt)}`;
  const realName = hasRealName(booking);
  const title = realName ? booking.guestFullName.trim() : booking.propertyName;
  const subtitle = realName ? `${booking.propertyName} · ${dateRange}` : dateRange;

  const inner = (
    <>
      <div className="relative mr-3 grid size-10 shrink-0 place-items-center rounded-full border border-line bg-ivory-warm font-serif text-[16px] font-medium text-ink">
        {avatarLetter(booking)}
        {flag ? (
          <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-paper px-0.5 py-px text-[13px] leading-none shadow-sm">
            {flag}
          </span>
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-[15px] font-semibold leading-tight text-ink">
          <span aria-hidden className={`size-2.5 rounded-full ${dotClass(dotKind)}`} />
          <span className="truncate">{title}</span>
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <span className="truncate text-[12px] text-ink-mute">{subtitle}</span>
          <Badge variant={badge.variant}>{badge.label}</Badge>
        </div>
      </div>
    </>
  );

  if (isIncomplete) {
    return (
      <>
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          className="group flex w-full items-stretch rounded-card border border-terracotta-soft bg-gradient-to-br from-paper to-peach/40 px-3.5 py-2.5 text-left transition-[transform,border-color,box-shadow] duration-200 ease-premura hover:-translate-y-px hover:border-terracotta hover:shadow-md"
        >
          {inner}
        </button>
        <CompleteBookingDialog
          booking={booking}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          completeAction={completeAction}
          skipAction={skipAction}
        />
      </>
    );
  }

  return (
    <div className="flex w-full items-stretch rounded-card border border-line-soft bg-paper px-3.5 py-2.5 text-left">
      {inner}
    </div>
  );
}
