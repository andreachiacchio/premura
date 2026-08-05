import { getCurrentHostId } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { hasRealGuestName } from '@/lib/guest-name';
import { getOnboardingState, urlForStep } from '@/lib/onboarding';
import { startTimer, timed } from '@/lib/perf';
import {
  buildAgentStatus,
  findNextActiveArrival,
  getCalendarStateForHost,
} from '@/lib/repositories/agent-status';
import { findByHostId } from '@/lib/repositories/bookings';
import { listGuestsArrivingSoon, listGuestsInHouse } from '@/lib/repositories/home-guests';
import { getHomeSummary, listGuestsMissingPhoneSoon } from '@/lib/repositories/home-summary';
import { countKitsByStatusForHost } from '@/lib/repositories/kits';
import { findByHostId as findPropertiesByHostId } from '@/lib/repositories/properties';
import { listPossibleCancellations } from '@/lib/repositories/possible-cancellations';
import { listPendingReplyDraftsForHost } from '@/lib/repositories/reply-drafts';
import { isIncompleteDataSource } from '@/lib/types';
import { hosts } from '@premura/db';
import { eq } from 'drizzle-orm';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AddBookingButton } from './_components/AddBookingButton';
import { AgentCard } from './_components/AgentCard';
import { AgentFeed } from './_components/AgentFeed';
import { BookingsList } from './_components/BookingsList';
import { DashboardHeader } from './_components/DashboardHeader';
import { DecisionsBlock, decisionsCount } from './_components/DecisionsBlock';
import { EmptyOnboardingState } from './_components/EmptyOnboardingState';
import { HomeGuests } from './_components/HomeGuests';
import { ReplyDraftCard } from './_components/ReplyDraftCard';
import {
  completeBookingAction,
  createDirectBookingAction,
  createPropertyAction,
  skipBookingAction,
} from './actions';

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
    return await timed(`q ${label}`, fn);
  } catch (err) {
    console.error(`[dashboard] ${label} failed`, err);
    return fallback;
  }
}

export default async function DashboardPage() {
  const stopTotale = startTimer('PAGINA /dashboard dati');
  const hostId = await timed('getCurrentHostId', () => getCurrentHostId());
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
    stopTotale();
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
  const [bookings, replyDrafts, kitStatusCounts, summary, missingPhoneSoon, hostRow, nextArrival] =
    await Promise.all([
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
      safeQuery<{ fullName: string | null } | null>(
        'hostFullName',
        async () => {
          const [row] = await db
            .select({ fullName: hosts.fullName })
            .from(hosts)
            .where(eq(hosts.id, hostId))
            .limit(1);
          return row ?? null;
        },
        null,
      ),
      safeQuery<Awaited<ReturnType<typeof findNextActiveArrival>>>(
        'findNextActiveArrival',
        () => findNextActiveArrival(db, hostId),
        null,
      ),
    ]);

  // Home desktop (30/07): ospiti in casa e in arrivo, stessi predicati
  // della metrica dell'agent card ("mai due verita'").
  const now = new Date();
  const [guestsInHouseRows, guestsArrivingRows, possibleCancellations, calendars] =
    await Promise.all([
      safeQuery('listGuestsInHouse', () => listGuestsInHouse(db, hostId, now), []),
      safeQuery('listGuestsArrivingSoon', () => listGuestsArrivingSoon(db, hostId, now), []),
      safeQuery('listPossibleCancellations', () => listPossibleCancellations(db, hostId), []),
      safeQuery('getCalendarStateForHost', () => getCalendarStateForHost(db, hostId), {
        feedsTotali: 0,
        feedsLetti: 0,
        feedsInErrore: 0,
      }),
    ]);
  stopTotale();

  const incompleteToCompleteCount = bookings.filter(
    (b) => isIncompleteDataSource(b.dataSource) && !b.hostSkippedCompletion,
  ).length;

  // Slice C: counter kit in attesa di approvazione founder.
  const pendingKitsCount = (kitStatusCounts.proposed ?? 0) + (kitStatusCounts.modified ?? 0);

  // Capitalizzato: nel profilo puo' essere minuscolo ("andrea").
  const rawFirstName = hostRow?.fullName?.trim().split(/\s+/)[0] || 'ospite';
  const hostFirstName = rawFirstName.charAt(0).toUpperCase() + rawFirstName.slice(1);

  // Blocco decisioni costruito PRIMA del render: il contatore "serve te"
  // dell'agent card e' lo stesso numero, mai due verita' diverse.
  const decisionsData = {
    draftItems: replyDrafts.map((d) => ({
      key: d.id,
      waitingLabel: waitingSince(d.createdAt),
      card: <ReplyDraftCard draft={d} />,
    })),
    missingPhoneSoon,
    incompleteCount: incompleteToCompleteCount,
    pendingKitsCount,
    possibleCancellations,
  };

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const actionsToday = summary.feed.filter((f) => f.at >= startOfToday).length;

  // 05/08: la card e il contatore "Serve te" leggono lo STESSO numero,
  // e lo stato dei calendari entra nella frase: mai "tutto tranquillo"
  // quando c'e' qualcosa in sospeso o il calendario non e' stato letto.
  const needsYouCount = decisionsCount(decisionsData);

  // "Prenotazione con nome" ha una definizione precisa: i segnaposto
  // dei feed ("Booking Guest", "Reserved", "ospite") non contano.
  const hasAnyNamedBooking = bookings.some((b) => hasRealGuestName(b.guestFullName));
  const propertyOptions = hostProperties.map((p) => ({ id: p.id, name: p.name }));

  const agentStatus = buildAgentStatus({
    pendingDraftsCount: replyDrafts.length,
    oldestDraftGuestName: replyDrafts[0]?.guestFullName ?? null,
    nextArrival,
    needsYouCount,
    calendars,
  });

  return (
    // HOME = RIEPILOGO, tre blocchi (Andrea, 29/07):
    //   1. metriche — striscia compatta: e' cio' che va bene, non ruba
    //      spazio a cio' che e' fermo (principio "10 secondi")
    //   2. "Serve una tua decisione" — solo cio' che aspetta l'host,
    //      con l'azione inline; vuoto = nascosto
    //   3. "Fatto dall'agente — oggi" — feed, ieri dietro un click
    // Sotto i blocchi restano le sezioni operative (risposte da
    // approvare, prenotazioni) a cui le voci del blocco 2 si ancorano.
    // Colonna 480px SEMPRE (mobile-first come il prototipo); su desktop
    // diventa una carta centrata con ombra invece di allargarsi.
    // DUE LAYOUT, non uno responsive (30/07): sotto md la colonna 480px
    // del prototipo, esattamente com'e'; da md in su un layout suo che
    // usa la larghezza (fino a ~1200px): agent card + metriche sulla
    // stessa riga, decisioni a sinistra e feed a destra, liste a griglia.
    <main className="mx-auto min-h-screen w-full max-w-[480px] bg-ivory md:max-w-[1200px] md:px-6">
      <DashboardHeader hostFirstName={hostFirstName} />

      {/* Barra di navigazione vera, sotto il saluto (bug 30/07: i link
          incastrati sotto le metriche si sovrapponevano). */}
      <nav
        aria-label="Sezioni"
        className="mx-5 mb-5 flex gap-x-5 overflow-x-auto whitespace-nowrap border-y border-line-soft py-2.5 md:mx-0"
      >
        {/* Voce corrente evidenziata (punto 5, 30/07). */}
        <span
          aria-current="page"
          className="border-b-2 border-terracotta pb-0.5 text-body-sm font-semibold text-ink"
        >
          Home
        </span>
        <Link
          href="/dashboard/conversations"
          className="text-body-sm font-medium text-ink-soft hover:text-ink"
        >
          Conversazioni
        </Link>
        <Link
          href="/dashboard/upcoming-checkins"
          className="text-body-sm font-medium text-ink-soft hover:text-ink"
        >
          Prossimi check-in
        </Link>
        <Link
          href="/dashboard/kits"
          className="text-body-sm font-medium text-ink-soft hover:text-ink"
        >
          Kit
        </Link>
        <Link
          href="/dashboard/cleaners"
          className="text-body-sm font-medium text-ink-soft hover:text-ink"
        >
          Squadra
        </Link>
        <Link href="/properties" className="text-body-sm font-medium text-ink-soft hover:text-ink">
          Strutture
        </Link>
      </nav>

      {/* Agent card: barra a tutta larghezza su desktop (punto 2).
          I riquadri metriche sono stati eliminati: il dato vive SOLO
          qui (punto 3 — "9 in casa" non deve comparire due volte). */}
      <AgentCard
        status={agentStatus}
        stats={{
          activeGuests: summary.metrics.guestsInHouse,
          actionsToday,
          needsYou: needsYouCount,
        }}
      />

      {/* Da md: decisioni a sinistra, feed a destra; le liste sotto a
          tutta larghezza. Su mobile l'ordine DOM resta quello del
          prototipo: decisioni -> liste -> feed. */}
      {/* Due colonne piene su desktop (punto 4): sinistra ospiti in
          casa + in arrivo + liste, destra decisioni + feed. Ordine DOM
          mobile invariato: decisioni -> liste -> feed. */}
      <div className="md:mt-4 md:grid md:grid-cols-[3fr_2fr] md:items-start md:gap-4">
        <div className="md:col-start-2 md:row-start-1">
          <DecisionsBlock data={decisionsData} />
        </div>

        <div className="md:col-start-1 md:row-span-2 md:row-start-1">
          <HomeGuests inHouse={guestsInHouseRows} arriving={guestsArrivingRows} now={now} />
          <div id="prenotazioni" className="scroll-mt-6">
            <BookingsList
              bookings={bookings}
              properties={hostProperties}
              completeAction={completeBookingAction}
              skipAction={skipBookingAction}
            />
          </div>
          {/* 05/08: quando non c'e' NESSUNA prenotazione con un nome
              vero, questa colonna resta vuota — HomeGuests ritorna
              null e BookingsList non ha sezioni. E' il momento in cui
              un host che lavora in diretto non ha nulla da fare, e
              l'unica azione sensata e' inserire la prima. */}
          {!hasAnyNamedBooking && (
            <div className="rounded-card border border-line-soft bg-paper px-5 py-6 text-center shadow-sm">
              <p className="font-serif text-h4 leading-tight text-ink">
                Non ho ancora nessun ospite con un nome.
              </p>
              <p className="mt-2 text-body-sm text-ink-soft">
                Se hai preso una prenotazione al telefono o via email, aggiungila: con il numero
                me ne occupo io.
              </p>
              <div className="mt-5 flex justify-center">
                <AddBookingButton
                  properties={propertyOptions}
                  createAction={createDirectBookingAction}
                  variant="primary"
                  label="Aggiungi una prenotazione"
                />
              </div>
            </div>
          )}
        </div>

        <div className="md:col-start-2 md:row-start-2">
          <AgentFeed
            items={summary.feed.map((f) => ({
              at: f.at.toISOString(),
              line: f.line,
              kind: f.kind,
              simulated: f.simulated,
            }))}
          />
        </div>
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
