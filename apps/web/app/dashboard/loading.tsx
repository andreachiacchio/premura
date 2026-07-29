// HOTFIX dashboard resilience: loading skeleton.
// Render istantaneo durante prefetch / streaming server component.
// Keeps utente engaged invece di flash bianco.

export default function DashboardLoading(): React.JSX.Element {
  return (
    <main className="mx-auto min-h-screen w-full max-w-md bg-ivory lg:max-w-5xl xl:max-w-[1400px] xl:px-6">
      <header className="px-5 pt-10 pb-6">
        <div className="h-12 w-3/4 rounded bg-line-soft animate-pulse" />
        <div className="mt-3 h-4 w-1/3 rounded bg-line-soft animate-pulse" />
      </header>

      <div className="mx-5 flex flex-col gap-2.5 sm:flex-row">
        <div className="h-20 flex-1 rounded-card border border-line-soft bg-paper animate-pulse" />
        <div className="h-20 flex-1 rounded-card border border-line-soft bg-paper animate-pulse" />
        <div className="h-20 flex-1 rounded-card border border-line-soft bg-paper animate-pulse" />
      </div>

      <div className="px-5 pt-6">
        <div className="h-6 w-1/2 rounded bg-line-soft animate-pulse" />
        <div className="mt-3 flex flex-col gap-2.5">
          <div className="h-20 rounded-card border border-line-soft bg-paper animate-pulse" />
          <div className="h-20 rounded-card border border-line-soft bg-paper animate-pulse" />
        </div>
      </div>
    </main>
  );
}
