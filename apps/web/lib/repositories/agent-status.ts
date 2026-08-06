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

/** Stato dei calendari dell'host, letto da properties.ical_sources
 *  (il worker ci scrive lastCheckedAt / lastResult a ogni poll). */
export type CalendarState = {
  feedsTotali: number;
  /** Almeno un poll andato a buon fine. */
  feedsLetti: number;
  /** Ultimo poll fallito: l'host deve ricollegarlo. */
  feedsInErrore: number;
};

export async function getCalendarStateForHost(
  db: Database,
  hostId: string,
): Promise<CalendarState> {
  const rows = await db
    .select({ icalSources: properties.icalSources })
    .from(properties)
    .where(and(eq(properties.hostId, hostId), eq(properties.isActive, true)));

  let feedsTotali = 0;
  let feedsLetti = 0;
  let feedsInErrore = 0;
  for (const row of rows) {
    for (const feed of row.icalSources ?? []) {
      feedsTotali += 1;
      if (feed.lastResult === 'error') feedsInErrore += 1;
      else if (feed.lastOkAt) feedsLetti += 1;
    }
  }
  return { feedsTotali, feedsLetti, feedsInErrore };
}

/**
 * Regole in ordine di priorita':
 *  1. bozze in attesa -> e' l'unica cosa tra un ospite e la risposta
 *  2. calendario rotto -> l'host deve ricollegarlo, o non arriva nulla
 *  3. nessun calendario / mai letto -> lo stato vero della lettura
 *  4. prossimo arrivo attivo -> il benvenuto e' in preparazione
 *  5. altre cose che aspettano l'host -> col numero, mai una calma finta
 *  6. letto e niente da decidere -> la verita', senza inventare
 *
 * 05/08 (Andrea): "Tutto tranquillo" accanto a "SERVE TE: 1" e' una
 * contraddizione, e "tranquillo" quando il calendario non e' ancora
 * stato letto e' peggio: e' il momento in cui l'host conclude che il
 * prodotto non fa niente. Un solo punto di verita'.
 *
 * 06/08 (Andrea): la regola c'era ma aveva una scappatoia. needsYouCount
 * e calendars erano opzionali, e chi li ometteva ricadeva su una frase
 * di calma scelta a parte. Ora sono OBBLIGATORI: la frase non puo' che
 * derivare dagli stessi numeri che la card mostra, e chiamare questa
 * funzione senza quei numeri e' un errore di compilazione — non una
 * riga di calma silenziosamente sbagliata. La stringa "Tutto tranquillo"
 * non esiste piu': non c'e' nessuno stato in cui sia la risposta giusta.
 */
export function buildAgentStatus(input: {
  pendingDraftsCount: number;
  oldestDraftGuestName: string | null;
  nextArrival: NextArrival | null;
  /** Contatore "Serve te" della card: stessa fonte, mai due verita'. */
  needsYouCount: number;
  /** Stato reale della lettura: senza, non si puo' dire nulla sulla calma. */
  calendars: CalendarState;
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

  const cal = input.calendars;
  if (cal.feedsInErrore > 0) {
    return {
      action:
        cal.feedsInErrore === 1
          ? 'Un calendario non risponde più.'
          : `${cal.feedsInErrore} calendari non rispondono più.`,
      sub: 'Vanno ricollegati: finché sono fermi, le nuove date non arrivano.',
    };
  }
  if (cal.feedsTotali === 0) {
    return {
      action: 'Non ho ancora un calendario da leggere.',
      sub: 'Collega Airbnb o Booking: da lì arrivano gli ospiti.',
    };
  }
  if (cal.feedsLetti === 0) {
    return {
      action: 'Sto leggendo il tuo calendario…',
      sub: 'Ci vuole meno di un minuto: ricarica tra poco.',
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

  const needsYou = input.needsYouCount;
  if (needsYou > 0) {
    return {
      action:
        needsYou === 1
          ? 'C’è una cosa che aspetta te.'
          : `Ci sono ${needsYou} cose che aspettano te.`,
      sub: 'Le trovi qui sotto, una alla volta.',
    };
  }

  // Unico stato di calma possibile, e ci si arriva solo dopo aver
  // escluso tutto il resto: niente da decidere E almeno un calendario
  // letto davvero. "Adesso" perche' e' una fotografia, non una promessa.
  return {
    action: 'Niente da decidere adesso.',
    sub: 'Calendario letto, nessun arrivo in programma: appena entra una prenotazione me ne occupo io.',
  };
}
