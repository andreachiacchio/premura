import { ChevronRight } from 'lucide-react';
import Link from 'next/link';

// Slice A — Card riassuntiva "Prossimi check-in" sulla home dashboard.
// Mostra count totale + count senza numero. Link a /dashboard/upcoming-checkins
// per il bulk fill. Stile coerente con IncompleteAlert (peach se da fare,
// verde se tutto pronto).

export function UpcomingCheckinsCard({
  total,
  missing,
}: {
  total: number;
  missing: number;
}): React.JSX.Element {
  const allReady = missing === 0;
  const containerCls = allReady
    ? 'border-ok/30 bg-line-soft text-ok'
    : 'border-terracotta-soft bg-gradient-to-br from-peach to-peach-deep text-terracotta-2';
  const dotCls = allReady ? 'bg-ok' : 'bg-terracotta';

  return (
    <Link
      href="/dashboard/upcoming-checkins"
      className={`group mx-5 mt-3 flex items-center gap-3.5 rounded-card border px-4 py-3.5 text-left shadow-sm transition-transform hover:-translate-y-px ${containerCls}`}
    >
      <span aria-hidden className={`mt-0.5 size-2.5 shrink-0 rounded-full ${dotCls}`} />
      <div className="flex-1">
        <div className="text-[14px] font-semibold leading-tight">
          {allReady
            ? `Tutto pronto per i prossimi ${total} check-in`
            : `${total} ${total === 1 ? 'check-in' : 'check-in'} in arrivo · ${missing} ${missing === 1 ? 'da configurare' : 'da configurare'}`}
        </div>
        <div className="mt-0.5 text-body-sm opacity-80">
          {allReady
            ? 'Premura puo lavorare in autonomia.'
            : "Inserisci il numero WhatsApp per attivare l'agente."}
        </div>
      </div>
      <ChevronRight
        aria-hidden
        className="size-[18px] shrink-0 transition-transform group-hover:translate-x-0.5"
      />
    </Link>
  );
}
