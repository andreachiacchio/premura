// Saluto della home dashboard. Calato sul prototipo riga 1222-1225:
// "Buongiorno, Andrea" in Fraunces 52px con il nome terracotta SOFT,
// sotto la data in italiano lunga.
//
// Slice 5: il nome e' hardcoded "Andrea" come da spec. Da slice 6 verra'
// derivato dal profilo Supabase Auth.

const DATE_FORMATTER = new Intl.DateTimeFormat("it-IT", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

function getGreeting(date: Date): string {
  const h = date.getHours();
  if (h < 12) return "Buongiorno";
  if (h < 18) return "Buon pomeriggio";
  return "Buonasera";
}

export function DashboardHeader({
  hostFirstName = "Andrea",
  now = new Date(),
}: {
  hostFirstName?: string;
  now?: Date;
}) {
  const greeting = getGreeting(now);
  const dateLabel = DATE_FORMATTER.format(now);

  return (
    <header className="px-5 pt-10 pb-6">
      <div className="flex items-start justify-between gap-3">
        <h1 className="font-serif text-[clamp(34px,7vw,52px)] leading-[1.05] tracking-[-0.025em] text-ink">
          {greeting},{" "}
          <em
            className="not-italic text-terracotta"
            style={{ fontVariationSettings: '"SOFT" 80' }}
          >
            {hostFirstName}
          </em>
        </h1>
        <form method="post" action="/auth/signout" className="mt-2 shrink-0">
          <button
            type="submit"
            className="text-body-sm text-ink-mute underline-offset-2 transition-colors hover:text-ink hover:underline"
          >
            Esci
          </button>
        </form>
      </div>
      <p className="mt-2 text-body-sm text-ink-mute capitalize">{dateLabel}</p>
    </header>
  );
}
