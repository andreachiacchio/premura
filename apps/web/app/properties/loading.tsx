// Skeleton del segmento /properties (05/08, ordine Andrea: "oggi
// cliccando Strutture il browser resta fermo sulla pagina vecchia
// senza alcun segnale").
//
// Le rotte sono force-dynamic: il prefetch dei <Link> non porta dati,
// quindi senza questo boundary la navigazione blocca fino alla
// risposta del server. Un solo file copre tutto il segmento —
// /properties, /properties/new e le tre sottopagine di
// [propertyId] — come app/dashboard/loading.tsx fa per la dashboard.
//
// Container e forma delle card ricalcano app/properties/page.tsx: lo
// scheletro deve occupare lo stesso spazio del contenuto vero, o al
// posto del flash bianco si ottiene un salto.

export default function PropertiesLoading(): React.JSX.Element {
  return (
    <main className="mx-auto min-h-screen w-full max-w-md bg-ivory px-5 pt-10 pb-16 lg:max-w-5xl xl:max-w-[1400px]">
      <header className="mb-6 flex items-center justify-between">
        <div className="w-full">
          <div className="h-10 w-1/2 rounded bg-line-soft animate-pulse" />
          <div className="mt-2 h-4 w-3/4 rounded bg-line-soft animate-pulse" />
        </div>
      </header>

      <div className="mb-6 h-11 w-52 rounded-full bg-line-soft animate-pulse" />

      <ul className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:items-start xl:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <li
            key={i}
            className="rounded-card border border-line bg-paper p-4 shadow-sm"
            aria-hidden
          >
            <div className="h-5 w-2/3 rounded bg-line-soft animate-pulse" />
            <div className="mt-2 h-4 w-1/3 rounded bg-line-soft animate-pulse" />
            <div className="mt-4 h-4 w-1/2 rounded bg-line-soft animate-pulse" />
          </li>
        ))}
      </ul>
    </main>
  );
}
