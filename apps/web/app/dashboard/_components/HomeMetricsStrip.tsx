import type { HomeMetrics } from '@/lib/repositories/home-summary';

// Blocco 1 della home — tre metriche in una striscia COMPATTA.
//
// Compatta di proposito: il principio di prodotto dice "prima cio' che e'
// fermo, poi cio' che va bene", e le metriche sono cio' che va bene. Una
// riga bassa lascia il blocco decisioni visibile senza scroll anche da
// mobile — il test dei 10 secondi si gioca li'.

const EUR_FMT = new Intl.NumberFormat('it-IT', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});

const MONTH_FMT = new Intl.DateTimeFormat('it-IT', { month: 'long' });

/** Etichette host-friendly per le categorie servizio. */
const CATEGORY_LABELS: Record<string, string> = {
  boat_tour: 'barca',
  transfer: 'transfer',
  chef: 'chef',
  cleaning: 'pulizie',
  wellness: 'benessere',
  rental: 'noleggio',
  food_delivery: 'cibo a casa',
  other: 'altro',
};

function Tile({
  value,
  label,
  sub,
}: {
  value: string;
  label: string;
  sub: string;
}): React.JSX.Element {
  return (
    <div className="flex-1 rounded-card border border-line bg-paper px-4 py-3 shadow-sm">
      <p className="font-serif text-[26px] leading-none text-ink">{value}</p>
      <p className="mt-1 text-[13px] font-medium text-ink-soft">{label}</p>
      <p className="mt-0.5 text-[12px] text-ink-mute">{sub}</p>
    </div>
  );
}

export function HomeMetricsStrip({
  metrics,
  now = new Date(),
}: {
  metrics: HomeMetrics;
  now?: Date;
}): React.JSX.Element {
  const month = MONTH_FMT.format(now);

  const guestsTotal = metrics.guestsInHouse + metrics.guestsArriving;
  const topCategories = metrics.extrasByCategory
    .slice(0, 2)
    .map((c) => `${c.n} ${CATEGORY_LABELS[c.category] ?? c.category}`)
    .join(' · ');

  return (
    <section aria-label="Riepilogo" className="mx-5 flex flex-col gap-2.5 sm:flex-row">
      <Tile
        value={String(guestsTotal)}
        label="Ospiti"
        sub={
          guestsTotal === 0
            ? 'Nessuno in casa, nessuno in arrivo'
            : `${metrics.guestsInHouse} in casa · ${metrics.guestsArriving} in arrivo`
        }
      />
      <Tile
        value={EUR_FMT.format(metrics.extrasMonthEur)}
        label={`Extra venduti — ${month}`}
        sub={
          metrics.extrasMonthCount === 0
            ? 'Ancora nessuna richiesta questo mese'
            : `${metrics.extrasMonthCount} ${metrics.extrasMonthCount === 1 ? 'richiesta' : 'richieste'}${topCategories ? ` · ${topCategories}` : ''}`
        }
      />
      <Tile
        value={
          metrics.totalMessagesMonth === 0
            ? '—'
            : `${metrics.agentMessagesMonth}/${metrics.totalMessagesMonth}`
        }
        label={`Messaggi — ${month}`}
        sub={
          metrics.totalMessagesMonth === 0
            ? 'Nessun messaggio questo mese'
            : `${metrics.agentMessagesMonth} scritti dall'agente, il resto da te`
        }
      />
    </section>
  );
}
