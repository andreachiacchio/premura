import { asc, eq } from "drizzle-orm";
import { properties, type Database, type IcalSource } from "@premura/db";

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
    ? [{ source: "booking", url: icalBookingUrl }]
    : [];

  const inserted = await db
    .insert(properties)
    .values({
      hostId,
      name,
      city,
      // addressLine nullable da migration 0008: niente placeholder, l'host
      // completa l'indirizzo in settings page.
      icalSources,
    })
    .returning({ id: properties.id });

  if (inserted.length === 0) {
    throw new Error("[properties.createProperty] INSERT ... RETURNING vuoto");
  }
  return { id: inserted[0]!.id };
}
