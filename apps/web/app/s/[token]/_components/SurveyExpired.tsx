// Slice B — Survey link scaduto.
// Niente personalizzazione (non abbiamo loaded il survey): testo generico.

export function SurveyExpired(): React.JSX.Element {
  return (
    <main className="mx-auto min-h-screen w-full max-w-md bg-ivory px-5 pt-12 pb-16">
      <header className="text-center">
        <span className="font-serif text-body-sm text-terracotta-2">Premura</span>
      </header>
      <div className="mt-12 rounded-card border border-line-soft bg-paper px-5 py-10 text-center shadow-sm">
        <p className="text-5xl" aria-hidden>
          ⏰
        </p>
        <h1 className="mt-4 font-serif text-h2 leading-tight text-ink">Il link e scaduto.</h1>
        <p className="mt-3 text-body text-ink-soft">
          Contatta direttamente l'host per qualunque informazione sul tuo soggiorno. Grazie!
        </p>
      </div>
    </main>
  );
}
