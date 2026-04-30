import { findByHostId } from "@/lib/repositories/bookings";
import { findByHostId as findPropertiesByHostId } from "@/lib/repositories/properties";
import { getCurrentHostId } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { isIncompleteDataSource } from "@/lib/types";
import { DashboardHeader } from "./_components/DashboardHeader";
import { IncompleteAlert } from "./_components/IncompleteAlert";
import { BookingsList } from "./_components/BookingsList";
import { EmptyState } from "./_components/EmptyState";
import { EmptyOnboardingState } from "./_components/EmptyOnboardingState";
import {
  completeBookingAction,
  createPropertyAction,
  skipBookingAction,
} from "./actions";
import { notFound } from "next/navigation";

// Server component: render server-side, fetch via repository drizzle
// diretto (vedi commit precedente per la decisione architetturale).
// Niente cache di Next: ogni pageload riflette lo stato reale del DB,
// importante per i flussi mutate-and-revalidate del dialog.
//
// La lista mostra solo prenotazioni operative (check-in da oggi - 2gg
// in avanti, filtro temporale in findByHostId). Le passate sono
// archivio: non c'e' ancora una vista dedicata in slice 5.

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  // Public-facing 404 in production senza opt-in esplicito. Slice 5 non
  // ha auth vera (vedi lib/auth.ts e KNOWN-LIMITS sezione 20): chiunque
  // hit /dashboard vedrebbe le prenotazioni di La Goccia. Per smoke test
  // su staging Vercel accendo ALLOW_DEV_HOST=1 a mano.
  if (
    process.env.NODE_ENV === "production" &&
    process.env.ALLOW_DEV_HOST !== "1"
  ) {
    notFound();
  }

  const hostId = await getCurrentHostId();
  const { db } = await getDb();

  // Onboarding short-circuit: host appena loggato senza alcuna property.
  // Mostriamo solo lo state di benvenuto, niente lista bookings (che
  // sarebbe vuota comunque, salviamo una query).
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
