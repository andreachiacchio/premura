import { nextPropertyColor } from '@/lib/property-color';
import { type Database, type IcalSource, properties } from '@premura/db';
import { asc, eq } from 'drizzle-orm';

// Repository properties: lettura per onboarding/dashboard + creazione
// dalla form prima property (slice 6 fase 6).
//
// Nota su iCal: il form host accetta un singolo URL Booking opzionale.
// Lo schema properties.ts modella icalSources come array di IcalSource
// per supportare in futuro Airbnb + Booking + channel manager. Qui in
// fase 6 mappiamo l'URL form a una singola entry source='booking'; le
// altre fonti si aggiungono in slice futuri (settings page).

export type PropertyRow = {
  id: string;
  name: string;
  city: string;
  /** Link della guida ospite, per struttura. Null = invito non parte. */
  guestAppUrl: string | null;
  /** Colore fisso della struttura (#RRGGBB) — sistema colori 30/07. */
  color: string | null;
};

export async function findByHostId(args: {
  db: Database;
  hostId: string;
}): Promise<PropertyRow[]> {
  const { db, hostId } = args;
  const rows = await db
    .select({
      id: properties.id,
      name: properties.name,
      city: properties.city,
      color: properties.color,
      guestAppUrl: properties.guestAppUrl,
    })
    .from(properties)
    .where(eq(properties.hostId, hostId))
    .orderBy(asc(properties.createdAt));
  return rows;
}

export type CreatePropertyArgs = {
  db: Database;
  hostId: string;
  name: string;
  city: string;
  icalBookingUrl?: string;
};

export async function createProperty(args: CreatePropertyArgs): Promise<{
  id: string;
}> {
  const { db, hostId, name, city, icalBookingUrl } = args;

  const icalSources: IcalSource[] = icalBookingUrl
    ? [{ source: 'booking', url: icalBookingUrl }]
    : [];

  // Sistema colori (30/07): alla creazione si assegna il primo colore
  // libero della palette — la struttura si riconosce senza leggere.
  const existing = await db
    .select({ color: properties.color })
    .from(properties)
    .where(eq(properties.hostId, hostId));
  const color = nextPropertyColor(existing.map((r) => r.color));

  const inserted = await db
    .insert(properties)
    .values({
      hostId,
      name,
      city,
      color,
      // addressLine nullable da migration 0008: niente placeholder, l'host
      // completa l'indirizzo in settings page.
      icalSources,
    })
    .returning({ id: properties.id });

  if (inserted.length === 0) {
    throw new Error('[properties.createProperty] INSERT ... RETURNING vuoto');
  }
  return { id: inserted[0]!.id };
}
