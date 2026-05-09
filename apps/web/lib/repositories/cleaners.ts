import { type Database, cleaners, kits, properties, bookings } from '@premura/db';
import { and, count, desc, eq, sql } from 'drizzle-orm';

// Slice F — Cleaner repository.
//
// Tutte le query con ownership check via cleaners.host_id = currentHostId.

export type CleanerListRow = {
  id: string;
  fullName: string;
  whatsappNumber: string;
  email: string | null;
  deliveryAddress: string;
  perKitFeeEur: string;
  languagePreferred: string;
  isActive: boolean;
  karenAccepted: boolean;
  assignedPropertyCount: number;
  totalKitsCompleted: number;
  createdAt: Date;
};

export async function listCleanersForHost(
  db: Database,
  hostId: string,
): Promise<CleanerListRow[]> {
  const rows = await db
    .select({
      id: cleaners.id,
      fullName: cleaners.fullName,
      whatsappNumber: cleaners.whatsappNumber,
      email: cleaners.email,
      deliveryAddress: cleaners.deliveryAddress,
      perKitFeeEur: cleaners.perKitFeeEur,
      languagePreferred: cleaners.languagePreferred,
      isActive: cleaners.isActive,
      karenAccepted: cleaners.karenAccepted,
      createdAt: cleaners.createdAt,
    })
    .from(cleaners)
    .where(eq(cleaners.hostId, hostId))
    .orderBy(desc(cleaners.createdAt));

  // Per ogni cleaner: count properties assigned + count kit set_up/delivered.
  const cleanerIds = rows.map((r) => r.id);
  if (cleanerIds.length === 0) return [];

  const propertyCounts = await db
    .select({
      cleanerId: properties.cleanerId,
      count: count(properties.id).as('count'),
    })
    .from(properties)
    .where(eq(properties.hostId, hostId))
    .groupBy(properties.cleanerId);

  const propertyCountMap = new Map<string, number>();
  for (const r of propertyCounts) {
    if (r.cleanerId) propertyCountMap.set(r.cleanerId, Number(r.count));
  }

  const kitCounts = await db
    .select({
      cleanerId: properties.cleanerId,
      count: count(kits.id).as('count'),
    })
    .from(kits)
    .innerJoin(bookings, eq(kits.bookingId, bookings.id))
    .innerJoin(properties, eq(bookings.propertyId, properties.id))
    .where(
      and(
        eq(properties.hostId, hostId),
        sql`${kits.status} IN ('set_up', 'delivered_to_guest')`,
      ),
    )
    .groupBy(properties.cleanerId);

  const kitCountMap = new Map<string, number>();
  for (const r of kitCounts) {
    if (r.cleanerId) kitCountMap.set(r.cleanerId, Number(r.count));
  }

  return rows.map((r) => ({
    ...r,
    assignedPropertyCount: propertyCountMap.get(r.id) ?? 0,
    totalKitsCompleted: kitCountMap.get(r.id) ?? 0,
  }));
}

export type CleanerDetailRow = {
  id: string;
  hostId: string;
  fullName: string;
  whatsappNumber: string;
  email: string | null;
  deliveryAddress: string;
  pickupPointCode: string | null;
  perKitFeeEur: string;
  payoutMethod: string | null;
  payoutIban: string | null;
  stripeAccountId: string | null;
  languagePreferred: string;
  notes: string | null;
  isActive: boolean;
  karenAccepted: boolean;
  createdAt: Date;
};

export async function getCleanerForHost(
  db: Database,
  cleanerId: string,
  hostId: string,
): Promise<CleanerDetailRow | null> {
  const [row] = await db
    .select({
      id: cleaners.id,
      hostId: cleaners.hostId,
      fullName: cleaners.fullName,
      whatsappNumber: cleaners.whatsappNumber,
      email: cleaners.email,
      deliveryAddress: cleaners.deliveryAddress,
      pickupPointCode: cleaners.pickupPointCode,
      perKitFeeEur: cleaners.perKitFeeEur,
      payoutMethod: cleaners.payoutMethod,
      payoutIban: cleaners.payoutIban,
      stripeAccountId: cleaners.stripeAccountId,
      languagePreferred: cleaners.languagePreferred,
      notes: cleaners.notes,
      isActive: cleaners.isActive,
      karenAccepted: cleaners.karenAccepted,
      createdAt: cleaners.createdAt,
    })
    .from(cleaners)
    .where(and(eq(cleaners.id, cleanerId), eq(cleaners.hostId, hostId)))
    .limit(1);
  return row ?? null;
}

export type CreateCleanerInput = {
  fullName: string;
  whatsappNumber: string;
  email?: string | null;
  deliveryAddress: string;
  pickupPointCode?: string | null;
  perKitFeeEur?: string;
  payoutMethod?: string;
  payoutIban?: string | null;
  languagePreferred?: 'it' | 'en' | 'es';
  notes?: string | null;
};

export async function createCleaner(
  db: Database,
  hostId: string,
  input: CreateCleanerInput,
): Promise<{ id: string }> {
  const [row] = await db
    .insert(cleaners)
    .values({
      hostId,
      fullName: input.fullName,
      whatsappNumber: input.whatsappNumber,
      email: input.email ?? null,
      deliveryAddress: input.deliveryAddress,
      pickupPointCode: input.pickupPointCode ?? null,
      perKitFeeEur: input.perKitFeeEur ?? '2.00',
      payoutMethod: input.payoutMethod ?? 'stripe_connect',
      payoutIban: input.payoutIban ?? null,
      languagePreferred: input.languagePreferred ?? 'it',
      notes: input.notes ?? null,
    })
    .returning({ id: cleaners.id });
  if (!row) throw new Error('createCleaner: insert returned no row');
  return { id: row.id };
}

export type UpdateCleanerInput = Partial<CreateCleanerInput>;

export async function updateCleaner(
  db: Database,
  cleanerId: string,
  hostId: string,
  input: UpdateCleanerInput,
): Promise<{ ok: true } | { ok: false; reason: 'not_found' }> {
  const existing = await getCleanerForHost(db, cleanerId, hostId);
  if (!existing) return { ok: false, reason: 'not_found' };
  const now = new Date();
  await db
    .update(cleaners)
    .set({
      ...(input.fullName !== undefined && { fullName: input.fullName }),
      ...(input.whatsappNumber !== undefined && { whatsappNumber: input.whatsappNumber }),
      ...(input.email !== undefined && { email: input.email }),
      ...(input.deliveryAddress !== undefined && { deliveryAddress: input.deliveryAddress }),
      ...(input.pickupPointCode !== undefined && { pickupPointCode: input.pickupPointCode }),
      ...(input.perKitFeeEur !== undefined && { perKitFeeEur: input.perKitFeeEur }),
      ...(input.payoutMethod !== undefined && { payoutMethod: input.payoutMethod }),
      ...(input.payoutIban !== undefined && { payoutIban: input.payoutIban }),
      ...(input.languagePreferred !== undefined && {
        languagePreferred: input.languagePreferred,
      }),
      ...(input.notes !== undefined && { notes: input.notes }),
      updatedAt: now,
    })
    .where(eq(cleaners.id, cleanerId));
  return { ok: true };
}

export async function deactivateCleaner(
  db: Database,
  cleanerId: string,
  hostId: string,
): Promise<{ ok: true } | { ok: false; reason: 'not_found' }> {
  const existing = await getCleanerForHost(db, cleanerId, hostId);
  if (!existing) return { ok: false, reason: 'not_found' };
  await db
    .update(cleaners)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(cleaners.id, cleanerId));
  return { ok: true };
}

export async function reactivateCleaner(
  db: Database,
  cleanerId: string,
  hostId: string,
): Promise<{ ok: true } | { ok: false; reason: 'not_found' }> {
  const existing = await getCleanerForHost(db, cleanerId, hostId);
  if (!existing) return { ok: false, reason: 'not_found' };
  await db
    .update(cleaners)
    .set({ isActive: true, updatedAt: new Date() })
    .where(eq(cleaners.id, cleanerId));
  return { ok: true };
}

export async function assignCleanerToProperty(
  db: Database,
  propertyId: string,
  cleanerId: string | null,
  hostId: string,
): Promise<{ ok: true } | { ok: false; reason: 'not_found' | 'wrong_host' }> {
  // Verifica property ownership.
  const [propRow] = await db
    .select({ id: properties.id, hostId: properties.hostId })
    .from(properties)
    .where(eq(properties.id, propertyId))
    .limit(1);
  if (!propRow) return { ok: false, reason: 'not_found' };
  if (propRow.hostId !== hostId) return { ok: false, reason: 'wrong_host' };

  // Verifica cleaner ownership se non null.
  if (cleanerId) {
    const cleaner = await getCleanerForHost(db, cleanerId, hostId);
    if (!cleaner) return { ok: false, reason: 'not_found' };
  }

  await db
    .update(properties)
    .set({ cleanerId, updatedAt: new Date() })
    .where(eq(properties.id, propertyId));
  return { ok: true };
}

export async function listPropertiesForCleaner(
  db: Database,
  cleanerId: string,
  hostId: string,
): Promise<Array<{ id: string; name: string; addressLine: string | null }>> {
  return db
    .select({
      id: properties.id,
      name: properties.name,
      addressLine: properties.addressLine,
    })
    .from(properties)
    .where(and(eq(properties.hostId, hostId), eq(properties.cleanerId, cleanerId)))
    .orderBy(properties.name);
}

export async function countActiveCleanersForHost(
  db: Database,
  hostId: string,
): Promise<number> {
  const [row] = await db
    .select({ count: count(cleaners.id).as('count') })
    .from(cleaners)
    .where(and(eq(cleaners.hostId, hostId), eq(cleaners.isActive, true)));
  return Number(row?.count ?? 0);
}
