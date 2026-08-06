import { dayPhrase } from '@/lib/format-date';
import { displayGuestName, hasRealGuestName } from '@/lib/guest-name';
import { propertyColorOrFallback } from '@/lib/property-color';
import type { HomeGuestRow } from '@/lib/repositories/home-guests';
import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { EmptyState } from './EmptyState';

/** Oltre tre, la lista smette di essere una risposta e diventa un elenco. */
const MAX_ARRIVING = 3;

// "Chi e' in casa" + "Chi arriva" — card compatte con iniziale, nome,
// struttura, frase di stato, pallino verde per chi e' in casa, badge
// Attivo / Manca numero per chi arriva.
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
        {/* La struttura e' un'etichetta: puo' restare piccola e colorata.
            La frase sotto invece e' l'informazione operativa — "arriva
            domani", "in casa da due notti" — e va letta, quindi 15px e
            un grigio leggibile. Il grigio chiaro resta ai metadati. */}
        <p className="truncate text-[12px]" style={{ color }}>
          {row.propertyName}
        </p>
        <p className="text-body text-ink-soft">
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
  calendarRead = false,
  maxArriving = MAX_ARRIVING,
}: {
  inHouse: HomeGuestRow[];
  arriving: HomeGuestRow[];
  now: Date;
  /**
   * Almeno un calendario e' stato letto davvero. Serve allo stato
   * vuoto: "nessun arrivo" e "nessun arrivo, e il calendario e'
   * aggiornato" sono due affermazioni diverse, e la seconda si puo'
   * fare solo dopo aver guardato.
   */
  calendarRead?: boolean;
  maxArriving?: number;
}): React.JSX.Element {
  // 06/08: prima era `hidden md:flex` — su mobile "chi e' in casa" non
  // si vedeva affatto, ed era la sezione che risponde alla domanda
  // della dashboard. Con una colonna sola vale a ogni larghezza.
  const shown = arriving.slice(0, maxArriving);
  const hiddenCount = arriving.length - shown.length;

  return (
    <div className="flex flex-col gap-6">
      <section aria-label="Chi è in casa">
        <h2 className="mb-2 text-eyebrow uppercase tracking-wider text-ok">
          Chi è in casa{inHouse.length > 0 ? ` · ${inHouse.length}` : ''}
        </h2>
        {inHouse.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {inHouse.map((r) => (
              <GuestCard key={r.id} row={r} now={now} inHouse={true} />
            ))}
          </ul>
        ) : (
          <EmptyState>Nessuno in casa stanotte.</EmptyState>
        )}
      </section>

      <section aria-label="Chi arriva">
        <h2 className="mb-2 text-eyebrow uppercase tracking-wider text-ink-mute">
          Chi arriva · prossimi 7 giorni{arriving.length > 0 ? ` · ${arriving.length}` : ''}
        </h2>
        {arriving.length > 0 ? (
          <>
            <ul className="flex flex-col gap-2">
              {shown.map((r) => (
                <GuestCard key={r.id} row={r} now={now} inHouse={false} />
              ))}
            </ul>
            {hiddenCount > 0 ? (
              <Link
                href="/dashboard/upcoming-checkins"
                className="mt-2 inline-flex min-h-[44px] items-center gap-1 text-body font-medium text-terracotta-2 hover:underline"
              >
                Vedi tutti ({arriving.length})
                <ChevronRight aria-hidden className="size-4" />
              </Link>
            ) : null}
          </>
        ) : (
          // "Il calendario e' aggiornato" si puo' dire solo dopo averlo
          // letto: senza questa condizione sarebbe la stessa calma finta
          // che abbiamo tolto dalla agent card.
          <EmptyState>
            Nessun arrivo in programma.{calendarRead ? ' Il calendario è aggiornato.' : ''}
          </EmptyState>
        )}
      </section>
    </div>
  );
}
