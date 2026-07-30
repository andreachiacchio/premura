import type { HomeMetrics } from '@/lib/repositories/home-summary';

// Blocco metriche della home — DUE metriche vere, sempre in colonne
// affiancate anche su mobile (decisione 30/07: "meglio due metriche
// vere che tre di cui due vuote"). Numeri grandi, etichette piccole;
// il dettaglio si apre al tap (<details>, zero JS client) invece di
// stare sempre in pagina. La terza colonna arrivera' quando avra' un
// numero vero dietro (extra venduti / recensioni).

function Tile({
  value,
  label,
  detail,
}: {
  value: string;
  label: string;
  detail: string;
}): React.JSX.Element {
  return (
    <details className="group rounded-card border border-line-soft bg-paper px-3.5 pb-2.5 pt-3 shadow-sm">
      <summary className="flex cursor-pointer list-none flex-col gap-1 [&::-webkit-details-marker]:hidden">
        <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-mute">
          {label}
        </span>
        <span className="font-serif text-[26px] leading-none text-ink tabular-nums">{value}</span>
      </summary>
      <p className="mt-2 border-t border-line-soft pt-2 text-[12px] leading-snug text-ink-soft">
        {detail}
      </p>
    </details>
  );
}

export function HomeMetricsStrip({
  metrics,
  actionsToday,
}: {
  metrics: HomeMetrics;
  actionsToday: number;
}): React.JSX.Element {
  const guestsTotal = metrics.guestsInHouse + metrics.guestsArriving;

  return (
    <section aria-label="Riepilogo" className="mx-5 mt-4 grid grid-cols-2 gap-2.5">
      <Tile
        value={String(guestsTotal)}
        label="Ospiti"
        detail={
          guestsTotal === 0
            ? 'Nessuno in casa, nessuno in arrivo.'
            : `${metrics.guestsInHouse} in casa · ${metrics.guestsArriving} in arrivo`
        }
      />
      <Tile
        value={String(actionsToday)}
        label="Agente oggi"
        detail={
          actionsToday === 0
            ? 'Nessuna azione ancora — il dettaglio è nel feed qui sotto.'
            : `${actionsToday} ${actionsToday === 1 ? 'azione' : 'azioni'} — il dettaglio è nel feed qui sotto.`
        }
      />
    </section>
  );
}
