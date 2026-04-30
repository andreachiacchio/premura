import { findByHostId } from "@/lib/repositories/bookings";
import { getCurrentHostId } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { isIncompleteDataSource } from "@/lib/types";
import { DashboardHeader } from "./_components/DashboardHeader";
import { IncompleteAlert } from "./_components/IncompleteAlert";
import { BookingsList } from "./_components/BookingsList";
import { EmptyState } from "./_components/EmptyState";
import { completeBookingAction, skipBookingAction } from "./actions";

// Server component: render server-side, fetch via repository drizzle
// diretto (vedi commit precedente per la decisione architetturale).
// Niente cache di Next: ogni pageload riflette lo stato reale del DB,
// importante per i flussi mutate-and-revalidate del dialog.

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const hostId = getCurrentHostId();
  const { db } = await getDb();
  const bookings = await findByHostId({ db, hostId });

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

      <BookingsList
        bookings={bookings}
        completeAction={completeBookingAction}
        skipAction={skipBookingAction}
      />

      <div className="h-12" aria-hidden />
    </main>
  );
}
