import { type Database, bookings, properties } from '@premura/db';
import { and, asc, eq, gt, lte, ne } from 'drizzle-orm';

// Ospiti della HOME desktop (Andrea, 30/07): "Chi e' in casa" (soggiorni
// in corso) e "In arrivo" (prossimi 7 giorni). Card compatte con
// iniziale, nome, struttura, frase di stato, colore struttura.
//
// COERENZA COI CONTEGGI ("mai due verita'"): i predicati di
// listGuestsInHouse sono GLI STESSI della metrica guestsInHouse in
// home-summary (checkin <= now < checkout, non cancellata, non blocco).
// Se il contatore dell'agent card dice 9, qui ci sono le stesse
// prenotazioni. Le fasce iCal Booking senza ospite noto restano incluse
// e si presentano come "Un ospite" — qualcuno in casa c'e', anche se
// non sappiamo chi.

export type HomeGuestRow = {
  id: string;
  guestFirstName: string | null;
  guestFullName: string;
  propertyId: string;
  propertyName: string;
  propertyColor: string | null;
  dataSource: string;
  checkinAt: Date;
  checkoutAt: Date;
  nights: number;
  numGuests: number;
  guestPhone: string | null;
  premuraActiveAt: Date | null;
};

const GUEST_FIELDS = {
  id: bookings.id,
  guestFirstName: bookings.guestFirstName,
  guestFullName: bookings.guestFullName,
  propertyId: bookings.propertyId,
  propertyName: properties.name,
  propertyColor: properties.color,
  dataSource: bookings.dataSource,
  checkinAt: bookings.checkinAt,
  checkoutAt: bookings.checkoutAt,
  nights: bookings.nights,
  numGuests: bookings.numGuests,
  guestPhone: bookings.guestPhone,
  premuraActiveAt: bookings.premuraActiveAt,
};

export async function listGuestsInHouse(
  db: Database,
  hostId: string,
  now: Date = new Date(),
): Promise<HomeGuestRow[]> {
  return db
    .select(GUEST_FIELDS)
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
    )
    .orderBy(asc(bookings.checkoutAt));
}

const ARRIVING_DAYS = 7;

export async function listGuestsArrivingSoon(
  db: Database,
  hostId: string,
  now: Date = new Date(),
): Promise<HomeGuestRow[]> {
  const windowEnd = new Date(now);
  windowEnd.setDate(windowEnd.getDate() + ARRIVING_DAYS);
  return db
    .select(GUEST_FIELDS)
    .from(bookings)
    .innerJoin(properties, eq(properties.id, bookings.propertyId))
    .where(
      and(
        eq(properties.hostId, hostId),
        ne(bookings.status, 'cancelled'),
        eq(bookings.isCalendarBlock, false),
        gt(bookings.checkinAt, now),
        lte(bookings.checkinAt, windowEnd),
      ),
    )
    .orderBy(asc(bookings.checkinAt));
}
