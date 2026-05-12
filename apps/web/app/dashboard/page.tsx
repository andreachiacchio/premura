import { getCurrentHostId } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { getOnboardingState, urlForStep } from '@/lib/onboarding';
import { findByHostId } from '@/lib/repositories/bookings';
import { countActiveCleanersForHost } from '@/lib/repositories/cleaners';
import { countKitsByStatusForHost } from '@/lib/repositories/kits';
import { findByHostId as findPropertiesByHostId } from '@/lib/repositories/properties';
import { listPendingReplyDraftsForHost } from '@/lib/repositories/reply-drafts';
import { listUpcomingCheckins } from '@/lib/repositories/upcoming-checkins';
import { isIncompleteDataSource } from '@/lib/types';
import { redirect } from 'next/navigation';
import { BookingsList } from './_components/BookingsList';
import { CleanersCard } from './_components/CleanersCard';
import { DashboardHeader } from './_components/DashboardHeader';
import { EmptyOnboardingState } from './_components/EmptyOnboardingState';
import { EmptyState } from './_components/EmptyState';
import { IncompleteAlert } from './_components/IncompleteAlert';
import { KitsApprovalCard } from './_components/KitsApprovalCard';
import { ReplyDraftCard } from './_components/ReplyDraftCard';
import { UpcomingCheckinsCard } from './_components/UpcomingCheckinsCard';
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
  const [bookings, replyDrafts, upcoming, kitStatusCounts, activeCleanersCount] = await Promise.all(
    [
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
      safeQuery<Awaited<ReturnType<typeof listUpcomingCheckins>>>(
        'listUpcomingCheckins',
        () => listUpcomingCheckins(db, hostId),
        [],
      ),
      safeQuery<Record<string, number>>(
        'countKitsByStatusForHost',
        () => countKitsByStatusForHost(db, hostId),
        {},
      ),
      safeQuery<number>(
        'countActiveCleanersForHost',
        () => countActiveCleanersForHost(db, hostId),
        0,
      ),
    ],
  );

  const incompleteToCompleteCount = bookings.filter(
    (b) => isIncompleteDataSource(b.dataSource) && !b.hostSkippedCompletion,
  ).length;

  // Slice A: counter prossimi check-in da configurare (senza guest_phone).
  const upcomingTotal = upcoming.length;
  const upcomingMissingPhone = upcoming.filter((b) => !b.guestPhone).length;

  // Slice C: counter kit in attesa di approvazione founder.
  const pendingKitsCount = (kitStatusCounts.proposed ?? 0) + (kitStatusCounts.modified ?? 0);

  return (
    <main className="mx-auto min-h-screen w-full max-w-md bg-ivory">
      <DashboardHeader hostFirstName="Andrea" />

      {/* Slice A: card "Prossimi check-in" — gateway per attivare booking. */}
      {upcomingTotal > 0 ? (
        <UpcomingCheckinsCard total={upcomingTotal} missing={upcomingMissingPhone} />
      ) : null}

      {/* Slice C: card "Kit pronti per approvazione" — gateway approval flow. */}
      {pendingKitsCount > 0 ? <KitsApprovalCard pendingCount={pendingKitsCount} /> : null}

      {/* Slice F: card cleaner — sempre presente per accesso veloce. */}
      <CleanersCard activeCount={activeCleanersCount} />

      {incompleteToCompleteCount > 0 ? (
        <IncompleteAlert count={incompleteToCompleteCount} />
      ) : (
        <EmptyState />
      )}

      {replyDrafts.length > 0 ? (
        <section className="mx-5 mt-3 flex flex-col gap-3">
          <h2 className="text-eyebrow uppercase tracking-wider text-ink-mute">
            Draft da approvare ({replyDrafts.length})
          </h2>
          {replyDrafts.map((d) => (
            <ReplyDraftCard key={d.id} draft={d} />
          ))}
        </section>
      ) : null}

      <BookingsList
        bookings={bookings}
        completeAction={completeBookingAction}
        skipAction={skipBookingAction}
      />

      <div className="h-12" aria-hidden />
    </main>
  );
}
