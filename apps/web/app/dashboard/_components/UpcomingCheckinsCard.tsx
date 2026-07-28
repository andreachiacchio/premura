import { ChevronRight } from 'lucide-react';
import Link from 'next/link';

// Slice A — Card riassuntiva "Prossimi check-in" sulla home dashboard.
// Mostra count totale + count senza numero. Link a /dashboard/upcoming-checkins
// per il bulk fill. Stile coerente con IncompleteAlert (peach se da fare,
// verde se tutto pronto).

export function UpcomingCheckinsCard({
  total,
  missing,
  blockedByWindow = 0,
}: {
  total: number;
  missing: number;
  /**
   * Check-in col numero già inserito ma per cui un invio verrebbe
   * comunque rifiutato da WhatsApp: l'ospite non ha mai scritto (o ha
   * scritto più di 24h fa) e non esistono template approvati.
   *
   * Serve a non promettere l'attivazione dell'agente quando il sistema
   * non può mantenerla: col solo numero l'host crede che parta tutto,
   * poi l'invio fallisce con errore 131047 e lo scopre dall'ospite.
   */
  blockedByWindow?: number;
}): React.JSX.Element {
  // "Pronto" richiede due cose: il numero E la possibilità concreta di
  // scrivere. Il numero da solo non basta.
  const allReady = missing === 0 && blockedByWindow === 0;
  const containerCls = allReady
    ? 'border-ok/30 bg-line-soft text-ok'
    : 'border-terracotta-soft bg-gradient-to-br from-peach to-peach-deep text-terracotta-2';
  const dotCls = allReady ? 'bg-ok' : 'bg-terracotta';

  const sottotitolo = (): string => {
    if (allReady) return 'Premura puo lavorare in autonomia.';
    if (missing > 0) return "Inserisci il numero WhatsApp per attivare l'agente.";
    // Numero presente ma finestra chiusa: qui la frase vecchia mentiva.
    return blockedByWindow === 1
      ? '1 ospite non ha ancora scritto su WhatsApp: finche non lo fa non possiamo iniziare noi.'
      : `${blockedByWindow} ospiti non hanno ancora scritto su WhatsApp: finche non lo fanno non possiamo iniziare noi.`;
  };

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
        <div className="mt-0.5 text-body-sm opacity-80">{sottotitolo()}</div>
      </div>
      <ChevronRight
        aria-hidden
        className="size-[18px] shrink-0 transition-transform group-hover:translate-x-0.5"
      />
    </Link>
  );
}
