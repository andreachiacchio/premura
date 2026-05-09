import {
  type Database,
  type KitItem,
  type KitModification,
  bookings,
  hosts,
  kits,
  properties,
} from '@premura/db';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';

// Slice C — Kit repository.
//
// Queries con ownership verification (host può leggere/mutare solo i
// suoi kit, via JOIN bookings → properties → hosts.id = currentHostId).

export type KitListRow = {
  kitId: string;
  bookingId: string;
  status: string;
  guestFullName: string;
  propertyName: string;
  checkinAt: Date;
  nights: number;
  proposalGeneratedAt: Date | null;
  approvedAt: Date | null;
  cleanerBriefedAt: Date | null;
  cleanerAcceptedAt: Date | null;
  cleanerPlacedAt: Date | null;
  itemsTotalEur: string | null;
  budgetEur: string;
  itemCount: number;
};

export async function listKitsForHost(
  db: Database,
  hostId: string,
  statuses: string[] = [],
): Promise<KitListRow[]> {
  const baseConditions = [eq(properties.hostId, hostId)];
  if (statuses.length > 0) {
    // Cast a sql per match l'enum kit_status
    baseConditions.push(inArray(kits.status, statuses as never[]));
  }

  const rows = await db
    .select({
      kitId: kits.id,
      bookingId: kits.bookingId,
      status: kits.status,
      guestFullName: bookings.guestFullName,
      propertyName: properties.name,
      checkinAt: bookings.checkinAt,
      nights: bookings.nights,
      proposalGeneratedAt: kits.proposalGeneratedAt,
      approvedAt: kits.approvedAt,
      cleanerBriefedAt: kits.cleanerBriefedAt,
      cleanerAcceptedAt: kits.cleanerAcceptedAt,
      cleanerPlacedAt: kits.cleanerPlacedAt,
      itemsTotalEur: kits.itemsTotalEur,
      budgetEur: kits.budgetEur,
      items: kits.items,
    })
    .from(kits)
    .innerJoin(bookings, eq(kits.bookingId, bookings.id))
    .innerJoin(properties, eq(bookings.propertyId, properties.id))
    .where(and(...baseConditions))
    .orderBy(desc(kits.proposalGeneratedAt));

  return rows.map((r) => ({
    kitId: r.kitId,
    bookingId: r.bookingId,
    status: r.status,
    guestFullName: r.guestFullName,
    propertyName: r.propertyName,
    checkinAt: r.checkinAt,
    nights: r.nights,
    proposalGeneratedAt: r.proposalGeneratedAt,
    approvedAt: r.approvedAt,
    cleanerBriefedAt: r.cleanerBriefedAt,
    cleanerAcceptedAt: r.cleanerAcceptedAt,
    cleanerPlacedAt: r.cleanerPlacedAt,
    itemsTotalEur: r.itemsTotalEur,
    budgetEur: r.budgetEur,
    itemCount: r.items.length,
  }));
}

export type KitDetailRow = {
  kitId: string;
  bookingId: string;
  hostId: string;
  status: string;
  items: KitItem[];
  theme: string | null;
  storytellingIt: string | null;
  storytellingEn: string | null;
  rationale: string | null;
  cardMessage: string | null;
  cardMessageEn: string | null;
  budgetEur: string;
  itemsTotalEur: string | null;
  proposalGeneratedAt: Date | null;
  approvedAt: Date | null;
  approvedBy: string | null;
  rejectedAt: Date | null;
  rejectionReason: string | null;
  modificationLog: KitModification[];
  generatorAgentVersion: string | null;
  generatorCostUsd: string | null;
  guestLanguage: string;
  cleanerBriefedAt: Date | null;
  cleanerAcceptedAt: Date | null;
  cleanerPlacedAt: Date | null;
  cleanerPhotoUrl: string | null;
  guestConfirmedAt: Date | null;
  guestFullName: string;
  guestFirstName: string | null;
  propertyName: string;
  propertyId: string;
  checkinAt: Date;
  checkoutAt: Date;
  nights: number;
  numAdults: number;
  numChildren: number;
};

export async function getKitForHost(
  db: Database,
  kitId: string,
  hostId: string,
): Promise<KitDetailRow | null> {
  const [row] = await db
    .select({
      kitId: kits.id,
      bookingId: kits.bookingId,
      hostId: properties.hostId,
      status: kits.status,
      items: kits.items,
      theme: kits.theme,
      storytellingIt: kits.storytellingIt,
      storytellingEn: kits.storytellingEn,
      rationale: kits.rationale,
      cardMessage: kits.cardMessage,
      cardMessageEn: kits.cardMessageEn,
      budgetEur: kits.budgetEur,
      itemsTotalEur: kits.itemsTotalEur,
      proposalGeneratedAt: kits.proposalGeneratedAt,
      approvedAt: kits.approvedAt,
      approvedBy: kits.approvedBy,
      rejectedAt: kits.rejectedAt,
      rejectionReason: kits.rejectionReason,
      modificationLog: kits.modificationLog,
      generatorAgentVersion: kits.generatorAgentVersion,
      generatorCostUsd: kits.generatorCostUsd,
      guestLanguage: kits.guestLanguage,
      cleanerBriefedAt: kits.cleanerBriefedAt,
      cleanerAcceptedAt: kits.cleanerAcceptedAt,
      cleanerPlacedAt: kits.cleanerPlacedAt,
      cleanerPhotoUrl: kits.cleanerPhotoUrl,
      guestConfirmedAt: kits.guestConfirmedAt,
      guestFullName: bookings.guestFullName,
      guestFirstName: bookings.guestFirstName,
      propertyName: properties.name,
      propertyId: properties.id,
      checkinAt: bookings.checkinAt,
      checkoutAt: bookings.checkoutAt,
      nights: bookings.nights,
      numAdults: bookings.numAdults,
      numChildren: bookings.numChildren,
    })
    .from(kits)
    .innerJoin(bookings, eq(kits.bookingId, bookings.id))
    .innerJoin(properties, eq(bookings.propertyId, properties.id))
    .where(and(eq(kits.id, kitId), eq(properties.hostId, hostId)))
    .limit(1);
  return row ?? null;
}

// Mutations — tutte richiedono hostId per ownership check.

export async function approveKit(
  db: Database,
  kitId: string,
  hostId: string,
): Promise<{ ok: true } | { ok: false; reason: 'not_found' | 'invalid_status' }> {
  const existing = await getKitForHost(db, kitId, hostId);
  if (!existing) return { ok: false, reason: 'not_found' };
  if (existing.status !== 'proposed' && existing.status !== 'modified') {
    return { ok: false, reason: 'invalid_status' };
  }
  const now = new Date();
  await db
    .update(kits)
    .set({ status: 'approved', approvedAt: now, approvedBy: hostId, updatedAt: now })
    .where(eq(kits.id, kitId));
  return { ok: true };
}

export async function rejectKit(
  db: Database,
  kitId: string,
  hostId: string,
  reason: string,
): Promise<{ ok: true } | { ok: false; reason: 'not_found' | 'invalid_status' }> {
  const existing = await getKitForHost(db, kitId, hostId);
  if (!existing) return { ok: false, reason: 'not_found' };
  if (existing.status !== 'proposed' && existing.status !== 'modified') {
    return { ok: false, reason: 'invalid_status' };
  }
  const now = new Date();
  await db
    .update(kits)
    .set({ status: 'rejected', rejectedAt: now, rejectionReason: reason, updatedAt: now })
    .where(eq(kits.id, kitId));
  return { ok: true };
}

export type ItemModification = {
  items: KitItem[];
  theme?: string | null;
  cardMessage?: string | null;
  cardMessageEn?: string | null;
};

export async function modifyKit(
  db: Database,
  kitId: string,
  hostId: string,
  modification: ItemModification,
): Promise<{ ok: true } | { ok: false; reason: 'not_found' | 'invalid_status' }> {
  const existing = await getKitForHost(db, kitId, hostId);
  if (!existing) return { ok: false, reason: 'not_found' };
  if (existing.status !== 'proposed' && existing.status !== 'modified') {
    return { ok: false, reason: 'invalid_status' };
  }
  const now = new Date();
  const log: KitModification[] = [...existing.modificationLog];
  log.push({
    field: 'items',
    oldValue: existing.items,
    newValue: modification.items,
    modifiedAt: now.toISOString(),
    modifiedBy: hostId,
  });
  if (modification.theme !== undefined && modification.theme !== existing.theme) {
    log.push({
      field: 'theme',
      oldValue: existing.theme,
      newValue: modification.theme,
      modifiedAt: now.toISOString(),
      modifiedBy: hostId,
    });
  }
  if (modification.cardMessage !== undefined && modification.cardMessage !== existing.cardMessage) {
    log.push({
      field: 'cardMessage',
      oldValue: existing.cardMessage,
      newValue: modification.cardMessage,
      modifiedAt: now.toISOString(),
      modifiedBy: hostId,
    });
  }
  if (
    modification.cardMessageEn !== undefined &&
    modification.cardMessageEn !== existing.cardMessageEn
  ) {
    log.push({
      field: 'cardMessageEn',
      oldValue: existing.cardMessageEn,
      newValue: modification.cardMessageEn,
      modifiedAt: now.toISOString(),
      modifiedBy: hostId,
    });
  }

  // Ricalcolo itemsTotalEur dalla somma estimatedPriceEur*quantity.
  const total = modification.items.reduce(
    (s, it) => s + (it.estimatedPriceEur ?? 0) * (it.quantity ?? 1),
    0,
  );

  await db
    .update(kits)
    .set({
      status: 'modified',
      items: modification.items,
      theme: modification.theme ?? existing.theme,
      cardMessage: modification.cardMessage ?? existing.cardMessage,
      cardMessageEn: modification.cardMessageEn ?? existing.cardMessageEn,
      itemsTotalEur: total.toFixed(2),
      modificationLog: log,
      updatedAt: now,
    })
    .where(eq(kits.id, kitId));
  return { ok: true };
}

// Item executed toggle (founder marca singolo item come ordinato).
export async function toggleItemExecuted(
  db: Database,
  kitId: string,
  hostId: string,
  itemIndex: number,
): Promise<
  { ok: true; allExecuted: boolean } | { ok: false; reason: 'not_found' | 'invalid_index' }
> {
  const existing = await getKitForHost(db, kitId, hostId);
  if (!existing) return { ok: false, reason: 'not_found' };
  if (itemIndex < 0 || itemIndex >= existing.items.length) {
    return { ok: false, reason: 'invalid_index' };
  }
  const now = new Date();
  const updatedItems = existing.items.map((it, i) => {
    if (i !== itemIndex) return it;
    return {
      ...it,
      executedAt: it.executedAt ? null : now.toISOString(),
    };
  });
  const allExecuted = updatedItems.every((it) => it.executedAt);
  await db.update(kits).set({ items: updatedItems, updatedAt: now }).where(eq(kits.id, kitId));
  return { ok: true, allExecuted };
}

// Generic status transition — usato per in_transit, arrived_at_locker, ecc.
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  approved: ['ordering', 'rejected'],
  ordering: ['in_transit', 'arrived_at_locker', 'picked_up_by_cleaner'],
  in_transit: ['arrived_at_locker'],
  arrived_at_locker: ['picked_up_by_cleaner'],
  picked_up_by_cleaner: ['set_up'],
  set_up: ['delivered_to_guest'],
};

export async function updateKitStatus(
  db: Database,
  kitId: string,
  hostId: string,
  newStatus: string,
  extra: { cleanerPhotoUrl?: string | null } = {},
): Promise<{ ok: true } | { ok: false; reason: 'not_found' | 'invalid_transition' }> {
  const existing = await getKitForHost(db, kitId, hostId);
  if (!existing) return { ok: false, reason: 'not_found' };
  const allowed = ALLOWED_TRANSITIONS[existing.status] ?? [];
  if (!allowed.includes(newStatus)) {
    return { ok: false, reason: 'invalid_transition' };
  }
  const now = new Date();
  const patch: Record<string, unknown> = { status: newStatus, updatedAt: now };
  if (newStatus === 'picked_up_by_cleaner')
    patch.cleanerBriefedAt = existing.cleanerBriefedAt ?? now;
  if (newStatus === 'set_up') {
    patch.cleanerPlacedAt = now;
    if (extra.cleanerPhotoUrl !== undefined) patch.cleanerPhotoUrl = extra.cleanerPhotoUrl;
  }
  if (newStatus === 'delivered_to_guest') patch.guestConfirmedAt = now;
  await db.update(kits).set(patch).where(eq(kits.id, kitId));
  return { ok: true };
}

// Counter dei kit per status — usato per badge tab.
export async function countKitsByStatusForHost(
  db: Database,
  hostId: string,
): Promise<Record<string, number>> {
  const rows = await db
    .select({
      status: kits.status,
      count: sql<number>`count(*)::int`,
    })
    .from(kits)
    .innerJoin(bookings, eq(kits.bookingId, bookings.id))
    .innerJoin(properties, eq(bookings.propertyId, properties.id))
    .where(eq(properties.hostId, hostId))
    .groupBy(kits.status);
  return Object.fromEntries(rows.map((r) => [r.status, r.count]));
}

export async function getKitIdForBooking(
  db: Database,
  bookingId: string,
  hostId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ kitId: kits.id })
    .from(kits)
    .innerJoin(bookings, eq(kits.bookingId, bookings.id))
    .innerJoin(properties, eq(bookings.propertyId, properties.id))
    .where(and(eq(kits.bookingId, bookingId), eq(properties.hostId, hostId)))
    .limit(1);
  return row?.kitId ?? null;
}

// Re-export per server actions (verifica fk hosts.email per email destinatari).
export async function getHostEmailById(db: Database, hostId: string): Promise<string | null> {
  const [row] = await db
    .select({ email: hosts.email })
    .from(hosts)
    .where(eq(hosts.id, hostId))
    .limit(1);
  return row?.email ?? null;
}
