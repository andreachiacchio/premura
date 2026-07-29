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

const DATE_FORMATTER = new Intl.DateTimeFormat('it-IT', {
  day: 'numeric',
  month: 'short',
});

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
      return { label: 'Booking · da completare', variant: 'warn' };
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

function avatarLetter(b: BookingForDashboard): string {
  const name = b.guestFirstName ?? b.guestFullName;
  const ch = name.trim().charAt(0).toUpperCase();
  return ch || '?';
}

function displayName(b: BookingForDashboard): string {
  if (isIncompleteDataSource(b.dataSource) && !b.hostSkippedCompletion) {
    return 'Ospite';
  }
  return b.guestFullName?.trim() || 'Ospite';
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
  const dateRange = `${DATE_FORMATTER.format(booking.checkinAt)} – ${DATE_FORMATTER.format(booking.checkoutAt)}`;

  const inner = (
    <>
      <div className="relative mr-3.5 grid size-[46px] shrink-0 place-items-center rounded-full border border-line bg-ivory-warm font-serif text-[18px] font-medium text-ink">
        {avatarLetter(booking)}
        {flag ? (
          <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-paper px-0.5 py-px text-[14px] leading-none shadow-sm">
            {flag}
          </span>
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-[15px] font-semibold text-ink">
          <span aria-hidden className={`size-2.5 rounded-full ${dotClass(dotKind)}`} />
          <span className="truncate">{displayName(booking)}</span>
        </div>
        <div className="mt-0.5 truncate text-[12px] text-ink-mute">
          {booking.propertyName} · {dateRange}
        </div>
        <div className="mt-1.5">
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
          className="group flex w-full items-stretch rounded-card border border-terracotta-soft bg-gradient-to-br from-paper to-peach/40 px-4 py-3.5 text-left transition-[transform,border-color,box-shadow] duration-200 ease-premura hover:-translate-y-px hover:border-terracotta hover:shadow-md"
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
    <div className="flex w-full items-stretch rounded-card border border-line-soft bg-paper px-4 py-3.5 text-left">
      {inner}
    </div>
  );
}
