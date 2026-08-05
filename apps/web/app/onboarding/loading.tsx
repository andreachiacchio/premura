// Skeleton del segmento /onboarding (05/08).
//
// Qui il boundary pesa piu' che altrove: ogni step chiude con un
// redirect() verso lo step successivo (actions.ts), e senza loading
// ogni passaggio del wizard e' un flash bianco. E' il primo percorso
// che un host nuovo vede: la prima impressione del prodotto si gioca
// su queste cinque transizioni.
//
// Un solo file copre tutte e 7 le rotte del segmento. Container
// allineato a OnboardingShell.

export default function OnboardingLoading(): React.JSX.Element {
  return (
    <main className="mx-auto min-h-screen w-full max-w-md bg-ivory px-5 pt-12 pb-10">
      {/* Stepper: quattro tacche */}
      <div className="flex gap-2" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-1.5 flex-1 rounded-full bg-line-soft animate-pulse" />
        ))}
      </div>

      <header className="mt-10">
        <div className="h-10 w-4/5 rounded bg-line-soft animate-pulse" />
        <div className="mt-4 h-5 w-full rounded bg-line-soft animate-pulse" />
        <div className="mt-2 h-5 w-2/3 rounded bg-line-soft animate-pulse" />
      </header>

      <section className="mt-8 flex flex-col gap-4">
        <div className="h-12 w-full rounded-card border border-line-soft bg-paper animate-pulse" />
        <div className="h-12 w-full rounded-card border border-line-soft bg-paper animate-pulse" />
        <div className="mt-2 h-12 w-full rounded-full bg-line-soft animate-pulse" />
      </section>
    </main>
  );
}
