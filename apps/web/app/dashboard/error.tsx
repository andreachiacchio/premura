'use client';

import Link from 'next/link';
import { useEffect } from 'react';

// HOTFIX dashboard resilience: error boundary di /dashboard.
//
// Cattura qualunque exception sfuggita ai try/catch nelle query e
// presenta un fallback caldo invece del messaggio Next "Application
// error: a server-side exception has occurred". Logga su console
// browser-side + Vercel Edge logs (Next propaga digest).
//
// CONTEXT.md §5 tono: italiano caldo, "Premura sta lavorando".

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): React.JSX.Element {
  useEffect(() => {
    console.error('[dashboard/error] caught', error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center bg-ivory px-5 py-10 text-center">
      <div aria-hidden className="text-5xl">
        ☕
      </div>
      <h1 className="mt-6 font-serif text-h1 leading-tight tracking-tight text-ink">
        Stiamo riprendendo fiato.
      </h1>
      <p className="mt-4 max-w-sm text-body-lg text-ink-soft">
        Premura ha avuto un intoppo. Niente di grave: ricarica la pagina, di solito basta. Se
        continua, scrivimi e me ne occupo io.
      </p>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={() => reset()}
          className="inline-flex h-11 items-center justify-center rounded-full bg-terracotta px-5 text-body-sm font-medium text-paper shadow-sm transition-colors hover:bg-terracotta-2"
        >
          Riprova
        </button>
        <Link
          href="/dashboard"
          className="inline-flex h-11 items-center justify-center rounded-full border border-line bg-paper px-5 text-body-sm font-medium text-ink transition-colors hover:bg-paper-deep"
        >
          Vai alla dashboard
        </Link>
      </div>

      {error.digest ? (
        <p className="mt-8 text-body-sm text-ink-mute">
          Riferimento errore: <code className="font-mono">{error.digest}</code>
        </p>
      ) : null}

      <p className="mt-3 text-body-sm text-ink-mute">
        — Andrea, founder di Premura · andrea@premura.it
      </p>
    </main>
  );
}
