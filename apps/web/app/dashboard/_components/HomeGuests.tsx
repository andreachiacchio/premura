import { dayPhrase } from '@/lib/format-date';
import { displayGuestName, hasRealGuestName } from '@/lib/guest-name';
import { propertyColorOrFallback } from '@/lib/property-color';
import type { HomeGuestRow } from '@/lib/repositories/home-guests';

// "Chi e' in casa" + "In arrivo" — home desktop (Andrea, 30/07 punto 1):
// card compatte con iniziale, nome, struttura, frase di stato, pallino
// verde per chi e' in casa, badge Attivo / Manca numero per chi arriva.
// Solo da md in su: su mobile gli ospiti restano compressi nei
// contatori dell'agent card, come nel prototipo.
//
// Il colore della struttura (properties.color) e' il bordo sinistro
// della card e l'avatar: riconoscere la struttura senza leggere.

/** "notte 2 di 3 · parte domani" — la voce del soggiorno in corso. */
export function stayPhrase(row: Pick<HomeGuestRow, 'checkinAt' | 'checkoutAt'>, now: Date): string {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const checkinDay = new Date(row.checkinAt);
  checkinDay.setHours(0, 0, 0, 0);
  const checkoutDay = new Date(row.checkoutAt);
  checkoutDay.setHours(0, 0, 0, 0);

  const totalNights = Math.max(
    1,
    Math.round((checkoutDay.getTime() - checkinDay.getTime()) / 86_400_000),
  );
  const currentNight = Math.min(
    totalNights,
    Math.max(1, Math.round((startOfToday.getTime() - checkinDay.getTime()) / 86_400_000) + 1),
  );
  return `notte ${currentNight} di ${totalNights} · parte ${dayPhrase(row.checkoutAt, now)}`;
}

/** "arriva sabato · 6 ospiti" — la voce dell'arrivo. */
export function arrivalPhrase(
  row: Pick<HomeGuestRow, 'checkinAt' | 'numGuests'>,
  now: Date,
): string {
  const guests = `${row.numGuests} ${row.numGuests === 1 ? 'ospite' : 'ospiti'}`;
  return `arriva ${dayPhrase(row.checkinAt, now)} · ${guests}`;
}

function GuestCard({
  row,
  now,
  inHouse,
}: {
  row: HomeGuestRow;
  now: Date;
  inHouse: boolean;
}): React.JSX.Element {
  const color = propertyColorOrFallback(row.propertyColor, row.propertyName);
  const name = displayGuestName(row.guestFullName, row.guestFirstName);
  const realName = hasRealGuestName(row.guestFullName);
  const missingPhone = !row.guestPhone;

  return (
    <li
      className="flex items-center gap-3 rounded-card border border-line-soft bg-paper px-3.5 py-2.5 shadow-sm"
      style={{ borderLeft: `3px solid ${color}` }}
    >
      <span
        aria-hidden
        className="grid size-9 shrink-0 place-items-center rounded-full font-serif text-[15px] font-medium text-paper"
        style={{ backgroundColor: color }}
      >
        {(realName ? name : row.propertyName).charAt(0).toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {inHouse ? (
            <span aria-hidden className="size-2 shrink-0 animate-pulse rounded-full bg-ok" />
          ) : null}
          <p className={`truncate text-body ${realName ? 'font-medium text-ink' : 'text-ink-soft'}`}>
            {name}
          </p>
          {!inHouse ? (
            <span
              className={`ml-auto shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                missingPhone ? 'bg-gold-soft text-gold-deep' : 'bg-line-soft text-ok'
              }`}
            >
              {missingPhone ? 'Manca numero' : 'Attivo'}
            </span>
          ) : null}
        </div>
        <p className="truncate text-[12px]" style={{ color }}>
          {row.propertyName}
        </p>
        <p className="text-[12px] text-ink-mute">
          {inHouse ? stayPhrase(row, now) : arrivalPhrase(row, now)}
        </p>
      </div>
    </li>
  );
}

export function HomeGuests({
  inHouse,
  arriving,
  now,
}: {
  inHouse: HomeGuestRow[];
  arriving: HomeGuestRow[];
  now: Date;
}): React.JSX.Element | null {
  if (inHouse.length === 0 && arriving.length === 0) return null;
  return (
    <div className="hidden flex-col gap-6 md:flex">
      {inHouse.length > 0 ? (
        <section aria-label="Chi è in casa">
          <h2 className="mb-2 text-eyebrow uppercase tracking-wider text-ok">
            Chi è in casa · {inHouse.length}
          </h2>
          <ul className="flex flex-col gap-2">
            {inHouse.map((r) => (
              <GuestCard key={r.id} row={r} now={now} inHouse={true} />
            ))}
          </ul>
        </section>
      ) : null}
      {arriving.length > 0 ? (
        <section aria-label="In arrivo">
          <h2 className="mb-2 text-eyebrow uppercase tracking-wider text-ink-mute">
            In arrivo · prossimi 7 giorni · {arriving.length}
          </h2>
          <ul className="flex flex-col gap-2">
            {arriving.map((r) => (
              <GuestCard key={r.id} row={r} now={now} inHouse={false} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
