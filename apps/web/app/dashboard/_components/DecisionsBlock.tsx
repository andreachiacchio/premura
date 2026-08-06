import { dayPhrase, formatDayMonth } from '@/lib/format-date';
import type { GuestMissingPhoneSoon } from '@/lib/repositories/home-summary';
import type { PossibleCancellation } from '@/lib/repositories/possible-cancellations';
import { countOpenDecisions } from '@/lib/repositories/open-decisions';
import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { DecisionCard } from './DecisionCard';
import { InlinePhoneFix } from './InlinePhoneFix';
import { PossibleCancellationActions } from './PossibleCancellationActions';

// "Serve una tua decisione" — la risposta alla domanda della dashboard.
//
// SOLO cio' che e' fermo in attesa dell'host, ogni voce con l'azione che
// la risolve. Vuoto = il blocco non si renderizza affatto. Il silenzio
// e' l'informazione: non c'e' niente che aspetta te, e non serve una
// riga che lo dica — una riga che dice "tutto ok" e' esattamente la
// bugia che abbiamo tolto dalla agent card.
//
// Ogni voce e' una DecisionCard: titolo su una riga, corpo su due, il
// resto dietro "Dettagli".

const ARRIVO_FMT = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric' });

/**
 * Bozza in attesa. La card (ReplyDraftCard, client component con
 * anteprima e azioni inline) arriva come ReactNode gia' costruito dalla
 * pagina: questo componente resta server-side.
 */
export type DecisionDraftItem = {
  key: string;
  /** "in attesa da 12 min" — calcolato server-side al render. */
  waitingLabel: string;
  guestLabel: string;
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
  /** Prenotazioni con dati incompleti (schermata a lista dedicata). */
  incompleteCount: number;
  /** Kit proposti in attesa di approvazione. */
  pendingKitsCount: number;
  /** Eventi iCal spariti da 2 poll riusciti: l'host conferma o smentisce. */
  possibleCancellations: PossibleCancellation[];
};

/** Stessa definizione del badge in navigazione: mai due conteggi. */
export function decisionsCount(d: DecisionsData): number {
  return countOpenDecisions({
    replyDrafts: d.draftItems,
    missingPhoneSoon: d.missingPhoneSoon,
    possibleCancellations: d.possibleCancellations,
    incompleteCount: d.incompleteCount,
    pendingKitsCount: d.pendingKitsCount,
  });
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
  if (decisionsCount(data) === 0) return null;

  return (
    <section aria-label="Serve una tua decisione">
      <h2 className="mb-3 font-serif text-h4 leading-tight text-ink">Serve una tua decisione</h2>
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

        {/* Possibili cancellazioni subito dopo le bozze: rischio
            concreto di preparare kit e pulizie per ospiti che hanno
            disdetto (30/07). */}
        {data.possibleCancellations.map((c) => (
          <DecisionCard
            key={c.bookingId}
            kind="cancellation"
            title={`${c.guestFirstName ?? c.guestFullName} · ${c.propertyName}`}
            body={`Il calendario ${c.platform === 'booking' ? 'Booking' : 'Airbnb'} non la mostra più da 2 controlli.`}
            details={
              <p>
                {formatDayMonth(c.checkinAt)} – {formatDayMonth(c.checkoutAt)}, arrivo{' '}
                {dayPhrase(c.checkinAt, now)}. Verifica sull'extranet prima di confermare: se la
                confermi cancellata, Premura smette di seguirla.
              </p>
            }
            actions={
              <PossibleCancellationActions
                bookingId={c.bookingId}
                guestLabel={c.guestFirstName ?? c.guestFullName}
              />
            }
          />
        ))}

        {data.missingPhoneSoon.map((g) => (
          <DecisionCard
            key={g.bookingId}
            kind="phone"
            title={`${g.guestFirstName ?? g.guestFullName} · ${g.propertyName}`}
            body={`${arrivalPhrase(g.checkinAt, now)} e non ha un numero WhatsApp.`}
            details={
              <p>
                Senza numero non posso mandare il benvenuto né rispondere se scrive. Puoi
                inserirlo qui: da quel momento me ne occupo io.
              </p>
            }
            actions={
              <InlinePhoneFix
                bookingId={g.bookingId}
                guestName={g.guestFirstName ?? g.guestFullName}
              />
            }
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
      </div>
    </section>
  );
}
