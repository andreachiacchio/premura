'use client';

import { useToast } from '@/components/Toast';
import { CalendarX, ChevronDown } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { restoreCalendarRemovalAction } from '../actions';
import { decisionActionClass } from './DecisionCard';

// Prenotazioni che Premura ha tolto perche' sparite dal calendario
// (26/10). Una riga sola, chiusa, in fondo alle decisioni: non e' una
// decisione — l'ha gia' presa Premura — ma l'host deve poterla vedere
// e, se serve, smentirla.
//
// Prima erano N card identiche con due bottoni, e nessuno le apriva.

export type CalendarRemovalItem = {
  bookingId: string;
  label: string;
  /** "tolta il 21 ott": la data viene dalla riga, non da un'assunzione. */
  removedLabel: string;
};

export function CalendarRemovals({
  headline,
  items,
}: {
  /** Derivata dalle stesse righe di `items`: conteggio e piattaforme. */
  headline: string;
  items: CalendarRemovalItem[];
}): React.JSX.Element {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const restore = (item: CalendarRemovalItem): void => {
    // Conferma: dopo il ripristino Premura la segue di nuovo come
    // prenotazione vera, e dalla home non si torna indietro.
    if (
      !window.confirm(`Ripristino ${item.label}? Premura tornerà a seguirla come prenotazione.`)
    ) {
      return;
    }
    setError(null);
    setRestoringId(item.bookingId);
    startTransition(async () => {
      const result = await restoreCalendarRemovalAction(item.bookingId);
      setRestoringId(null);
      if (!result.ok) {
        setError('Non sono riuscito a ripristinarla, riprova.');
        return;
      }
      toast.show(`Ripristinata: ${item.label}`);
      router.refresh();
    });
  };

  return (
    <section className="rounded-card border border-line-soft bg-paper p-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-[44px] w-full items-center gap-3 text-left"
      >
        <span
          aria-hidden
          className="grid size-8 shrink-0 place-items-center rounded-full bg-line-soft text-ink-soft"
        >
          <CalendarX className="size-4" />
        </span>
        <span className="min-w-0 flex-1 text-body text-ink-soft">{headline}</span>
        <ChevronDown
          aria-hidden
          className={`size-4 shrink-0 text-ink-mute transition-transform duration-200 motion-reduce:transition-none ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open ? (
        <div className="mt-3 flex flex-col gap-3">
          <p className="text-body text-ink-soft">
            Erano sparite dal calendario da almeno 3 giorni: le ho tolte io. Se una era ancora
            attiva, ripristinala e non la toglierò più finché non ricompare nel calendario.
          </p>
          <ul className="flex flex-col gap-2">
            {items.map((item) => (
              <li
                key={item.bookingId}
                className="flex flex-col gap-2 border-t border-line-soft pt-2 sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="flex flex-col">
                  <span className="text-body text-ink">{item.label}</span>
                  <span className="text-[13px] text-ink-mute">{item.removedLabel}</span>
                </span>
                <button
                  type="button"
                  onClick={() => restore(item)}
                  disabled={pending}
                  className={`${decisionActionClass} border border-line text-ink-soft hover:bg-line-soft`}
                >
                  {restoringId === item.bookingId ? 'Ripristino…' : 'Era ancora attiva'}
                </button>
              </li>
            ))}
          </ul>
          {error ? <p className="text-body text-alert">{error}</p> : null}
        </div>
      ) : null}
    </section>
  );
}
