import Link from 'next/link';
import { OnboardingShell } from '../_components/OnboardingShell';
import { advanceFromGmailAction, skipToNextStepAction } from '../actions';

export const dynamic = 'force-dynamic';

export default function OnboardingGmailPage() {
  return (
    <OnboardingShell
      step="gmail"
      title="Connetti la tua Gmail"
      subtitle="Premura legge le notifiche email Booking e Airbnb per sapere quando un ospite ti scrive. Niente altre email vengono lette."
    >
      <div className="flex flex-col gap-3">
        <ul className="space-y-2 rounded-card bg-peach/40 px-4 py-3 text-body-sm text-blu-deep/80">
          <li>Solo notifiche Booking + Airbnb</li>
          <li>Mai email personali</li>
          <li>Puoi disconnettere quando vuoi</li>
        </ul>

        <Link
          href="/connect-gmail"
          className="mt-4 w-full rounded-button bg-terracotta px-4 py-3 text-center font-semibold text-ivory transition-opacity hover:opacity-90"
        >
          Connetti Gmail
        </Link>

        <form action={advanceFromGmailAction}>
          <button
            type="submit"
            className="w-full rounded-button bg-blu-deep/5 px-4 py-3 font-medium text-blu-deep/80 transition-colors hover:bg-blu-deep/10"
          >
            Ho gia' connesso, vai avanti
          </button>
        </form>

        <form action={() => skipToNextStepAction('gmail')}>
          <button
            type="submit"
            className="w-full text-body-sm text-blu-deep/50 underline-offset-2 hover:underline"
          >
            Salta per ora
          </button>
        </form>
      </div>
    </OnboardingShell>
  );
}
