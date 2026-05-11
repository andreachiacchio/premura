import { OnboardingShell } from '../_components/OnboardingShell';
import { skipToNextStepAction, submitKnowledgeAction } from '../actions';

export const dynamic = 'force-dynamic';

// Slice H — Knowledge essentials (sintetico). UI dettagliata vive
// in /properties/[id]/knowledge (slice G).

const TIP_CATEGORIES: Array<{ value: string; label: string }> = [
  { value: 'pasticceria', label: 'Pasticceria' },
  { value: 'ristorante', label: 'Ristorante' },
  { value: 'bar', label: 'Bar / Caffetteria' },
  { value: 'panorama', label: 'Panorama' },
  { value: 'shopping', label: 'Shopping' },
  { value: 'farmacia', label: 'Farmacia' },
  { value: 'altro', label: 'Altro' },
];

export default function OnboardingKnowledgePage() {
  const skip = skipToNextStepAction.bind(null, 'knowledge');

  return (
    <OnboardingShell
      step="knowledge"
      title="Conosci la tua casa, conosceremo i tuoi guest"
      subtitle="Più dettagli, più Premura saprà personalizzare l'esperienza. Compila l'essenziale, il resto lo aggiungi dopo dalla dashboard."
    >
      <form action={submitKnowledgeAction} className="flex flex-col gap-5">
        <fieldset className="flex flex-col gap-3">
          <legend className="text-body-sm font-medium text-ink-soft">WiFi</legend>
          <label className="flex flex-col gap-1">
            <span className="text-body-sm text-ink-mute">Nome rete</span>
            <input
              type="text"
              name="wifiSsid"
              maxLength={80}
              placeholder="LaGocciaWiFi"
              className="h-11 rounded-card border border-line bg-paper px-3 text-body text-ink focus:border-terracotta-soft focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-body-sm text-ink-mute">Password</span>
            <input
              type="text"
              name="wifiPassword"
              maxLength={80}
              placeholder="••••••••"
              className="h-11 rounded-card border border-line bg-paper px-3 text-body text-ink focus:border-terracotta-soft focus:outline-none"
            />
          </label>
        </fieldset>

        <fieldset className="flex flex-col gap-3">
          <legend className="text-body-sm font-medium text-ink-soft">Check-in (keybox)</legend>
          <label className="flex flex-col gap-1">
            <span className="text-body-sm text-ink-mute">Codice</span>
            <input
              type="text"
              name="keyboxCode"
              maxLength={40}
              placeholder="1234"
              className="h-11 rounded-card border border-line bg-paper px-3 text-body text-ink focus:border-terracotta-soft focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-body-sm text-ink-mute">Come trovarla</span>
            <textarea
              name="keyboxInstructions"
              maxLength={500}
              rows={2}
              placeholder="Sopra al campanello, lato sinistro del portone."
              className="rounded-card border border-line bg-paper px-3 py-2 text-body text-ink focus:border-terracotta-soft focus:outline-none"
            />
          </label>
        </fieldset>

        <fieldset className="flex flex-col gap-3">
          <legend className="text-body-sm font-medium text-ink-soft">
            3 posti consigliati nelle vicinanze
          </legend>
          {[1, 2, 3].map((n) => (
            <div key={n} className="grid grid-cols-3 gap-2">
              <select
                name={`tipCategory${n}`}
                defaultValue="altro"
                className="col-span-1 h-10 rounded-card border border-line bg-paper px-2 text-body-sm text-ink focus:border-terracotta-soft focus:outline-none"
              >
                {TIP_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
              <input
                type="text"
                name={`tipName${n}`}
                maxLength={100}
                placeholder={`Posto ${n}`}
                className="col-span-2 h-10 rounded-card border border-line bg-paper px-3 text-body-sm text-ink focus:border-terracotta-soft focus:outline-none"
              />
            </div>
          ))}
        </fieldset>

        <button
          type="submit"
          className="mt-2 inline-flex h-12 w-full items-center justify-center rounded-full bg-terracotta px-6 text-body font-medium text-paper shadow-md transition-colors hover:bg-terracotta-2 active:translate-y-px"
        >
          Continua
        </button>
      </form>

      <form action={skip} className="mt-4">
        <button
          type="submit"
          className="text-body-sm text-ink-mute underline-offset-2 hover:underline"
        >
          Compilo dopo da dashboard
        </button>
      </form>
    </OnboardingShell>
  );
}
