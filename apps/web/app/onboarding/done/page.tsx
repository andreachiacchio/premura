import { DoneRedirect } from './_components/DoneRedirect';

export const dynamic = 'force-dynamic';

// Slice H — Done step. Auto-redirect a /dashboard dopo 3 secondi.
// Niente Stepper qui (siamo "fuori" dal flusso): pagina celebrativa.

export default function OnboardingDonePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center bg-ivory px-5 py-10 text-center">
      <div className="text-6xl" aria-hidden>
        🎉
      </div>
      <h1 className="mt-6 font-serif text-h1 leading-tight tracking-tight text-ink">
        Premura è pronta
      </h1>
      <p className="mt-4 max-w-sm text-body-lg text-ink-soft">
        Il tuo prossimo check-in apparirà appena arriva via calendario. Da ora in poi facciamo tutto
        noi.
      </p>
      <DoneRedirect />
    </main>
  );
}
