import { getCurrentHostId } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { getOnboardingState, urlForStep } from '@/lib/onboarding';
import { findByHostId } from '@/lib/repositories/bookings';
import { getHomeSummary, listGuestsMissingPhoneSoon } from '@/lib/repositories/home-summary';
import { countKitsByStatusForHost } from '@/lib/repositories/kits';
import { findByHostId as findPropertiesByHostId } from '@/lib/repositories/properties';
import { listPendingReplyDraftsForHost } from '@/lib/repositories/reply-drafts';
import { isIncompleteDataSource } from '@/lib/types';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AgentFeed } from './_components/AgentFeed';
import { BookingsList } from './_components/BookingsList';
import { DashboardHeader } from './_components/DashboardHeader';
import { DecisionsBlock } from './_components/DecisionsBlock';
import { EmptyOnboardingState } from './_components/EmptyOnboardingState';
import { HomeMetricsStrip } from './_components/HomeMetricsStrip';
import { ReplyDraftCard } from './_components/ReplyDraftCard';
import { completeBookingAction, createPropertyAction, skipBookingAction } from './actions';

// Server component: render server-side, fetch via repository drizzle
// diretto (vedi commit precedente per la decisione architetturale).
// Niente cache di Next: ogni pageload riflette lo stato reale del DB,
// importante per i flussi mutate-and-revalidate del dialog.
//
// HOTFIX dashboard resilience (post bug prod V1):
// le query di sezione (bookings / drafts / upcoming / kits / cleaners)
// vengono ora eseguite INDIPENDENTEMENTE con try/catch ciascuna. Se una
// fallisce per qualunque motivo (migration mancante, RLS, schema drift)
// il dashboard resta navigabile mostrando empty state per quella sezione
// invece di un'unica server-side exception. Ogni fail logga su console
// con prefisso `[dashboard]` per visibilità in Vercel logs.
//
// Protezione: middleware Supabase fase 5 redirect /login se non
// autenticato. getCurrentHostId() throw difensivo se la sessione
// risultasse assente nonostante il middleware (race a pulizia cookie).

export const dynamic = 'force-dynamic';

async function safeQuery<T>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    console.error(`[dashboard] ${label} failed`, err);
    return fallback;
  }
}

export default async function DashboardPage() {
  const hostId = await getCurrentHostId();
  const { db } = await getDb();

  // Slice 9 prep: redirect al flusso onboarding stepper se l'host non
  // ha completato l'onboarding. Pre-empt il fallback EmptyOnboardingState
  // (che e' stato un MVP minimal pre-stepper).
  const onboarding = await safeQuery('getOnboardingState', () => getOnboardingState(db, hostId), {
    step: 'completed' as const,
    completed: true,
  });
  if (!onboarding.completed) {
    redirect(urlForStep(onboarding.step));
  }

  // Fallback storico: host completato onboarding ma senza property
  // (caso edge — non dovrebbe succedere col nuovo flusso). Manteniamo
  // EmptyOnboardingState per backward-compat con utenti pre-slice 9.
  const hostProperties = await safeQuery(
    'findPropertiesByHostId',
    () => findPropertiesByHostId({ db, hostId }),
    [],
  );
  if (hostProperties.length === 0) {
    return (
      <main className="mx-auto min-h-screen w-full max-w-md bg-ivory">
        <DashboardHeader hostFirstName="Andrea" />
        <EmptyOnboardingState createAction={createPropertyAction} />
        <div className="h-12" aria-hidden />
      </main>
    );
  }

  // HOTFIX: ogni query e' isolata. Una fail non rompe le altre.
  // Defaults garantiscono empty-state UI graziosa.
  const [bookings, replyDrafts, kitStatusCounts, summary, missingPhoneSoon] = await Promise.all([
    safeQuery<Awaited<ReturnType<typeof findByHostId>>>(
      'findByHostId',
      () => findByHostId({ db, hostId }),
      [],
    ),
    safeQuery<Awaited<ReturnType<typeof listPendingReplyDraftsForHost>>>(
      'listPendingReplyDraftsForHost',
      () => listPendingReplyDraftsForHost(db, hostId),
      [],
    ),
    safeQuery<Record<string, number>>(
      'countKitsByStatusForHost',
      () => countKitsByStatusForHost(db, hostId),
      {},
    ),
    safeQuery<Awaited<ReturnType<typeof getHomeSummary>>>(
      'getHomeSummary',
      () => getHomeSummary(db, hostId),
      {
        metrics: {
          guestsInHouse: 0,
          guestsArriving: 0,
          extrasMonthEur: 0,
          extrasMonthCount: 0,
          extrasByCategory: [],
          agentMessagesMonth: 0,
          totalMessagesMonth: 0,
        },
        feed: [],
      },
    ),
    safeQuery<Awaited<ReturnType<typeof listGuestsMissingPhoneSoon>>>(
      'listGuestsMissingPhoneSoon',
      () => listGuestsMissingPhoneSoon(db, hostId),
      [],
    ),
  ]);

  const incompleteToCompleteCount = bookings.filter(
    (b) => isIncompleteDataSource(b.dataSource) && !b.hostSkippedCompletion,
  ).length;

  // Slice C: counter kit in attesa di approvazione founder.
  const pendingKitsCount = (kitStatusCounts.proposed ?? 0) + (kitStatusCounts.modified ?? 0);

  return (
    // HOME = RIEPILOGO, tre blocchi (Andrea, 29/07):
    //   1. metriche — striscia compatta: e' cio' che va bene, non ruba
    //      spazio a cio' che e' fermo (principio "10 secondi")
    //   2. "Serve una tua decisione" — solo cio' che aspetta l'host,
    //      con l'azione inline; vuoto = nascosto
    //   3. "Fatto dall'agente — oggi" — feed, ieri dietro un click
    // Sotto i blocchi restano le sezioni operative (risposte da
    // approvare, prenotazioni) a cui le voci del blocco 2 si ancorano.
    <main className="mx-auto min-h-screen w-full max-w-md bg-ivory lg:max-w-5xl xl:max-w-[1400px] xl:px-6">
      <DashboardHeader hostFirstName="Andrea" />

      {/* Navigazione secondaria: tutto il resto sta dietro un click. */}
      <nav aria-label="Sezioni" className="mx-5 mb-4 flex flex-wrap gap-x-4 gap-y-1">
        <Link
          href="/dashboard/upcoming-checkins"
          className="text-body-sm font-medium text-ink-soft underline-offset-2 hover:text-ink hover:underline"
        >
          Prossimi check-in
        </Link>
        <Link
          href="/dashboard/kits"
          className="text-body-sm font-medium text-ink-soft underline-offset-2 hover:text-ink hover:underline"
        >
          Kit
        </Link>
        <Link
          href="/dashboard/cleaners"
          className="text-body-sm font-medium text-ink-soft underline-offset-2 hover:text-ink hover:underline"
        >
          Squadra
        </Link>
        <Link
          href="/properties"
          className="text-body-sm font-medium text-ink-soft underline-offset-2 hover:text-ink hover:underline"
        >
          Strutture
        </Link>
      </nav>

      {/* Blocco 1 — metriche */}
      <HomeMetricsStrip metrics={summary.metrics} />

      {/* Blocco 2 — decisioni in attesa (nascosto se vuoto). Le bozze
          sono voci di questo blocco, in cima, con la card completa
          (anteprima + approva/modifica inline) e il tempo di attesa:
          venerdi' e' la schermata dove vive l'host. */}
      <DecisionsBlock
        data={{
          draftItems: replyDrafts.map((d) => ({
            key: d.id,
            waitingLabel: waitingSince(d.createdAt),
            card: <ReplyDraftCard draft={d} />,
          })),
          missingPhoneSoon,
          incompleteCount: incompleteToCompleteCount,
          pendingKitsCount,
        }}
      />

      {/* Blocco 3 — fatto dall'agente */}
      <AgentFeed
        items={summary.feed.map((f) => ({
          at: f.at.toISOString(),
          line: f.line,
          kind: f.kind,
          simulated: f.simulated,
        }))}
      />

      <div id="prenotazioni" className="scroll-mt-6">
        <BookingsList
          bookings={bookings}
          completeAction={completeBookingAction}
          skipAction={skipBookingAction}
        />
      </div>

      <div className="h-12" aria-hidden />
    </main>
  );
}

// "in attesa da 12 min" — il tempo di attesa di una bozza e' l'informazione
// che decide la priorita': ogni minuto e' silenzio verso l'ospite.
function waitingSince(createdAt: Date): string {
  const mins = Math.max(0, Math.round((Date.now() - createdAt.getTime()) / 60_000));
  if (mins < 1) return 'in attesa da ora';
  if (mins < 60) return `in attesa da ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `in attesa da ${hours} ${hours === 1 ? 'ora' : 'ore'}`;
  const days = Math.floor(hours / 24);
  return `in attesa da ${days} ${days === 1 ? 'giorno' : 'giorni'}`;
}
