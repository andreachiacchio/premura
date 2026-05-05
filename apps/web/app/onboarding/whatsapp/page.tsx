import { OnboardingShell } from '../_components/OnboardingShell';
import { completeOnboardingAction } from '../actions';

export const dynamic = 'force-dynamic';

export default function OnboardingWhatsappPage() {
  return (
    <OnboardingShell
      step="whatsapp"
      title="WhatsApp Business"
      subtitle="Premura usa WhatsApp Business per parlare con i tuoi ospiti. Per il setup serve un numero dedicato."
    >
      <div className="flex flex-col gap-4">
        <div className="rounded-card border border-terracotta-soft bg-gradient-to-br from-peach to-peach-deep px-4 py-3.5 text-blu-deep">
          <p className="font-fraunces text-[15px] font-semibold">Setup WhatsApp manuale</p>
          <p className="mt-1.5 text-body-sm leading-relaxed text-blu-deep/80">
            Per il pilot iniziale ti contatteremo via email per provisionare il numero WhatsApp
            Business dedicato della tua struttura. Tempi: 5-10 giorni lavorativi (Meta approval).
          </p>
          <p className="mt-2 text-body-sm leading-relaxed text-blu-deep/80">
            Nel frattempo, Premura raccoglie le notifiche email dei tuoi ospiti e ti mostra preview
            in dashboard.
          </p>
        </div>

        <form action={completeOnboardingAction}>
          <button
            type="submit"
            className="w-full rounded-button bg-terracotta px-4 py-3 font-semibold text-ivory transition-opacity hover:opacity-90"
          >
            Ho capito, vai alla dashboard
          </button>
        </form>
      </div>
    </OnboardingShell>
  );
}
