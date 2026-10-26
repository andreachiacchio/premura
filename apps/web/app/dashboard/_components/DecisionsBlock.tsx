import { formatDayMonth } from '@/lib/format-date';
import type { GuestMissingPhoneSoon } from '@/lib/repositories/home-summary';
import { countOpenDecisions } from '@/lib/repositories/open-decisions';
import {
  CALENDAR_REMOVALS_WINDOW_DAYS,
  type CalendarRemoval,
} from '@/lib/repositories/possible-cancellations';
import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { CalendarRemovals } from './CalendarRemovals';
import { CopyInboxPhrase } from './CopyInboxPhrase';
import { DecisionCard } from './DecisionCard';
import { InlinePhoneFix } from './InlinePhoneFix';

const ARRIVO_FMT = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric' });

export type DecisionDraftItem = {
  key: string;
  waitingLabel: string;
  guestLabel: string;
  card: React.ReactNode;
};

export type DecisionsData = {
  draftItems: DecisionDraftItem[];
  missingPhoneSoon: GuestMissingPhoneSoon[];
  incompleteCount: number;
  pendingKitsCount: number;
  /** Fuori dal conteggio: le ha gia' decise Premura (26/10). */
  calendarRemovals: CalendarRemoval[];
};

export function decisionsCount(d: DecisionsData): number {
  return countOpenDecisions({
    replyDrafts: d.draftItems,
    missingPhoneSoon: d.missingPhoneSoon,
    incompleteCount: d.incompleteCount,
    pendingKitsCount: d.pendingKitsCount,
  });
}

/**
 * La frase della riga chiusa. Numero e piattaforma vengono dalle stesse
 * righe che la riga apre: mai "Booking" se le ha tolte Airbnb.
 * Le righe arrivano solo da feed iCal, quindi la piattaforma e' una
 * delle due.
 *
 * Il soggetto e' Premura (26/10): la finestra conta le SUE
 * cancellazioni, non quando il feed ha tolto la riga. "Booking ha tolto
 * N negli ultimi 30 giorni" sarebbe falso per una riga sparita ad agosto
 * e cancellata oggi. La data in cui l'ha tolta il feed sta su ogni riga.
 */
export function calendarRemovalsHeadline(items: CalendarRemoval[]): string {
  const names = [...new Set(items.map((i) => (i.platform === 'airbnb' ? 'Airbnb' : 'Booking')))];
  const source = names.length === 1 ? names[0] : 'Booking e Airbnb';
  const n = items.length;
  const what = n === 1 ? 'prenotazione sparita' : 'prenotazioni sparite';
  return `Negli ultimi ${CALENDAR_REMOVALS_WINDOW_DAYS} giorni ho tolto ${n} ${what} dal calendario di ${source}`;
}

function arrivalPhrase(checkinAt: Date, now: Date): string {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const day = new Date(checkinAt);
  day.setHours(0, 0, 0, 0);
  const diff = Math.round((day.getTime() - startOfToday.getTime()) / 86_400_000);
  if (diff <= 0) return 'arriva oggi';
  if (diff === 1) return 'arriva domani';
  return `arriva ${ARRIVO_FMT.format(checkinAt)}`;
}

const linkClass =
  'inline-flex min-h-[44px] w-full items-center justify-center gap-1 rounded-full border border-terracotta-soft px-4 text-body font-medium text-terracotta-2 hover:bg-peach sm:w-auto';

export function DecisionsBlock({
  data,
  now = new Date(),
}: {
  data: DecisionsData;
  now?: Date;
}): React.JSX.Element | null {
  const count = decisionsCount(data);
  const removals = data.calendarRemovals;
  if (count === 0 && removals.length === 0) return null;

  // Il titolo c'e' solo se qualcosa aspetta davvero l'host: le
  // prenotazioni tolte da sole non sono una decisione, e "Serve una tua
  // decisione" sopra una riga che non chiede niente sarebbe falso.
  return (
    <section aria-label={count > 0 ? 'Serve una tua decisione' : 'Tolte dal calendario'}>
      {count > 0 ? (
        <h2 className="mb-3 font-serif text-h4 leading-tight text-ink">Serve una tua decisione</h2>
      ) : null}
      <div className="flex flex-col gap-3">
        {data.draftItems.map((d) => (
          <DecisionCard
            key={d.key}
            kind="draft"
            title={`Risposta per ${d.guestLabel}`}
            body={d.waitingLabel}
            details={d.card}
          />
        ))}

        {data.missingPhoneSoon.map((g) => (
          <DecisionCard
            key={g.bookingId}
            kind="phone"
            title={`${g.guestFirstName ?? g.guestFullName} · ${g.propertyName}`}
            body={`${arrivalPhrase(g.checkinAt, now)}. Manca il WhatsApp: copia la frase e incollala nell'inbox.`}
            details={
              <div className="flex flex-col gap-3">
                <p>
                  L'ospite apre la guida e risponde col numero. Quando ce l'hai, scrivilo qui: da
                  quel momento me ne occupo io.
                </p>
                <InlinePhoneFix
                  bookingId={g.bookingId}
                  guestName={g.guestFirstName ?? g.guestFullName}
                />
              </div>
            }
            actions={<CopyInboxPhrase bookingId={g.bookingId} />}
          />
        ))}

        {data.pendingKitsCount > 0 ? (
          <DecisionCard
            kind="kit"
            title={`${data.pendingKitsCount} kit ${data.pendingKitsCount === 1 ? 'proposto' : 'proposti'}`}
            body="Da approvare prima che parta l'ordine."
            actions={
              <Link href="/dashboard/kits" className={linkClass}>
                Guarda le proposte
                <ChevronRight aria-hidden className="size-4" />
              </Link>
            }
          />
        ) : null}

        {data.incompleteCount > 0 ? (
          <DecisionCard
            kind="incomplete"
            title={`${data.incompleteCount} ${data.incompleteCount === 1 ? 'prenotazione' : 'prenotazioni'} da completare`}
            body="Booking non ci ha dato nome o contatti dell'ospite."
            actions={
              <Link href="/dashboard/da-completare" className={linkClass}>
                {data.incompleteCount === 1 ? 'Completala' : 'Completale tutte'}
                <ChevronRight aria-hidden className="size-4" />
              </Link>
            }
          />
        ) : null}

        {removals.length > 0 ? (
          <CalendarRemovals
            headline={calendarRemovalsHeadline(removals)}
            items={removals.map((r) => ({
              bookingId: r.bookingId,
              label: `${formatDayMonth(r.checkinAt, now)} – ${formatDayMonth(r.checkoutAt, now)} · ${r.propertyName}`,
              removedLabel: `tolta dal calendario il ${formatDayMonth(r.removedAt, now)}`,
            }))}
          />
        ) : null}
      </div>
    </section>
  );
}
