import {
  type Database,
  bookings,
  messages,
  outboundSends,
  properties,
  serviceInquiries,
  services,
} from '@premura/db';
import { and, desc, eq, gt, gte, isNotNull, lt, lte, ne, notInArray, sql } from 'drizzle-orm';

// Home riepilogo — query dei tre blocchi.
//
// Principio di prodotto (Andrea, 29/07): linguaggio da host, mai da
// sistema. Le righe del feed escono da qui gia' pronte da leggere
// ("Benvenuto WhatsApp a Julian · Villa Cristina"), non come codici
// evento da tradurre nella UI.
//
// Molti di questi numeri saranno a zero finche' il deploy del worker
// non porta in produzione scheduler e invii: le query sono scritte per
// dare zero/vuoto sensato, non per errore.

export type HomeMetrics = {
  /** Ospiti con soggiorno in corso in questo momento. */
  guestsInHouse: number;
  /** Ospiti con check-in nei prossimi 14 giorni. */
  guestsArriving: number;
  /** Extra venduti nel mese corrente (somma prezzi quotati). */
  extrasMonthEur: number;
  extrasMonthCount: number;
  /** Conteggio per categoria, ordinato per frequenza. */
  extrasByCategory: Array<{ category: string; n: number }>;
  /** Messaggi outbound scritti dall'agente nel mese. */
  agentMessagesMonth: number;
  /** Messaggi totali del mese (in + out) sulle prenotazioni dell'host. */
  totalMessagesMonth: number;
};

export type FeedItem = {
  at: Date;
  /** Riga gia' in linguaggio host. */
  line: string;
  kind: 'send' | 'reply' | 'inquiry';
  /** true = invio in prova (dry-run): mostrato ma etichettato. */
  simulated: boolean;
};

export type HomeSummary = {
  metrics: HomeMetrics;
  /** Feed ultimi 7 giorni, dal piu' recente. Split oggi/prima in UI. */
  feed: FeedItem[];
};

const FEED_DAYS = 7;
const ARRIVING_WINDOW_DAYS = 14;

const TRIGGER_LINES: Record<'welcome' | 'midstay' | 'checkout', string> = {
  welcome: 'Benvenuto WhatsApp a',
  midstay: 'Messaggio di meta soggiorno a',
  checkout: 'Messaggio di fine soggiorno a',
};

export async function getHomeSummary(
  db: Database,
  hostId: string,
  now: Date = new Date(),
): Promise<HomeSummary> {
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const arrivingEnd = new Date(now);
  arrivingEnd.setDate(arrivingEnd.getDate() + ARRIVING_WINDOW_DAYS);
  const feedStart = new Date(now);
  feedStart.setDate(feedStart.getDate() - FEED_DAYS);

  // Ogni sezione fallisce DA SOLA. Il 30/07 in produzione un TypeError
  // nella sezione messaggi faceva cadere l'intera funzione e il fallback
  // della pagina mostrava "0, nessuno in casa" con un ospite in casa:
  // la home mentiva perche' quattro query condividevano un solo destino.
  // Il log dice quale sezione e' caduta, le altre restano vere.
  async function section<T>(label: string, fallback: T, fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      console.error(`[home-summary] sezione ${label} fallita`, err);
      return fallback;
    }
  }

  // ─── Metrica 1: ospiti attivi ───────────────────────────────────
  const guests = await section('ospiti', { inHouse: 0, arriving: 0 }, async () => {
    const [inHouseRow] = await db
      .select({ n: sql<number>`coalesce(sum(${bookings.numGuests}), 0)::int` })
      .from(bookings)
      .innerJoin(properties, eq(properties.id, bookings.propertyId))
      .where(
        and(
          eq(properties.hostId, hostId),
          ne(bookings.status, 'cancelled'),
          eq(bookings.isCalendarBlock, false),
          lte(bookings.checkinAt, now),
          gt(bookings.checkoutAt, now),
        ),
      );

    const [arrivingRow] = await db
      .select({ n: sql<number>`coalesce(sum(${bookings.numGuests}), 0)::int` })
      .from(bookings)
      .innerJoin(properties, eq(properties.id, bookings.propertyId))
      .where(
        and(
          eq(properties.hostId, hostId),
          ne(bookings.status, 'cancelled'),
          eq(bookings.isCalendarBlock, false),
          gt(bookings.checkinAt, now),
          lte(bookings.checkinAt, arrivingEnd),
        ),
      );
    return { inHouse: inHouseRow?.n ?? 0, arriving: arrivingRow?.n ?? 0 };
  });

  // ─── Metrica 2: extra venduti nel mese ──────────────────────────
  const extras = await section(
    'extra',
    { eur: 0, count: 0, byCategory: [] as Array<{ category: string; n: number }> },
    async () => {
      const inquiryRows = await db
        .select({
          category: services.category,
          quoted: serviceInquiries.quotedPriceEur,
          salePrice: services.salePriceEur,
        })
        .from(serviceInquiries)
        .innerJoin(services, eq(services.id, serviceInquiries.serviceId))
        .innerJoin(properties, eq(properties.id, services.propertyId))
        .where(and(eq(properties.hostId, hostId), gte(serviceInquiries.occurredAt, startOfMonth)));

      let eur = 0;
      const byCategory = new Map<string, number>();
      for (const r of inquiryRows) {
        // Prezzo quotato se il fornitore l'ha dato, listino altrimenti.
        const price = Number(r.quoted ?? r.salePrice ?? 0);
        if (Number.isFinite(price)) eur += price;
        byCategory.set(r.category, (byCategory.get(r.category) ?? 0) + 1);
      }
      return {
        eur,
        count: inquiryRows.length,
        byCategory: [...byCategory.entries()]
          .map(([category, n]) => ({ category, n }))
          .sort((a, b) => b.n - a.n),
      };
    },
  );

  // ─── Metrica 3: messaggi dell'agente vs totale ──────────────────
  const msgTotals = await section('messaggi', { total: 0, agent: 0 }, async () => {
    const [row] = await db
      .select({
        total: sql<number>`count(*)::int`,
        agent: sql<number>`count(*) filter (where ${messages.fromEntity} = 'premura')::int`,
      })
      .from(messages)
      .innerJoin(bookings, eq(bookings.id, messages.bookingId))
      .innerJoin(properties, eq(properties.id, bookings.propertyId))
      .where(
        and(
          eq(properties.hostId, hostId),
          // ISO string + cast, NON un Date: contro un frammento raw Drizzle
          // non conosce il tipo e il driver postgres-js rifiuta i Date
          // ("Received an instance of Date") — visto in produzione il 30/07,
          // azzerava tutte le metriche via fallback.
          sql`coalesce(${messages.sentAt}, ${messages.createdAt}) >= ${startOfMonth.toISOString()}::timestamptz`,
        ),
      );
    return { total: row?.total ?? 0, agent: row?.agent ?? 0 };
  });

  // ─── Feed (invii + risposte + richieste servizi) ────────────────
  const feed = await section('feed', [] as FeedItem[], async () => {
    const sendRows = await db
      .select({
        at: outboundSends.sentAt,
        trigger: outboundSends.trigger,
        dryRun: outboundSends.dryRun,
        messageId: outboundSends.messageId,
        guestFirstName: bookings.guestFirstName,
        guestFullName: bookings.guestFullName,
        propertyName: properties.name,
      })
      .from(outboundSends)
      .innerJoin(bookings, eq(bookings.id, outboundSends.bookingId))
      .innerJoin(properties, eq(properties.id, bookings.propertyId))
      .where(
        and(
          eq(properties.hostId, hostId),
          eq(outboundSends.status, 'sent'),
          isNotNull(outboundSends.sentAt),
          gte(outboundSends.sentAt, feedStart),
        ),
      )
      .orderBy(desc(outboundSends.sentAt))
      .limit(100);

    // Id dei messages gia' rappresentati da uno slot outbound: evitiamo di
    // mostrare lo stesso invio due volte (slot + riga messages).
    const sendMessageIds = sendRows
      .map((s) => s.messageId)
      .filter((id): id is string => id !== null);

    const items: FeedItem[] = sendRows.map((s) => ({
      // isNotNull in query: sentAt non e' mai null qui.
      at: s.at as Date,
      line: `${TRIGGER_LINES[s.trigger]} ${s.guestFirstName ?? s.guestFullName} · ${s.propertyName}`,
      kind: 'send' as const,
      simulated: s.dryRun,
    }));

    // ─── Feed: risposte dell'agente (messages outbound 'premura') ───
    const replyRows = await db
      .select({
        id: messages.id,
        at: sql<Date>`coalesce(${messages.sentAt}, ${messages.createdAt})`,
        guestFirstName: bookings.guestFirstName,
        guestFullName: bookings.guestFullName,
        propertyName: properties.name,
        stage: messages.stage,
      })
      .from(messages)
      .innerJoin(bookings, eq(bookings.id, messages.bookingId))
      .innerJoin(properties, eq(properties.id, bookings.propertyId))
      .where(
        and(
          eq(properties.hostId, hostId),
          eq(messages.direction, 'outbound'),
          eq(messages.fromEntity, 'premura'),
          sql`coalesce(${messages.sentAt}, ${messages.createdAt}) >= ${feedStart.toISOString()}::timestamptz`,
          // notInArray e non sql`not in ${...}`: il template non espande gli
          // array in lista IN, diventerebbe un parametro solo e fallirebbe.
          sendMessageIds.length > 0 ? notInArray(messages.id, sendMessageIds) : sql`true`,
        ),
      )
      .orderBy(desc(sql`coalesce(${messages.sentAt}, ${messages.createdAt})`))
      .limit(100);

    for (const m of replyRows) {
      const guest = m.guestFirstName ?? m.guestFullName;
      items.push({
        at: new Date(m.at),
        line:
          m.stage === 'kit_reveal'
            ? `Benvenuto con foto del kit a ${guest} · ${m.propertyName}`
            : `Risposta all'ospite ${guest} · ${m.propertyName}`,
        kind: 'reply',
        simulated: false,
      });
    }

    // ─── Feed: richieste servizi ────────────────────────────────────
    const inquiryFeedRows = await db
      .select({
        at: serviceInquiries.occurredAt,
        titleIt: services.titleIt,
        titleEn: services.titleEn,
        guestFirstName: bookings.guestFirstName,
        propertyName: properties.name,
      })
      .from(serviceInquiries)
      .innerJoin(services, eq(services.id, serviceInquiries.serviceId))
      .innerJoin(properties, eq(properties.id, services.propertyId))
      .leftJoin(bookings, eq(bookings.id, serviceInquiries.bookingId))
      .where(and(eq(properties.hostId, hostId), gte(serviceInquiries.occurredAt, feedStart)))
      .orderBy(desc(serviceInquiries.occurredAt))
      .limit(100);

    for (const i of inquiryFeedRows) {
      const title = i.titleIt ?? i.titleEn;
      items.push({
        at: i.at,
        line: i.guestFirstName
          ? `${i.guestFirstName} ha chiesto: ${title} · ${i.propertyName}`
          : `Richiesta ricevuta: ${title} · ${i.propertyName}`,
        kind: 'inquiry',
        simulated: false,
      });
    }

    items.sort((a, b) => b.at.getTime() - a.at.getTime());
    return items;
  });

  return {
    metrics: {
      guestsInHouse: guests.inHouse,
      guestsArriving: guests.arriving,
      extrasMonthEur: extras.eur,
      extrasMonthCount: extras.count,
      extrasByCategory: extras.byCategory,
      agentMessagesMonth: msgTotals.agent,
      totalMessagesMonth: msgTotals.total,
    },
    feed,
  };
}

/**
 * Decisioni in attesa — ospiti senza numero VICINI ALL'ARRIVO.
 *
 * Diverso dal contatore "senza numero" della pagina check-in: qui conta
 * solo chi arriva entro 3 giorni, perche' la home mostra cio' che e'
 * fermo ADESSO, non tutto il backlog dei 14 giorni.
 */
export type GuestMissingPhoneSoon = {
  bookingId: string;
  guestFirstName: string | null;
  guestFullName: string;
  propertyName: string;
  checkinAt: Date;
};

const MISSING_PHONE_URGENCY_DAYS = 3;

export async function listGuestsMissingPhoneSoon(
  db: Database,
  hostId: string,
  now: Date = new Date(),
): Promise<GuestMissingPhoneSoon[]> {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const urgencyEnd = new Date(startOfToday);
  urgencyEnd.setDate(urgencyEnd.getDate() + MISSING_PHONE_URGENCY_DAYS);

  const rows = await db
    .select({
      bookingId: bookings.id,
      guestFirstName: bookings.guestFirstName,
      guestFullName: bookings.guestFullName,
      propertyName: properties.name,
      checkinAt: bookings.checkinAt,
    })
    .from(bookings)
    .innerJoin(properties, eq(properties.id, bookings.propertyId))
    .where(
      and(
        eq(properties.hostId, hostId),
        ne(bookings.status, 'cancelled'),
        // Blocchi calendario e fasce iCal Booking senza ospite noto NON
        // sono ospiti a cui manca il numero: qui solo prenotazioni vere
        // (le fasce ignote hanno la loro sezione, decisione 30/07).
        eq(bookings.isCalendarBlock, false),
        ne(bookings.dataSource, 'booking_ical_only'),
        sql`${bookings.guestPhone} is null`,
        gte(bookings.checkinAt, startOfToday),
        lt(bookings.checkinAt, urgencyEnd),
      ),
    )
    .orderBy(bookings.checkinAt);

  return rows;
}
