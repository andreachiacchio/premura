'use client';

import { useToast } from '@/components/Toast';
import { AlertTriangle, CalendarX, ChevronDown, Gift, MessageSquare, Phone } from 'lucide-react';
import { createContext, useCallback, useContext, useState } from 'react';

// DecisionCard — una cosa che aspetta l'host, con l'azione che la
// risolve.
//
// La forma nasce dal principio guida: trenta secondi, tre volte al
// giorno. Quindi il titolo sta su UNA riga, il corpo su due, e tutto il
// resto sparisce dietro "Dettagli". Chi ha fretta decide dal titolo;
// chi vuole capire apre.
//
// Dopo l'azione la card esce con una transizione breve e compare un
// toast. Non e' decorazione: senza la conferma l'host vede solo
// qualcosa che scompare e non sa se ha funzionato. Con
// prefers-reduced-motion l'uscita e' istantanea — il toast resta.

const EXIT_MS = 200;

export type DecisionKind = 'draft' | 'cancellation' | 'phone' | 'kit' | 'incomplete';

// Icona e colore per tipo: l'host riconosce di cosa si tratta prima di
// leggere. I colori sono quelli dei token, non nuovi.
const KIND: Record<
  DecisionKind,
  { Icon: typeof MessageSquare; tone: string; label: string }
> = {
  draft: { Icon: MessageSquare, tone: 'text-terracotta-2 bg-peach', label: 'Risposta pronta' },
  cancellation: { Icon: CalendarX, tone: 'text-alert bg-alert/10', label: 'Possibile cancellazione' },
  phone: { Icon: Phone, tone: 'text-terracotta-2 bg-peach', label: 'Numero mancante' },
  kit: { Icon: Gift, tone: 'text-terracotta-2 bg-peach', label: 'Kit da approvare' },
  incomplete: { Icon: AlertTriangle, tone: 'text-ink-soft bg-line-soft', label: 'Dati mancanti' },
};

type ResolveFn = (message?: string) => Promise<void>;

const ResolveContext = createContext<ResolveFn | null>(null);

/**
 * Da chiamare dentro le azioni quando l'operazione e' RIUSCITA, e
 * aspettata prima di router.refresh(): il refresh rimonta l'albero e
 * senza l'attesa la transizione non si vedrebbe mai.
 *
 * Fuori da una DecisionCard non fa niente e non lancia: un'azione deve
 * poter vivere anche altrove.
 */
export function useResolveDecision(): ResolveFn {
  const ctx = useContext(ResolveContext);
  const toast = useToast();
  return (
    ctx ??
    (async (message?: string) => {
      if (message) toast.show(message);
    })
  );
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export type DecisionCardProps = {
  kind: DecisionKind;
  /** Una riga sola: e' quello che si legge di corsa. */
  title: React.ReactNode;
  /** Massimo due righe. Il resto va in `details`. */
  body?: React.ReactNode;
  /** Tutto quello che serve per capire, ma non per decidere. */
  details?: React.ReactNode;
  /**
   * Azioni. La primaria per PRIMA: su desktop finisce a sinistra, su
   * mobile in cima. I bottoni dentro devono essere alti almeno 44px e
   * larghi tutta la card sotto sm (vedi decisionActionClass).
   */
  actions?: React.ReactNode;
};

/** Classi condivise dai bottoni delle azioni: 44px e full-width su mobile. */
export const decisionActionClass =
  'inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-full px-4 text-body font-medium transition-colors disabled:opacity-60 sm:w-auto';

export function DecisionCard({
  kind,
  title,
  body,
  details,
  actions,
}: DecisionCardProps): React.JSX.Element {
  const [exiting, setExiting] = useState(false);
  const [open, setOpen] = useState(false);
  const toast = useToast();
  const { Icon, tone, label } = KIND[kind];

  const resolve = useCallback<ResolveFn>(
    async (message?: string) => {
      setExiting(true);
      if (!prefersReducedMotion()) {
        await new Promise((r) => setTimeout(r, EXIT_MS));
      }
      if (message) toast.show(message);
    },
    [toast],
  );

  return (
    <ResolveContext.Provider value={resolve}>
      <article
        className={`rounded-card border border-line-soft bg-paper p-4 shadow-sm transition-all duration-200 motion-reduce:transition-none ${
          exiting ? 'pointer-events-none -translate-y-1 opacity-0' : 'translate-y-0 opacity-100'
        }`}
      >
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className={`grid size-8 shrink-0 place-items-center rounded-full ${tone}`}
          >
            <Icon className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-mute">
              {label}
            </p>
            {/* Una riga: se non ci sta, si taglia. Il titolo e' un
                riconoscimento, non una spiegazione. */}
            <h3 className="truncate text-body-lg font-medium text-ink">{title}</h3>
          </div>
        </div>

        {body ? <div className="mt-2 line-clamp-2 text-body text-ink-soft">{body}</div> : null}

        {details ? (
          <div className="mt-2">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              className="inline-flex min-h-[44px] items-center gap-1 text-body font-medium text-terracotta-2 hover:underline"
            >
              Dettagli
              <ChevronDown
                aria-hidden
                className={`size-4 transition-transform duration-200 motion-reduce:transition-none ${open ? 'rotate-180' : ''}`}
              />
            </button>
            {open ? <div className="pb-1 text-body text-ink-soft">{details}</div> : null}
          </div>
        ) : null}

        {actions ? (
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            {actions}
          </div>
        ) : null}
      </article>
    </ResolveContext.Provider>
  );
}
