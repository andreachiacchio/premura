'use client';

import { Button } from '@/components/ui/button';
import * as React from 'react';

// Compilazione a lista (Andrea 05/08, opzione A).
//
// Il flusso precedente era un modale per ogni fascia: dieci date
// anonime = dieci aperture, dieci chiusure, e nessun modo di vedere
// quante ne restano. Qui stanno tutte su uno schermo, una riga
// ciascuna, e ognuna si salva da sola.
//
// Perche' non un unico "Salva tutto": se una riga fallisce (numero
// non valido, prenotazione sparita nel frattempo) l'host deve sapere
// QUALE, non ritrovarsi un errore unico su dieci righe.
//
// Il codice prenotazione compare sulla riga: e' l'unico dato utile che
// l'email di Booking porta con se', e serve a ritrovare la
// prenotazione sull'extranet invece di cercarla a mano.

export type CompletionRow = {
  id: string;
  propertyName: string;
  propertyColor: string | null;
  checkinAt: string;
  checkoutAt: string;
  numGuests: number;
  bookingExternalCode: string | null;
};

export type CompleteRowActionFn = (formData: FormData) => Promise<void>;
export type SkipRowActionFn = (bookingId: string) => Promise<void>;

const LANGUAGE_OPTIONS = [
  { value: 'it', label: 'Italiano' },
  { value: 'en', label: 'English' },
  { value: 'de', label: 'Deutsch' },
  { value: 'fr', label: 'Français' },
  { value: 'es', label: 'Español' },
] as const;

const GIORNO = new Intl.DateTimeFormat('it-IT', {
  day: 'numeric',
  month: 'short',
  timeZone: 'Europe/Rome',
});

function periodo(checkin: string, checkout: string): string {
  return `${GIORNO.format(new Date(checkin))} → ${GIORNO.format(new Date(checkout))}`;
}

type StatoRiga =
  | { kind: 'idle' }
  | { kind: 'salvando' }
  | { kind: 'salvata' }
  | { kind: 'saltata' }
  | { kind: 'errore'; message: string };

export function CompletionRows({
  rows,
  completeAction,
  skipAction,
}: {
  rows: CompletionRow[];
  completeAction: CompleteRowActionFn;
  skipAction: SkipRowActionFn;
}): React.JSX.Element {
  const [stati, setStati] = React.useState<Record<string, StatoRiga>>({});

  function setStato(id: string, s: StatoRiga): void {
    setStati((prev) => ({ ...prev, [id]: s }));
  }

  async function salva(row: CompletionRow, form: HTMLFormElement): Promise<void> {
    const fd = new FormData(form);
    const nome = String(fd.get('guestFullName') ?? '').trim();
    const telefono = String(fd.get('guestPhone') ?? '').trim();
    const lingua = String(fd.get('guestLanguage') ?? '').trim();

    if (nome.length < 2) {
      setStato(row.id, { kind: 'errore', message: 'Manca il nome' });
      return;
    }
    if (telefono.length < 8) {
      setStato(row.id, { kind: 'errore', message: 'Manca il numero WhatsApp' });
      return;
    }
    if (lingua.length < 2) {
      setStato(row.id, {
        kind: 'errore',
        message: 'Scegli la lingua: senza, il messaggio parte in quella sbagliata',
      });
      return;
    }

    setStato(row.id, { kind: 'salvando' });
    try {
      fd.set('bookingId', row.id);
      await completeAction(fd);
      setStato(row.id, { kind: 'salvata' });
    } catch {
      setStato(row.id, { kind: 'errore', message: 'Non sono riuscito a salvare, riprova.' });
    }
  }

  async function salta(row: CompletionRow): Promise<void> {
    setStato(row.id, { kind: 'salvando' });
    try {
      await skipAction(row.id);
      setStato(row.id, { kind: 'saltata' });
    } catch {
      setStato(row.id, { kind: 'errore', message: 'Non sono riuscito a salvare, riprova.' });
    }
  }

  return (
    <ul className="flex flex-col gap-3">
      {rows.map((row) => {
        const stato = stati[row.id] ?? { kind: 'idle' };
        const chiusa = stato.kind === 'salvata' || stato.kind === 'saltata';

        return (
          <li
            key={row.id}
            className="rounded-card border border-line bg-paper p-4 shadow-sm"
            style={
              row.propertyColor ? { borderLeft: `3px solid ${row.propertyColor}` } : undefined
            }
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <p className="font-serif text-h4 text-ink">
                {periodo(row.checkinAt, row.checkoutAt)}
              </p>
              <p className="text-body-sm text-ink-mute">
                {row.propertyName}
                {row.bookingExternalCode ? ` · n. ${row.bookingExternalCode}` : ''}
              </p>
            </div>

            {chiusa ? (
              <p className="mt-3 text-body-sm text-ok-deep">
                {stato.kind === 'salvata'
                  ? '✓ Salvata — me ne occupo io'
                  : '✓ Lasciata com’è'}
              </p>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void salva(row, e.currentTarget);
                }}
                className="mt-3 flex flex-col gap-2 md:flex-row md:items-start"
              >
                <input
                  name="guestFullName"
                  placeholder="Nome dell’ospite"
                  autoComplete="off"
                  className="h-11 flex-1 rounded-card border border-line bg-ivory px-3 text-body-sm text-ink placeholder:text-ink-mute focus:border-terracotta-soft focus:outline-none"
                />
                <input
                  name="guestPhone"
                  placeholder="+39 333 1234567"
                  inputMode="tel"
                  autoComplete="off"
                  className="h-11 flex-1 rounded-card border border-line bg-ivory px-3 text-body-sm text-ink placeholder:text-ink-mute focus:border-terracotta-soft focus:outline-none"
                />
                <select
                  name="guestLanguage"
                  defaultValue=""
                  className="h-11 rounded-card border border-line bg-ivory px-3 text-body-sm text-ink"
                >
                  <option value="">Lingua…</option>
                  {LANGUAGE_OPTIONS.map((l) => (
                    <option key={l.value} value={l.value}>
                      {l.label}
                    </option>
                  ))}
                </select>
                <input type="hidden" name="numGuests" value={row.numGuests} />
                <div className="flex items-center gap-2">
                  <Button type="submit" variant="ink" disabled={stato.kind === 'salvando'}>
                    {stato.kind === 'salvando' ? 'Salvo…' : 'Salva'}
                  </Button>
                  <button
                    type="button"
                    onClick={() => void salta(row)}
                    disabled={stato.kind === 'salvando'}
                    className="text-body-sm text-ink-mute underline-offset-2 hover:text-ink hover:underline disabled:opacity-60"
                  >
                    Non serve
                  </button>
                </div>
              </form>
            )}

            {stato.kind === 'errore' && (
              <p className="mt-2 text-body-sm text-terracotta-2">{stato.message}</p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
