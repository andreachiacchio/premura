import { dayPhrase, formatDayMonth } from '@/lib/format-date';
import type { GuestMissingPhoneSoon } from '@/lib/repositories/home-summary';
import type { PossibleCancellation } from '@/lib/repositories/possible-cancellations';
import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { InlinePhoneFix } from './InlinePhoneFix';
import { PossibleCancellationActions } from './PossibleCancellationActions';

// Blocco 2 della home — "Serve una tua decisione".
//
// SOLO cio' che e' fermo in attesa dell'host, ogni voce con l'azione che
// la risolve. Vuoto = il blocco non si renderizza affatto (il silenzio
// e' l'informazione: non c'e' niente che aspetta te).
//
// Le vecchie card "check-in da configurare" e "prenotazioni da
// completare" confluiscono qui: erano decisioni in attesa travestite da
// categorie.

const ARRIVO_FMT = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric' });

/**
 * Bozza in attesa, resa come voce del blocco. La card (ReplyDraftCard,
 * client component con anteprima + approva/modifica/scarta inline) arriva
 * come ReactNode gia' costruito dalla pagina: questo componente resta
 * server-side e non importa niente di client.
 */
export type DecisionDraftItem = {
  key: string;
  /** "in attesa da 12 min" — calcolato server-side al render. */
  waitingLabel: string;
  card: React.ReactNode;
};

export type DecisionsData = {
  /**
   * Bozze dell'agente in attesa di ok. PRIME nella lista: in modalita'
   * bozza sono l'unica cosa tra un ospite che ha scritto e la risposta,
   * quindi ogni minuto di attesa e' un minuto di silenzio verso l'ospite.
   */
  draftItems: DecisionDraftItem[];
  /** Ospiti senza numero con arrivo entro 3 giorni — fix inline. */
  missingPhoneSoon: GuestMissingPhoneSoon[];
  /** Prenotazioni con dati incompleti (form nella lista sotto). */
  incompleteCount: number;
  /** Kit proposti in attesa di approvazione. */
  pendingKitsCount: number;
  /** Eventi iCal spariti da 2 poll riusciti: l'host conferma o smentisce. */
  possibleCancellations: PossibleCancellation[];
};

export function decisionsCount(d: DecisionsData): number {
  return (
    d.draftItems.length +
    d.missingPhoneSoon.length +
    (d.incompleteCount > 0 ? 1 : 0) +
    (d.pendingKitsCount > 0 ? 1 : 0) +
    d.possibleCancellations.length
  );
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

function groupMissingPhoneByProperty(
  guests: GuestMissingPhoneSoon[],
): Array<[string, GuestMissingPhoneSoon[]]> {
  const groups = new Map<string, GuestMissingPhoneSoon[]>();
  for (const g of guests) {
    const list = groups.get(g.propertyName) ?? [];
    list.push(g);
    groups.set(g.propertyName, list);
  }
  return [...groups.entries()];
}

function Item({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <li className="flex flex-col gap-2 border-t border-line-soft px-4 py-3 first:border-t-0 sm:flex-row sm:items-center sm:justify-between">
      {children}
    </li>
  );
}

export function DecisionsBlock({
  data,
  now = new Date(),
}: {
  data: DecisionsData;
  now?: Date;
}): React.JSX.Element | null {
  const total = decisionsCount(data);
  if (total === 0) return null;

  return (
    <section aria-label="Serve una tua decisione" className="mx-5 mt-5 md:mx-0">
      <div className="overflow-hidden rounded-card border border-terracotta-soft bg-paper shadow-sm">
        <header className="bg-gradient-to-br from-peach to-peach-deep px-4 py-4">
          <h2 className="font-serif text-[24px] font-medium leading-tight text-terracotta-2">
            Serve una tua decisione
          </h2>
        </header>
        <ul>
          {data.draftItems.map((d) => (
            <li key={d.key} className="border-t border-line-soft px-4 py-3 first:border-t-0">
              <p className="mb-2 text-body-sm font-medium text-terracotta-2">
                Risposta pronta · {d.waitingLabel}
              </p>
              {d.card}
            </li>
          ))}

          {/* Possibili cancellazioni PRIMA di tutto il resto tranne le
              bozze: rischio concreto di preparare kit e pulizie per
              ospiti che hanno disdetto (30/07). */}
          {data.possibleCancellations.map((c) => (
            <Item key={c.bookingId}>
              <p className="text-body text-ink">
                <span className="font-medium text-alert">Possibile cancellazione:</span>{' '}
                <span className="font-medium">{c.guestFirstName ?? c.guestFullName}</span> ·{' '}
                {c.propertyName} · {formatDayMonth(c.checkinAt)} – {formatDayMonth(c.checkoutAt)} —
                il calendario {c.platform === 'booking' ? 'Booking' : 'Airbnb'} non la mostra più
                da 2 controlli (arrivo {dayPhrase(c.checkinAt, now)}). Verifica sull'extranet.
              </p>
              <PossibleCancellationActions
                bookingId={c.bookingId}
                guestLabel={c.guestFirstName ?? c.guestFullName}
              />
            </Item>
          ))}

          {groupMissingPhoneByProperty(data.missingPhoneSoon).map(([propertyName, guests]) => (
            <li key={propertyName}>
              {/* Raggruppamento per struttura (30/07): intestazione sticky
                  mentre si scorre, le righe sotto parlano dei suoi ospiti. */}
              <p className="sticky top-0 z-10 border-t border-line-soft bg-paper/95 px-4 py-1.5 text-[12px] font-semibold uppercase tracking-[0.1em] text-ink-mute backdrop-blur-sm">
                {propertyName}
              </p>
              <ul>
                {guests.map((g) => (
                  <Item key={g.bookingId}>
                    <p className="text-body text-ink">
                      <span className="font-medium">{g.guestFirstName ?? g.guestFullName}</span>{' '}
                      {arrivalPhrase(g.checkinAt, now)} e non ha un numero WhatsApp
                    </p>
                    <InlinePhoneFix
                      bookingId={g.bookingId}
                      guestName={g.guestFirstName ?? g.guestFullName}
                    />
                  </Item>
                ))}
              </ul>
            </li>
          ))}

          {data.pendingKitsCount > 0 ? (
            <Item>
              <p className="text-body text-ink">
                <span className="font-medium">
                  {data.pendingKitsCount} kit{' '}
                  {data.pendingKitsCount === 1 ? 'proposto' : 'proposti'}
                </span>{' '}
                — da approvare prima dell'ordine
              </p>
              <Link
                href="/dashboard/kits"
                className="inline-flex items-center gap-1 text-body-sm font-medium text-terracotta-2 hover:underline"
              >
                Guarda le proposte
                <ChevronRight aria-hidden className="size-4" />
              </Link>
            </Item>
          ) : null}

          {data.incompleteCount > 0 ? (
            <Item>
              <p className="text-body text-ink">
                <span className="font-medium">
                  {data.incompleteCount}{' '}
                  {data.incompleteCount === 1 ? 'prenotazione' : 'prenotazioni'} da completare
                </span>{' '}
                — Booking non ci ha dato nome o contatti dell'ospite
              </p>
              <a
                href="#prenotazioni"
                className="inline-flex items-center gap-1 text-body-sm font-medium text-terracotta-2 hover:underline"
              >
                Completa qui sotto
                <ChevronRight aria-hidden className="size-4" />
              </a>
            </Item>
          ) : null}
        </ul>
      </div>
    </section>
  );
}
