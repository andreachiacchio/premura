import { ToastProvider } from '@/components/Toast';
import { loadOpenDecisions } from '@/lib/repositories/open-decisions';
import { DashboardNav } from './_components/DashboardNav';

// ─────────────────────────────────────────────────────────────────────
// Un host apre Premura tre volte al giorno per trenta secondi.
// La dashboard risponde a una domanda: cosa devo fare adesso?
// ─────────────────────────────────────────────────────────────────────
//
// Tutto quello che sta qui sotto discende da quella frase. Una colonna
// sola, perche' due colonne costringono a scegliere dove guardare. Le
// decisioni in cima, perche' sono la risposta alla domanda. Le date
// occupate in fondo, perche' sono contesto e non compiti. E niente
// riepiloghi di attivita' che non e' avvenuta: in trenta secondi non
// c'e' spazio per far scorrere qualcosa di finto prima di arrivare al
// vero.
//
// Il badge sulla navigazione legge lo STESSO numero del blocco
// decisioni, da loadOpenDecisions(): memoizzata per richiesta, quindi
// layout e pagina non pagano due volte le stesse query e non possono
// mostrare due conteggi diversi.

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}): Promise<React.JSX.Element> {
  const { count } = await loadOpenDecisions();

  return (
    <ToastProvider>
      <div className="min-h-screen bg-ivory lg:pl-[220px]">
        <DashboardNav decisionsCount={count} />
        {/* pb-24 su mobile: la barra in basso non deve coprire
            l'ultima card. Da md la barra non c'e' piu' in basso. */}
        <div className="pb-24 md:pb-10">{children}</div>
      </div>
    </ToastProvider>
  );
}
