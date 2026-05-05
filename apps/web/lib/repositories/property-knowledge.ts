import {
  type Database,
  type EmergencyContact,
  type HouseRules,
  type KeyboxInfo,
  type NearbyEssential,
  type ParkingInfo,
  type WifiInfo,
  properties,
  propertyKnowledge,
} from '@premura/db';
import { and, eq } from 'drizzle-orm';

// Slice 12 — Repository property_knowledge.
//
// Auto-save lazy: il primo update crea la row, le successive aggiornano.
// Pre-check ownership pattern slice 6 fase 6.5: l'host puo' modificare
// solo le proprie property.
//
// getPropertyKnowledge: helper esposto per Conversation Agent futuro
// (slice 11 system prompt context).

export type PropertyKnowledgeView = {
  propertyId: string;
  keybox: KeyboxInfo | null;
  wifi: WifiInfo | null;
  parking: ParkingInfo | null;
  houseRules: HouseRules | null;
  emergencyContacts: EmergencyContact[];
  nearbyEssentials: NearbyEssential[];
  additionalInfo: string | null;
  updatedAt: Date | null;
};

export async function getPropertyKnowledge(
  db: Database,
  propertyId: string,
): Promise<PropertyKnowledgeView | null> {
  const [row] = await db
    .select()
    .from(propertyKnowledge)
    .where(eq(propertyKnowledge.propertyId, propertyId))
    .limit(1);
  if (!row) return null;
  return {
    propertyId: row.propertyId,
    keybox: row.keybox,
    wifi: row.wifi,
    parking: row.parking,
    houseRules: row.houseRules,
    emergencyContacts: row.emergencyContacts,
    nearbyEssentials: row.nearbyEssentials,
    additionalInfo: row.additionalInfo,
    updatedAt: row.updatedAt,
  };
}

// Verifica ownership: la property deve appartenere all'host. Helper
// per le server action (pre-check pattern slice 6 fase 6.5).
export async function isPropertyOwnedByHost(
  db: Database,
  propertyId: string,
  hostId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: properties.id })
    .from(properties)
    .where(and(eq(properties.id, propertyId), eq(properties.hostId, hostId)))
    .limit(1);
  return Boolean(row);
}

export type PropertyKnowledgePatch = Partial<{
  keybox: KeyboxInfo | null;
  wifi: WifiInfo | null;
  parking: ParkingInfo | null;
  houseRules: HouseRules | null;
  emergencyContacts: EmergencyContact[];
  nearbyEssentials: NearbyEssential[];
  additionalInfo: string | null;
}>;

// Upsert: prima update, fallback insert se row inesistente. Idempotente.
// Aggiorna solo i campi nel patch (Partial), gli altri restano.
export async function upsertPropertyKnowledge(
  db: Database,
  propertyId: string,
  hostId: string,
  patch: PropertyKnowledgePatch,
): Promise<{ inserted: boolean }> {
  const setValues: Record<string, unknown> = { updatedAt: new Date(), updatedBy: hostId };
  if ('keybox' in patch) setValues.keybox = patch.keybox;
  if ('wifi' in patch) setValues.wifi = patch.wifi;
  if ('parking' in patch) setValues.parking = patch.parking;
  if ('houseRules' in patch) setValues.houseRules = patch.houseRules;
  if ('emergencyContacts' in patch) setValues.emergencyContacts = patch.emergencyContacts;
  if ('nearbyEssentials' in patch) setValues.nearbyEssentials = patch.nearbyEssentials;
  if ('additionalInfo' in patch) setValues.additionalInfo = patch.additionalInfo;

  const [updated] = await db
    .update(propertyKnowledge)
    .set(setValues)
    .where(eq(propertyKnowledge.propertyId, propertyId))
    .returning({ id: propertyKnowledge.id });

  if (updated) return { inserted: false };

  // Insert nuovo: serve almeno propertyId.
  await db.insert(propertyKnowledge).values({
    propertyId,
    updatedBy: hostId,
    keybox: patch.keybox ?? null,
    wifi: patch.wifi ?? null,
    parking: patch.parking ?? null,
    houseRules: patch.houseRules ?? null,
    emergencyContacts: patch.emergencyContacts ?? [],
    nearbyEssentials: patch.nearbyEssentials ?? [],
    additionalInfo: patch.additionalInfo ?? null,
  });
  return { inserted: true };
}
