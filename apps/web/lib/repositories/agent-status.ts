import { type Database, bookings, hosts, properties } from '@premura/db';
import { and, asc, eq, gte, isNotNull, ne } from 'drizzle-orm';

// Agent card — "la voce di Premura" (blocco 1, 30/07). Dice cosa sta
// facendo il sistema ADESSO, con regole deterministiche su dati veri:
// niente LLM, e quando non c'e' nulla in corso dice la verita'
// ("Tutto tranquillo"), mai attivita' inventate.

export type AgentStatus = {
  /** Frase principale in Fraunces ("Sto preparando l'arrivo di Julian, sabato."). */
  action: string;
  /** Riga secondaria, null se non serve. */
  sub: string | null;
};

const ARRIVO_FMT = new Intl.DateTimeFormat('it-IT', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'Europe/Rome',
});

export type NextArrival = {
  guestFirstName: string | null;
  guestFullName: string;
  propertyName: string;
  checkinAt: Date;
  welcomeTimeSlot: string | null;
};

/** Prossimo arrivo attivo (numero inserito, benvenuto in programma). */
export async function findNextActiveArrival(
  db: Database,
  hostId: string,
  now: Date = new Date(),
): Promise<NextArrival | null> {
  const [row] = await db
    .select({
      guestFirstName: bookings.guestFirstName,
      guestFullName: bookings.guestFullName,
      propertyName: properties.name,
      checkinAt: bookings.checkinAt,
      welcomeTimeSlot: hosts.welcomeTimeSlot,
    })
    .from(bookings)
    .innerJoin(properties, eq(properties.id, bookings.propertyId))
    .innerJoin(hosts, eq(hosts.id, properties.hostId))
    .where(
      and(
        eq(properties.hostId, hostId),
        ne(bookings.status, 'cancelled'),
        eq(bookings.isCalendarBlock, false),
        isNotNull(bookings.premuraActiveAt),
        gte(bookings.checkoutAt, now),
      ),
    )
    .orderBy(asc(bookings.checkinAt))
    .limit(1);
  return row ?? null;
}

/**
 * Regole in ordine di priorita':
 *  1. bozze in attesa -> e' l'unica cosa tra un ospite e la risposta
 *  2. prossimo arrivo attivo -> il benvenuto e' in preparazione
 *  3. niente in corso -> la verita', senza inventare
 */
export function buildAgentStatus(input: {
  pendingDraftsCount: number;
  oldestDraftGuestName: string | null;
  nextArrival: NextArrival | null;
  now?: Date;
}): AgentStatus {
  const now = input.now ?? new Date();

  if (input.pendingDraftsCount > 0) {
    const chi = input.oldestDraftGuestName ?? 'un ospite';
    return {
      action:
        input.pendingDraftsCount === 1
          ? `Ho pronta una risposta per ${chi} — serve il tuo via.`
          : `Ho pronte ${input.pendingDraftsCount} risposte — serve il tuo via.`,
      sub: 'La trovi qui sotto, con approva e modifica.',
    };
  }

  if (input.nextArrival) {
    const a = input.nextArrival;
    const nome = a.guestFirstName ?? a.guestFullName;
    const inCasa = a.checkinAt.getTime() <= now.getTime();
    if (inCasa) {
      return {
        action: `Seguo il soggiorno di ${nome} a ${a.propertyName}.`,
        sub: 'Se scrive, preparo la risposta e ti avviso su WhatsApp.',
      };
    }
    const giorno = ARRIVO_FMT.format(a.checkinAt);
    const slot = a.welcomeTimeSlot ?? '08:00';
    return {
      action: `Sto preparando l'arrivo di ${nome}, ${giorno}.`,
      sub: `Benvenuto in programma alle ${slot} del giorno di arrivo.`,
    };
  }

  return {
    action: 'Tutto tranquillo, nessuna azione in sospeso.',
    sub: null,
  };
}
