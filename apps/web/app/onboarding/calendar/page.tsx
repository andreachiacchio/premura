import { SubmitButton } from '@/components/forms/SubmitButton';
import { OnboardingShell } from '../_components/OnboardingShell';
import { skipToNextStepAction } from '../actions';
import { CalendarForm } from './_components/CalendarForm';

export const dynamic = 'force-dynamic';

// Slice H — Calendar step: connetti iCal Booking / Airbnb.
// Skip ammesso (host può aggiungere dopo da settings property).

export default function OnboardingCalendarPage() {
  const skip = skipToNextStepAction.bind(null, 'calendar');

  return (
    <OnboardingShell
      step="calendar"
      title="Sincronizza il calendario"
      subtitle="Premura legge i tuoi check-in da Booking, Airbnb o altri portali. Incolla qui l'URL iCal."
    >
      <CalendarForm />
      <form action={skip} className="mt-6">
        <SubmitButton asSkip pendingLabel="Salto…">
          Lo aggiungo dopo
        </SubmitButton>
      </form>
    </OnboardingShell>
  );
}
