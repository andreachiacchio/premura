import { OnboardingShell } from '../_components/OnboardingShell';
import { completeOnboardingAction } from '../actions';

export const dynamic = 'force-dynamic';

// Slice 10a — WhatsApp step. Placeholder informativo: il numero
// dedicato lo provisioniamo a mano via Meta per host #2+ (vedi
// docs/META-WEBHOOK-SETUP.md). Andrea pilot ha gia' setup completo.

export default function OnboardingWhatsappPage() {
  return (
    <OnboardingShell
      step="whatsapp"
      title="WhatsApp ti aspetta"
      subtitle="Per parlare con i tuoi ospiti uso un numero dedicato della tua struttura. Lo prepariamo insieme nei prossimi giorni."
    >
      <div className="flex flex-col gap-5">
        <div className="rounded-card border border-terracotta-soft bg-gradient-to-br from-peach to-peach-deep px-5 py-5">
          <p className="font-serif text-h4 text-ink">Il provisioning lo facciamo noi</p>
          <p className="mt-2 text-body-sm leading-relaxed text-ink-soft">
            Ti scrivo via email per dedicarti il numero WhatsApp Business della tua struttura.
            Tempi: 5–10 giorni lavorativi (Meta deve approvarlo).
          </p>
          <p className="mt-3 text-body-sm leading-relaxed text-ink-soft">
            Nel frattempo raccolgo gia' le notifiche email dei tuoi ospiti e te le mostro qui.
          </p>
        </div>

        <form action={completeOnboardingAction}>
          <button
            type="submit"
            className="inline-flex h-12 w-full items-center justify-center rounded-full bg-terracotta px-6 text-body font-medium text-paper shadow-md transition-colors hover:bg-terracotta-2 active:translate-y-px"
          >
            Va bene, vai alla dashboard
          </button>
        </form>
      </div>
    </OnboardingShell>
  );
}
