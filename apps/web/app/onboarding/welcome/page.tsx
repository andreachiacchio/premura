import { OnboardingShell } from '../_components/OnboardingShell';
import { submitWelcomeAction } from '../actions';

export const dynamic = 'force-dynamic';

export default function OnboardingWelcomePage() {
  return (
    <OnboardingShell
      step="welcome"
      title="Benvenuto in Premura"
      subtitle="Iniziamo con i tuoi dati. Bastano 2 minuti."
    >
      <form action={submitWelcomeAction} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-body-sm font-medium text-blu-deep">Come ti chiami?</span>
          <input
            type="text"
            name="fullName"
            required
            minLength={2}
            maxLength={255}
            placeholder="Andrea Chiacchio"
            className="rounded-input border border-blu-deep/20 bg-white px-3 py-2.5 font-inter text-[15px] text-blu-deep focus:border-terracotta focus:outline-none focus:ring-2 focus:ring-terracotta/20"
          />
        </label>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-body-sm font-medium text-blu-deep">Lingua dell'app</legend>
          <label className="flex items-center gap-2.5 rounded-card border border-blu-deep/15 bg-white px-3.5 py-2.5 cursor-pointer hover:bg-peach/30">
            <input type="radio" name="locale" value="it-IT" defaultChecked />
            <span className="text-[15px] text-blu-deep">Italiano</span>
          </label>
          <label className="flex items-center gap-2.5 rounded-card border border-blu-deep/15 bg-white px-3.5 py-2.5 cursor-pointer hover:bg-peach/30">
            <input type="radio" name="locale" value="en-US" />
            <span className="text-[15px] text-blu-deep">English</span>
          </label>
        </fieldset>

        <button
          type="submit"
          className="mt-4 w-full rounded-button bg-terracotta px-4 py-3 font-semibold text-ivory transition-opacity hover:opacity-90"
        >
          Continua
        </button>
      </form>
    </OnboardingShell>
  );
}
