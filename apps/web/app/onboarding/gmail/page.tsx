import Link from 'next/link';
import { OnboardingShell } from '../_components/OnboardingShell';
import { advanceFromGmailAction, skipToNextStepAction } from '../actions';

export const dynamic = 'force-dynamic';

// Slice 10a — Gmail connect step.

export default function OnboardingGmailPage() {
  return (
    <OnboardingShell
      step="gmail"
      title="La tua Gmail"
      subtitle="Mi serve per leggere le notifiche di Booking e Airbnb e capire quando un ospite ti scrive. Niente altro."
    >
      <div className="flex flex-col gap-5">
        <ul className="space-y-2 rounded-card border border-line bg-paper-deep px-5 py-4 text-body-sm text-ink-soft">
          <li className="flex items-start gap-2">
            <span className="mt-1 size-1.5 shrink-0 rounded-full bg-ok" />
            Leggo solo notifiche da Booking e Airbnb.
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1 size-1.5 shrink-0 rounded-full bg-ok" />
            Le altre email restano private.
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1 size-1.5 shrink-0 rounded-full bg-ok" />
            Disconnetti quando vuoi, senza chiedere.
          </li>
        </ul>

        <Link
          href="/connect-gmail"
          className="mt-2 inline-flex h-12 w-full items-center justify-center rounded-full bg-terracotta px-6 text-body font-medium text-paper shadow-md transition-colors hover:bg-terracotta-2"
        >
          Connetti Gmail
        </Link>

        <form action={advanceFromGmailAction}>
          <button
            type="submit"
            className="inline-flex h-12 w-full items-center justify-center rounded-full border border-line bg-transparent px-6 text-body font-medium text-ink transition-colors hover:bg-line-soft"
          >
            L'ho gia' connessa
          </button>
        </form>

        <form action={skipToNextStepAction.bind(null, 'gmail')}>
          <button
            type="submit"
            className="text-body-sm text-ink-mute underline-offset-2 hover:text-ink hover:underline"
          >
            Salta per ora
          </button>
        </form>
      </div>
    </OnboardingShell>
  );
}
