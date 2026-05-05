import { getCurrentHostId } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { getOnboardingState, urlForStep } from '@/lib/onboarding';
import { findByHostId } from '@/lib/repositories/bookings';
import { findByHostId as findPropertiesByHostId } from '@/lib/repositories/properties';
import { listPendingReplyDraftsForHost } from '@/lib/repositories/reply-drafts';
import { isIncompleteDataSource } from '@/lib/types';
import { redirect } from 'next/navigation';
import { BookingsList } from './_components/BookingsList';
import { DashboardHeader } from './_components/DashboardHeader';
import { EmptyOnboardingState } from './_components/EmptyOnboardingState';
import { EmptyState } from './_components/EmptyState';
import { IncompleteAlert } from './_components/IncompleteAlert';
import { ReplyDraftCard } from './_components/ReplyDraftCard';
import { completeBookingAction, createPropertyAction, skipBookingAction } from './actions';

// Server component: render server-side, fetch via repository drizzle
// diretto (vedi commit precedente per la decisione architetturale).
// Niente cache di Next: ogni pageload riflette lo stato reale del DB,
// importante per i flussi mutate-and-revalidate del dialog.
//
// La lista mostra solo prenotazioni operative (check-in da oggi - 2gg
// in avanti, filtro temporale in findByHostId). Le passate sono
// archivio: non c'e' ancora una vista dedicata in slice 5.
//
// Protezione: middleware Supabase fase 5 redirect /login se non
// autenticato. getCurrentHostId() throw difensivo se la sessione
// risultasse assente nonostante il middleware (race a pulizia cookie).

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const hostId = await getCurrentHostId();
  const { db } = await getDb();

  // Slice 9 prep: redirect al flusso onboarding stepper se l'host non
  // ha completato l'onboarding. Pre-empt il fallback EmptyOnboardingState
  // (che e' stato un MVP minimal pre-stepper).
  const onboarding = await getOnboardingState(db, hostId);
  if (!onboarding.completed) {
    redirect(urlForStep(onboarding.step));
  }

  // Fallback storico: host completato onboarding ma senza property
  // (caso edge — non dovrebbe succedere col nuovo flusso). Manteniamo
  // EmptyOnboardingState per backward-compat con utenti pre-slice 9.
  const hostProperties = await findPropertiesByHostId({ db, hostId });
  if (hostProperties.length === 0) {
    return (
      <main className="mx-auto min-h-screen w-full max-w-md bg-ivory">
        <DashboardHeader hostFirstName="Andrea" />
        <EmptyOnboardingState createAction={createPropertyAction} />
        <div className="h-12" aria-hidden />
      </main>
    );
  }

  const [bookings, replyDrafts] = await Promise.all([
    findByHostId({ db, hostId }),
    listPendingReplyDraftsForHost(db, hostId),
  ]);

  const incompleteToCompleteCount = bookings.filter(
    (b) => isIncompleteDataSource(b.dataSource) && !b.hostSkippedCompletion,
  ).length;

  return (
    <main className="mx-auto min-h-screen w-full max-w-md bg-ivory">
      <DashboardHeader hostFirstName="Andrea" />

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
