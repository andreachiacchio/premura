// Slice B — Survey gia' completata. Atterraggio cordiale per
// guest che riapre il link.

export function SurveyAlreadySubmitted({
  guestFirstName,
  hostName,
  propertyName,
  language,
}: {
  guestFirstName: string;
  hostName: string;
  propertyName: string;
  language: 'it' | 'en';
}): React.JSX.Element {
  const t = (it: string, en: string): string => (language === 'en' ? en : it);
  return (
    <main className="mx-auto min-h-screen w-full max-w-md bg-ivory px-5 pt-12 pb-16">
      <header className="text-center">
        <span className="font-serif text-body-sm text-terracotta-2">Premura</span>
        <p className="mt-0.5 text-eyebrow uppercase tracking-wider text-ink-mute">
          {hostName} · {propertyName}
        </p>
      </header>
      <div className="mt-10 rounded-card border border-line-soft bg-paper px-5 py-10 text-center shadow-sm">
        <p className="text-5xl" aria-hidden>
          🙏
        </p>
        <h1 className="mt-4 font-serif text-h2 leading-tight text-ink">
          {t(`Grazie ${guestFirstName}!`, `Thanks ${guestFirstName}!`)}
        </h1>
        <p className="mt-3 text-body text-ink-soft">
          {t(
            'Abbiamo gia le tue risposte. Stiamo preparando tutto.',
            'We already have your answers. Getting things ready.',
          )}
        </p>
      </div>
    </main>
  );
}
