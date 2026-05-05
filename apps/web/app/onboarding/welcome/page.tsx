import { OnboardingShell } from '../_components/OnboardingShell';
import { submitWelcomeAction } from '../actions';

export const dynamic = 'force-dynamic';

// Slice 10a — Welcome step. Identita' Premura: serif Fraunces per
// headline, body Inter, palette ivory/ink/terracotta.

export default function OnboardingWelcomePage() {
  return (
    <OnboardingShell
      step="welcome"
      title="Benvenuto. Iniziamo."
      subtitle="Mi presento per bene tra qualche minuto. Prima ho bisogno di sapere come ti chiamo."
    >
      <form action={submitWelcomeAction} className="flex flex-col gap-6">
        <label className="flex flex-col gap-2">
          <span className="text-body-sm font-medium text-ink-soft">Il tuo nome</span>
          <input
            type="text"
            name="fullName"
            required
            minLength={2}
            maxLength={255}
            placeholder="Andrea Chiacchio"
            className="h-12 rounded-card border border-line bg-paper px-4 text-body text-ink placeholder:text-ink-mute focus:border-terracotta-soft focus:outline-none focus:ring-2 focus:ring-terracotta-soft/40"
          />
        </label>

        <fieldset className="flex flex-col gap-2.5">
          <legend className="text-body-sm font-medium text-ink-soft">La lingua dell'app</legend>
          <label className="flex items-center gap-3 rounded-card border border-line bg-paper px-4 py-3 cursor-pointer transition-colors hover:border-terracotta-soft has-[:checked]:border-terracotta has-[:checked]:bg-paper-deep">
            <input
              type="radio"
              name="locale"
              value="it-IT"
              defaultChecked
              className="size-4 accent-terracotta"
            />
            <span className="text-body text-ink">Italiano</span>
          </label>
          <label className="flex items-center gap-3 rounded-card border border-line bg-paper px-4 py-3 cursor-pointer transition-colors hover:border-terracotta-soft has-[:checked]:border-terracotta has-[:checked]:bg-paper-deep">
            <input type="radio" name="locale" value="en-US" className="size-4 accent-terracotta" />
            <span className="text-body text-ink">English</span>
          </label>
        </fieldset>

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
