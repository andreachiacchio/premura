import { OnboardingShell } from '../_components/OnboardingShell';
import { skipToNextStepAction, submitCleanerAction } from '../actions';

export const dynamic = 'force-dynamic';

// Slice H — Cleaner step. Skip ammesso (host può aggiungere
// dopo da /dashboard/cleaners).

export default function OnboardingCleanerPage() {
  const skip = skipToNextStepAction.bind(null, 'cleaner');

  return (
    <OnboardingShell
      step="cleaner"
      title="Chi si occupa delle pulizie?"
      subtitle="Premura coordina con loro i kit di benvenuto: invia il brief WhatsApp con cosa fare, riceve la foto del setup."
    >
      <form action={submitCleanerAction} className="flex flex-col gap-5">
        <label className="flex flex-col gap-2">
          <span className="text-body-sm font-medium text-ink-soft">Nome completo</span>
          <input
            type="text"
            name="fullName"
            maxLength={255}
            placeholder="Karen Esposito"
            className="h-12 rounded-card border border-line bg-paper px-4 text-body text-ink focus:border-terracotta-soft focus:outline-none"
          />
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-body-sm font-medium text-ink-soft">Numero WhatsApp</span>
          <input
            type="tel"
            name="whatsappNumber"
            placeholder="+39 333 1234567"
            className="h-12 rounded-card border border-line bg-paper px-4 text-body text-ink focus:border-terracotta-soft focus:outline-none"
          />
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-body-sm font-medium text-ink-soft">
            Indirizzo casa <span className="text-ink-mute">(per ritiro Amazon Locker)</span>
          </span>
          <input
            type="text"
            name="deliveryAddress"
            maxLength={500}
            placeholder="Via Roma 12, 80100 Napoli"
            className="h-12 rounded-card border border-line bg-paper px-4 text-body text-ink focus:border-terracotta-soft focus:outline-none"
          />
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-body-sm font-medium text-ink-soft">Fee per kit (€)</span>
          <input
            type="number"
            name="perKitFeeEur"
            min="0"
            max="50"
            step="0.50"
            defaultValue="2.00"
            className="h-12 rounded-card border border-line bg-paper px-4 text-body text-ink focus:border-terracotta-soft focus:outline-none"
          />
          <span className="text-body-sm text-ink-mute">Default: €2 per kit validato.</span>
        </label>

        <button
          type="submit"
          className="mt-2 inline-flex h-12 w-full items-center justify-center rounded-full bg-terracotta px-6 text-body font-medium text-paper shadow-md transition-colors hover:bg-terracotta-2 active:translate-y-px"
        >
          Completa setup
        </button>
      </form>

      <form action={skip} className="mt-4">
        <button
          type="submit"
          className="text-body-sm text-ink-mute underline-offset-2 hover:underline"
        >
          Lo aggiungo dopo
        </button>
      </form>
    </OnboardingShell>
  );
}
