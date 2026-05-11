import { OnboardingShell } from '../_components/OnboardingShell';
import { submitFirstPropertyAction } from '../actions';

export const dynamic = 'force-dynamic';

// Slice 10a — Property step.

export default function OnboardingPropertyPage() {
  return (
    <OnboardingShell
      step="property"
      title="La prima struttura"
      subtitle="Aggiungi il primo appartamento. Penso io a tutto il resto: messaggi, recensioni, ospiti."
    >
      <form action={submitFirstPropertyAction} className="flex flex-col gap-5">
        <label className="flex flex-col gap-2">
          <span className="text-body-sm font-medium text-ink-soft">Nome della struttura</span>
          <input
            type="text"
            name="name"
            required
            minLength={2}
            maxLength={255}
            placeholder="La Goccia di S.Gennaro"
            className="h-12 rounded-card border border-line bg-paper px-4 text-body text-ink placeholder:text-ink-mute focus:border-terracotta-soft focus:outline-none focus:ring-2 focus:ring-terracotta-soft/40"
          />
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-body-sm font-medium text-ink-soft">Citta'</span>
          <input
            type="text"
            name="city"
            required
            minLength={2}
            maxLength={128}
            placeholder="Napoli"
            className="h-12 rounded-card border border-line bg-paper px-4 text-body text-ink placeholder:text-ink-mute focus:border-terracotta-soft focus:outline-none focus:ring-2 focus:ring-terracotta-soft/40"
          />
        </label>

        <p className="text-body-sm text-ink-mute">Aggiungi il calendario nello step successivo.</p>

        <button
          type="submit"
          className="mt-4 inline-flex h-12 w-full items-center justify-center rounded-full bg-terracotta px-6 text-body font-medium text-paper shadow-md transition-colors hover:bg-terracotta-2 active:translate-y-px"
        >
          Continua
        </button>
      </form>
    </OnboardingShell>
  );
}
