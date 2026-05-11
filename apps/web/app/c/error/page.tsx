// Slice D — Pagina errore magic link (token scaduto/invalido).

export default function CleanerErrorPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center bg-ivory px-5 py-10 text-center">
      <div className="text-5xl" aria-hidden>
        🔒
      </div>
      <h1 className="mt-6 font-serif text-h2 leading-tight tracking-tight text-ink">
        Link non valido
      </h1>
      <p className="mt-4 max-w-sm text-body text-ink-soft">
        Il link che hai usato è scaduto o non è più valido. Chiedi al tuo host di mandarti un nuovo
        accesso.
      </p>
    </main>
  );
}
