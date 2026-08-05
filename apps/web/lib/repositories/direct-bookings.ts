import { type Database, bookings, properties } from '@premura/db';
import { ANONYMOUS_ICAL_SOURCES } from '@premura/shared';
import { and, eq, inArray, ne, sql } from 'drizzle-orm';

// Prenotazione inserita dall'host (Andrea 05/08).
//
// "La diretta va trattata come il caso migliore, non come fallback:
// e' l'unico caso in cui Premura funziona al 100% dal primo minuto, e
// per l'host vale di piu' perche' non paga commissioni."
//
// ─── Il problema dei doppioni ──────────────────────────────────────
//
// Il feed Booking esporta TUTTE le date occupate come fasce anonime
// ("CLOSED - Not available"), comprese quelle che l'host ha bloccato a
// mano perche' aveva una prenotazione diretta. Quindi inserendo la
// diretta si rischia di ritrovarsi due righe per lo stesso soggiorno.
//
// Soluzione: ASSORBIMENTO IN PLACE. Se esiste gia' una fascia anonima
// sulle stesse identiche date, non se ne crea una nuova: si aggiorna
// quella. E' l'unica strategia che non tocca nessuna delle 13 tabelle
// che referenziano bookings.id (conversazioni, kit, messaggi, bozze...):
// restano tutte attaccate allo stesso id.
//
// Perche' il poll iCal successivo non ricrea il doppione: la riga
// assorbita ha ora un data_source NON anonimo, quindi
// findCoveringNamedBookings la vede come "prenotazione con nome" e
// sopprime la shell in arrivo gia' al primo controllo di
// upsertBookingShell. Seconda rete: la guardia same-stay, che scatta
// perche' cambiamo ANCHE platform_booking_ref. Cambiare platform
// TENENDO il vecchio ref sarebbe invece la combinazione rotta — la
// guardia non scatterebbe e l'ON CONFLICT non troverebbe conflitto.
//
// Sovrapposizione PARZIALE (la fascia copre 3 notti, la diretta 2):
// non e' lo stesso soggiorno, quindi non si assorbe. Si salva
// comunque e lo si dice all'host, invece di indovinare.

/** Origine reale della prenotazione. Separata da data_source, che
 *  guida il comportamento dell'agente. */
export type DirectBookingPlatform = 'direct' | 'booking' | 'airbnb' | 'altro';

export type CreateDirectBookingInput = {
  propertyId: string;
  platform: DirectBookingPlatform;
  guestFullName: string;
  guestPhone: string | null;
  guestEmail: string | null;
  guestLanguage: string | null;
  numGuests: number;
  /** Mezzanotte UTC, come tutto il resto del sistema. */
  checkinAt: Date;
  checkoutAt: Date;
  /** Decimale come stringa (drizzle vuole string su decimal). */
  priceTotal: string | null;
  hostNotes: string | null;
};

export type OverlappingRange = {
  id: string;
  checkinAt: Date;
  checkoutAt: Date;
};

export type CreateDirectBookingResult =
  | {
      ok: true;
      bookingId: string;
      /** true = ha preso il posto di una fascia anonima esistente. */
      absorbed: boolean;
      /** Fasce anonime che si sovrappongono senza coincidere: l'host
       *  deve saperlo, non gliele tocchiamo. */
      partialOverlaps: OverlappingRange[];
      /** true = Premura e' stata attivata (c'era un numero). */
      premuraActivated: boolean;
    }
  | { ok: false; reason: 'property_not_found' | 'wrong_host' | 'invalid_dates' };

/** Notti fra due mezzanotti UTC. */
export function nightsBetween(checkinAt: Date, checkoutAt: Date): number {
  const MS_PER_DAY = 86_400_000;
  const a = Date.UTC(checkinAt.getUTCFullYear(), checkinAt.getUTCMonth(), checkinAt.getUTCDate());
  const b = Date.UTC(
    checkoutAt.getUTCFullYear(),
    checkoutAt.getUTCMonth(),
    checkoutAt.getUTCDate(),
  );
  return Math.round((b - a) / MS_PER_DAY);
}

const ANON = [...ANONYMOUS_ICAL_SOURCES];

/** Fasce anonime della property che toccano l'intervallo dato.
 *  Overlap stretto: checkin < range.checkout AND checkout > range.checkin. */
async function findAnonymousRangesTouching(
  db: Database,
  propertyId: string,
  checkinAt: Date,
  checkoutAt: Date,
): Promise<Array<OverlappingRange & { sameDates: boolean }>> {
  const rows = await db
    .select({
      id: bookings.id,
      checkinAt: bookings.checkinAt,
      checkoutAt: bookings.checkoutAt,
      sameDates: sql<boolean>`
        ${bookings.checkinAt}::date = ${checkinAt.toISOString()}::timestamptz::date
        AND ${bookings.checkoutAt}::date = ${checkoutAt.toISOString()}::timestamptz::date
      `,
    })
    .from(bookings)
    .where(
      and(
        eq(bookings.propertyId, propertyId),
        inArray(bookings.dataSource, ANON),
        eq(bookings.isCalendarBlock, false),
        ne(bookings.status, 'cancelled'),
        sql`${bookings.checkinAt} < ${checkoutAt.toISOString()}::timestamptz`,
        sql`${bookings.checkoutAt} > ${checkinAt.toISOString()}::timestamptz`,
      ),
    );
  return rows;
}

/**
 * Crea la prenotazione, assorbendo la fascia anonima se le date
 * coincidono. Verifica sempre che la property sia dell'host: la
 * dashboard usa la connessione owner e bypassa RLS, quindi
 * l'ownership va imposta qui.
 */
export async function createDirectBooking(
  db: Database,
  hostId: string,
  input: CreateDirectBookingInput,
): Promise<CreateDirectBookingResult> {
  const nights = nightsBetween(input.checkinAt, input.checkoutAt);
  if (nights < 1) return { ok: false, reason: 'invalid_dates' };

  const [property] = await db
    .select({ id: properties.id, hostId: properties.hostId })
    .from(properties)
    .where(eq(properties.id, input.propertyId))
    .limit(1);
  if (!property) return { ok: false, reason: 'property_not_found' };
  if (property.hostId !== hostId) return { ok: false, reason: 'wrong_host' };

  const now = new Date();
  // Il numero e' cio' che accende Premura: senza, l'agente non ha un
  // canale e attivarla sarebbe uno stato bugiardo (stessa regola di
  // setBookingPremuraActive).
  const premuraActiveAt = input.guestPhone ? now : null;

  const touching = await findAnonymousRangesTouching(
    db,
    input.propertyId,
    input.checkinAt,
    input.checkoutAt,
  );
  const daAssorbire = touching.find((r) => r.sameDates);
  const partialOverlaps = touching
    .filter((r) => !r.sameDates)
    .map(({ id, checkinAt, checkoutAt }) => ({ id, checkinAt, checkoutAt }));

  // platform_booking_ref nuovo in ENTRAMBI i rami: l'unique index e'
  // su (platform, platform_booking_ref) e NON include property_id,
  // quindi serve un valore univoco globale.
  const platformBookingRef = `${input.platform}-${crypto.randomUUID()}`;

  const campiOspite = {
    platform: input.platform,
    platformBookingRef,
    guestFullName: input.guestFullName,
    guestFirstName: input.guestFullName.trim().split(/\s+/)[0] ?? null,
    guestPhone: input.guestPhone,
    guestEmail: input.guestEmail,
    guestLanguage: input.guestLanguage,
    numGuests: input.numGuests,
    numAdults: input.numGuests,
    numChildren: 0,
    nights,
    dataSource: 'direct_manual',
    hostPayoutAmount: input.priceTotal,
    hostPayoutCurrency: input.priceTotal ? 'EUR' : null,
    hostNotes: input.hostNotes,
    premuraActiveAt,
    guestPhoneSource: input.guestPhone ? 'manual' : null,
    guestPhoneAddedByHostId: input.guestPhone ? hostId : null,
    manualCompletionAt: now,
    hostSkippedCompletion: false,
    updatedAt: now,
  };

  if (daAssorbire) {
    await db.update(bookings).set(campiOspite).where(eq(bookings.id, daAssorbire.id));
    return {
      ok: true,
      bookingId: daAssorbire.id,
      absorbed: true,
      partialOverlaps,
      premuraActivated: premuraActiveAt !== null,
    };
  }

  const [creata] = await db
    .insert(bookings)
    .values({
      propertyId: input.propertyId,
      checkinAt: input.checkinAt,
      checkoutAt: input.checkoutAt,
      status: 'confirmed',
      isCalendarBlock: false,
      ...campiOspite,
    })
    .returning({ id: bookings.id });
  if (!creata) throw new Error('[direct-bookings] insert senza riga di ritorno');

  return {
    ok: true,
    bookingId: creata.id,
    absorbed: false,
    partialOverlaps,
    premuraActivated: premuraActiveAt !== null,
  };
}
