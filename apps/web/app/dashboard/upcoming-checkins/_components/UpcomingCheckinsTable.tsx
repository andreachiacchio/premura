'use client';

import { Check, Loader2, Trash2 } from 'lucide-react';
import { useState, useTransition } from 'react';
import {
  type ClearPhoneActionResult,
  type SetPhoneActionResult,
  clearBookingGuestPhoneAction,
  setBookingGuestPhoneAction,
} from '../actions';

// Slice A — Tabella editabile inline "prossimi check-in".
// Per ogni riga senza guest_phone valorizzato, l'host puo' inserire
// il numero. Save al blur o Enter. Tab passa alla riga successiva.

const DATE_FMT = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short' });

export type UpcomingCheckinCardData = {
  id: string;
  guestFullName: string;
  guestFirstName: string | null;
  propertyId: string;
  propertyName: string;
  checkinAt: string; // ISO string (server -> client)
  checkoutAt: string;
  numGuests: number;
  platform: 'booking' | 'airbnb' | 'direct';
  guestPhone: string | null;
  premuraActiveAt: string | null;
  guestPhoneSource: string | null;
};

type RowState = {
  draft: string; // valore in edit
  editing: boolean;
  error: string | null;
  flashSuccess: boolean; // animazione check verde post-save
};

const PLATFORM_LABELS: Record<UpcomingCheckinCardData['platform'], string> = {
  booking: 'Booking',
  airbnb: 'Airbnb',
  direct: 'Diretta',
};

function reasonToMessage(reason: SetPhoneActionResult & { ok: false }): string {
  switch (reason.reason) {
    case 'invalid_phone':
      return 'Numero non valido';
    case 'not_found':
      return 'Prenotazione non trovata';
    case 'wrong_host':
      return 'Permesso negato';
    default:
      return 'Errore inatteso';
  }
}

export function UpcomingCheckinsTable({ rows }: { rows: UpcomingCheckinCardData[] }) {
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<Record<string, RowState>>(() =>
    Object.fromEntries(
      rows.map((r) => [
        r.id,
        { draft: r.guestPhone ?? '', editing: false, error: null, flashSuccess: false },
      ]),
    ),
  );

  const updateRow = (id: string, patch: Partial<RowState>): void => {
    setState((s) => ({ ...s, [id]: { ...(s[id] ?? defaultState()), ...patch } }));
  };

  const handleSave = (id: string): void => {
    const rowState = state[id];
    if (!rowState) return;
    const trimmed = rowState.draft.trim();
    if (trimmed.length === 0) {
      updateRow(id, { editing: false, error: null });
      return;
    }
    updateRow(id, { error: null });
    startTransition(async () => {
      try {
        const result = await setBookingGuestPhoneAction(id, trimmed);
        if (!result.ok) {
          updateRow(id, { error: reasonToMessage(result) });
          return;
        }
        updateRow(id, { editing: false, flashSuccess: true });
        setTimeout(() => updateRow(id, { flashSuccess: false }), 1200);
      } catch (err) {
        updateRow(id, {
          error: err instanceof Error ? err.message : 'Errore di rete',
        });
      }
    });
  };

  const handleClear = (id: string): void => {
    if (!window.confirm('Rimuovere il numero da questa prenotazione?')) return;
    startTransition(async () => {
      try {
        const result: ClearPhoneActionResult = await clearBookingGuestPhoneAction(id);
        if (!result.ok) {
          updateRow(id, { error: 'Rimozione fallita' });
          return;
        }
        updateRow(id, { draft: '', editing: false, error: null });
      } catch (err) {
        updateRow(id, { error: err instanceof Error ? err.message : 'Errore di rete' });
      }
    });
  };

  return (
    <div className="overflow-x-auto rounded-card border border-line bg-paper shadow-sm">
      <table className="w-full text-left">
        <thead className="bg-ivory text-eyebrow uppercase tracking-wider text-ink-mute">
          <tr>
            <th className="px-4 py-3 font-medium">Struttura</th>
            <th className="px-4 py-3 font-medium">Ospite</th>
            <th className="px-4 py-3 font-medium">Date</th>
            <th className="px-4 py-3 font-medium">Ospiti</th>
            <th className="px-4 py-3 font-medium">Canale</th>
            <th className="px-4 py-3 font-medium">Numero WhatsApp</th>
            <th className="px-4 py-3 font-medium">Stato</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const s = state[r.id] ?? defaultState();
            const isActive = Boolean(r.premuraActiveAt) || s.flashSuccess;
            const dateRange = `${DATE_FMT.format(new Date(r.checkinAt))} – ${DATE_FMT.format(new Date(r.checkoutAt))}`;
            const showInput = s.editing || !r.guestPhone;
            return (
              <tr
                key={r.id}
                className="border-t border-line-soft text-body text-ink"
                data-booking-id={r.id}
              >
                <td className="px-4 py-3 font-medium">{r.propertyName}</td>
                <td className="px-4 py-3">{r.guestFirstName ?? r.guestFullName}</td>
                <td className="px-4 py-3 whitespace-nowrap">{dateRange}</td>
                <td className="px-4 py-3">{r.numGuests}</td>
                <td className="px-4 py-3 text-body-sm text-ink-mute">
                  {PLATFORM_LABELS[r.platform]}
                </td>
                <td className="px-4 py-3">
                  {showInput ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel"
                        defaultValue={s.draft}
                        placeholder="+39 333 1234567"
                        disabled={pending}
                        aria-label={`Numero WhatsApp ospite ${r.guestFullName}`}
                        aria-invalid={s.error ? true : undefined}
                        className={`h-9 w-44 rounded-card-sm border bg-paper px-2.5 text-body text-ink focus:outline-none focus:ring-2 focus:ring-terracotta-soft/40 ${s.error ? 'border-alert' : 'border-line'}`}
                        onChange={(e) => updateRow(r.id, { draft: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleSave(r.id);
                          }
                          if (e.key === 'Escape') {
                            updateRow(r.id, {
                              editing: false,
                              draft: r.guestPhone ?? '',
                              error: null,
                            });
                          }
                        }}
                        onBlur={(e) => {
                          // Salva solo se diverso dal valore corrente.
                          const trimmed = e.target.value.trim();
                          if (trimmed && trimmed !== (r.guestPhone ?? '')) {
                            handleSave(r.id);
                          } else if (!trimmed && r.guestPhone) {
                            // Lascia stare: clear si fa esplicitamente con il bottone.
                            updateRow(r.id, { editing: false, error: null });
                          } else {
                            updateRow(r.id, { editing: false });
                          }
                        }}
                      />
                      {pending && s.editing ? (
                        <Loader2 aria-hidden className="size-4 animate-spin text-ink-mute" />
                      ) : null}
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => updateRow(r.id, { editing: true, draft: r.guestPhone ?? '' })}
                      className="rounded-card-sm bg-line-soft px-2.5 py-1 font-mono text-body-sm text-ink hover:bg-line"
                    >
                      {r.guestPhone}
                    </button>
                  )}
                  {s.error ? <p className="mt-1 text-body-sm text-alert">{s.error}</p> : null}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {isActive ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-line-soft px-2 py-0.5 text-[11px] font-medium text-ok">
                        <Check aria-hidden className="size-3" />
                        Attivo
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-gold-soft px-2 py-0.5 text-[11px] font-medium text-gold-deep">
                        Da inserire
                      </span>
                    )}
                    {r.guestPhone ? (
                      <button
                        type="button"
                        onClick={() => handleClear(r.id)}
                        disabled={pending}
                        aria-label={`Rimuovi numero ${r.guestFullName}`}
                        className="rounded-full p-1 text-ink-mute hover:bg-line-soft hover:text-ink-soft"
                      >
                        <Trash2 aria-hidden className="size-3.5" />
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function defaultState(): RowState {
  return { draft: '', editing: false, error: null, flashSuccess: false };
}
