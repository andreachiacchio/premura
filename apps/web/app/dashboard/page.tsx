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
import { listGuestsArrivingSoon, listGuestsInHouse } from '@/lib/repositories/home-guests';
import { getHomeSummary } from '@/lib/repositories/home-summary';
import { findByHostId as findPropertiesByHostId } from '@/lib/repositories/properties';
import { hosts } from '@premura/db';
import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { loadOpenDecisions } from '@/lib/repositories/open-decisions';
import { AddBookingButton } from './_components/AddBookingButton';
import { AgentCard } from './_components/AgentCard';
import { BookingsList } from './_components/BookingsList';
import { DashboardHeader } from './_components/DashboardHeader';
import { DecisionsBlock } from './_components/DecisionsBlock';
import { EmptyOnboardingState } from './_components/EmptyOnboardingState';
import { EmptyState } from './_components/EmptyState';
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

  // Tutto cio' che aspetta l'host viene da UNA fonte, memoizzata per
  // richiesta: la stessa che alimenta il badge in navigazione. Due
  // conteggi scritti separatamente divergono, prima o poi.
  const decisions = await timed('loadOpenDecisions', () => loadOpenDecisions());
  const { replyDrafts, missingPhoneSoon, possibleCancellations, bookings } = decisions;

  // HOTFIX: ogni query e' isolata. Una fail non rompe le altre.
  // Defaults garantiscono empty-state UI graziosa.
  const [summary, hostRow, nextArrival] =
    await Promise.all([
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
  const [guestsInHouseRows, guestsArrivingRows, calendars] = await Promise.all([
    safeQuery('listGuestsInHouse', () => listGuestsInHouse(db, hostId, now), []),
    safeQuery('listGuestsArrivingSoon', () => listGuestsArrivingSoon(db, hostId, now), []),
    safeQuery('getCalendarStateForHost', () => getCalendarStateForHost(db, hostId), {
      feedsTotali: 0,
      feedsLetti: 0,
      feedsInErrore: 0,
    }),
  ]);
  stopTotale();

  // Capitalizzato: nel profilo puo' essere minuscolo ("andrea").
  const rawFirstName = hostRow?.fullName?.trim().split(/\s+/)[0] || 'ospite';
  const hostFirstName = rawFirstName.charAt(0).toUpperCase() + rawFirstName.slice(1);

  const decisionsData = {
    draftItems: replyDrafts.map((d) => ({
      key: d.id,
      waitingLabel: waitingSince(d.createdAt),
      guestLabel: d.guestFullName,
      card: <ReplyDraftCard draft={d} />,
    })),
    missingPhoneSoon,
    incompleteCount: decisions.incompleteCount,
    pendingKitsCount: decisions.pendingKitsCount,
    possibleCancellations,
  };

  // "Serve te" sulla card, badge in navigazione e voci del blocco: un
  // numero solo, da loadOpenDecisions(). Mai due verita'.
  const needsYouCount = decisions.count;

  // "Prenotazione con nome" ha una definizione precisa: i segnaposto
  // dei feed ("Booking Guest", "Reserved", "ospite") non contano.
  //
  // Il pannello sotto NON puo' basarsi solo su `bookings`: quella lista
  // parte da (oggi - 2 giorni), mentre "Chi e' in casa" non ha cutoff.
  // Un ospite entrato quattro giorni fa e inserito a mano comparirebbe
  // nella card in cima e, nella stessa colonna, sotto si leggerebbe
  // "non ho ancora nessun ospite con un nome": due verita' opposte a
  // dieci pixel di distanza. Il pannello si mostra solo quando la
  // colonna e' DAVVERO vuota — che e' quello che il commento accanto
  // ha sempre affermato.
  const hasAnyNamedBooking =
    bookings.some((b) => hasRealGuestName(b.guestFullName)) ||
    guestsInHouseRows.length > 0 ||
    guestsArrivingRows.length > 0;
  const propertyOptions = hostProperties.map((p) => ({ id: p.id, name: p.name }));

  const agentStatus = buildAgentStatus({
    pendingDraftsCount: replyDrafts.length,
    oldestDraftGuestName: replyDrafts[0]?.guestFullName ?? null,
    nextArrival,
    needsYouCount,
    calendars,
  });

  return (
    // UNA COLONNA (Andrea 06/08). Prima erano due, e la principale
    // ospitava "Date occupate" mentre "Serve una tua decisione" stava di
    // lato, piu' stretta: l'esatto contrario dell'ordine di importanza.
    // Con una colonna sola non c'e' da scegliere dove guardare, e
    // l'ordine verticale E' la priorita'.
    //
    // Ordine: stato -> decisioni -> chi e' in casa -> chi arriva ->
    // date occupate (contesto, in fondo).
    //
    // La spaziatura fra sezioni cresce SOLO da md in su. Su mobile piu'
    // aria significa piu' scroll per arrivare alla stessa cosa, e
    // trenta secondi non ne hanno.
    <main className="mx-auto w-full max-w-[720px] px-5 py-6 md:px-8">
      <div className="flex flex-col gap-6 md:gap-8">
        <DashboardHeader hostFirstName={hostFirstName} />

        <AgentCard
          status={agentStatus}
          stats={{
            activeGuests: summary.metrics.guestsInHouse,
            needsYou: needsYouCount,
          }}
        />

        {/* Vuoto = non si renderizza. Il silenzio e' l'informazione. */}
        <DecisionsBlock data={decisionsData} />

        <HomeGuests
          inHouse={guestsInHouseRows}
          arriving={guestsArrivingRows}
          now={now}
          calendarRead={calendars.feedsLetti > 0}
        />

        <div id="prenotazioni" className="scroll-mt-6">
          <BookingsList
            bookings={bookings}
            properties={hostProperties}
            completeAction={completeBookingAction}
            skipAction={skipBookingAction}
          />
        </div>

        {/* 05/08: quando non c'e' NESSUNA prenotazione con un nome vero
            la colonna resta vuota — HomeGuests ritorna null e
            BookingsList non ha sezioni. E' il momento in cui un host che
            lavora in diretto non ha nulla da fare, e l'unica azione
            sensata e' inserire la prima. */}
        {!hasAnyNamedBooking && (
          <EmptyState
            hint="Se hai preso una prenotazione al telefono o via email, aggiungila: con il numero me ne occupo io."
            action={
              <AddBookingButton
                properties={propertyOptions}
                createAction={createDirectBookingAction}
                variant="primary"
                label="Aggiungi una prenotazione"
              />
            }
          >
            Non ho ancora nessun ospite con un nome.
          </EmptyState>
        )}
      </div>
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
