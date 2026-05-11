import {
  type Database,
  bookings,
  cleaners,
  kits,
  properties,
  propertyKnowledge,
} from '@premura/db';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';

// Slice D — Repository per kit visibili al cleaner.
// Filtraggio: properties.cleanerId == cleanerId AND kit status non legacy.
// Usiamo sql.raw per il filtro status array — l'enum coverage di drizzle-orm
// e' troppo stretto e bloccarsi sul tipo statico non aiuta il caller.

const VISIBLE_STATUSES_SQL = sql`('approved','ordering','in_transit','arrived_at_locker','picked_up_by_cleaner','set_up','delivered_to_guest')`;
const ACTIVE_STATUSES_SQL = sql`('ordering','in_transit','arrived_at_locker','picked_up_by_cleaner')`;

export type CleanerKitRow = {
  kitId: string;
  bookingId: string;
  status: string;
  guestFullName: string;
  propertyName: string;
  propertyAddress: string | null;
  checkinAt: Date;
  checkoutAt: Date;
  cleanerBriefedAt: Date | null;
  cleanerPlacedAt: Date | null;
  cleanerPhotoUrl: string | null;
};

export async function listKitsForCleaner(
  db: Database,
  cleanerId: string,
): Promise<CleanerKitRow[]> {
  const rows = await db
    .select({
      kitId: kits.id,
      bookingId: kits.bookingId,
      status: kits.status,
      guestFullName: bookings.guestFullName,
      propertyName: properties.name,
      propertyAddress: properties.addressLine,
      checkinAt: bookings.checkinAt,
      checkoutAt: bookings.checkoutAt,
      cleanerBriefedAt: kits.cleanerBriefedAt,
      cleanerPlacedAt: kits.cleanerPlacedAt,
      cleanerPhotoUrl: kits.cleanerPhotoUrl,
    })
    .from(kits)
    .innerJoin(bookings, eq(kits.bookingId, bookings.id))
    .innerJoin(properties, eq(bookings.propertyId, properties.id))
    .where(and(eq(properties.cleanerId, cleanerId), sql`${kits.status} IN ${VISIBLE_STATUSES_SQL}`))
    .orderBy(desc(bookings.checkinAt));
  return rows;
}

export type CleanerKitDetail = CleanerKitRow & {
  items: import('@premura/db').KitItem[];
  cardMessage: string | null;
  cardMessageEn: string | null;
  guestLanguage: string;
  kitDefaultPlacement: string | null;
  cleanerId: string | null;
};

export async function getKitForCleaner(
  db: Database,
  kitId: string,
  cleanerId: string,
): Promise<CleanerKitDetail | null> {
  const [row] = await db
    .select({
      kitId: kits.id,
      bookingId: kits.bookingId,
      status: kits.status,
      guestFullName: bookings.guestFullName,
      propertyName: properties.name,
      propertyAddress: properties.addressLine,
      propertyId: properties.id,
      cleanerId: properties.cleanerId,
      checkinAt: bookings.checkinAt,
      checkoutAt: bookings.checkoutAt,
      cleanerBriefedAt: kits.cleanerBriefedAt,
      cleanerPlacedAt: kits.cleanerPlacedAt,
      cleanerPhotoUrl: kits.cleanerPhotoUrl,
      items: kits.items,
      cardMessage: kits.cardMessage,
      cardMessageEn: kits.cardMessageEn,
      guestLanguage: kits.guestLanguage,
    })
    .from(kits)
    .innerJoin(bookings, eq(kits.bookingId, bookings.id))
    .innerJoin(properties, eq(bookings.propertyId, properties.id))
    .where(and(eq(kits.id, kitId), eq(properties.cleanerId, cleanerId)))
    .limit(1);
  if (!row) return null;

  const [knowledgeRow] = await db
    .select({ kitDefaultPlacement: propertyKnowledge.kitDefaultPlacement })
    .from(propertyKnowledge)
    .where(eq(propertyKnowledge.propertyId, row.propertyId))
    .limit(1);

  return {
    kitId: row.kitId,
    bookingId: row.bookingId,
    status: row.status,
    guestFullName: row.guestFullName,
    propertyName: row.propertyName,
    propertyAddress: row.propertyAddress,
    checkinAt: row.checkinAt,
    checkoutAt: row.checkoutAt,
    cleanerBriefedAt: row.cleanerBriefedAt,
    cleanerPlacedAt: row.cleanerPlacedAt,
    cleanerPhotoUrl: row.cleanerPhotoUrl,
    items: row.items,
    cardMessage: row.cardMessage,
    cardMessageEn: row.cardMessageEn,
    guestLanguage: row.guestLanguage,
    kitDefaultPlacement: knowledgeRow?.kitDefaultPlacement ?? null,
    cleanerId: row.cleanerId,
  };
}

export async function setKitSetupComplete(
  db: Database,
  kitId: string,
  cleanerId: string,
  photoUrl: string,
): Promise<{ ok: true } | { ok: false; reason: 'not_found' | 'wrong_cleaner' }> {
  const [row] = await db
    .select({ kitId: kits.id, cleanerId: properties.cleanerId })
    .from(kits)
    .innerJoin(bookings, eq(kits.bookingId, bookings.id))
    .innerJoin(properties, eq(bookings.propertyId, properties.id))
    .where(eq(kits.id, kitId))
    .limit(1);
  if (!row) return { ok: false, reason: 'not_found' };
  if (row.cleanerId !== cleanerId) return { ok: false, reason: 'wrong_cleaner' };

  const now = new Date();
  await db
    .update(kits)
    .set({
      cleanerPhotoUrl: photoUrl,
      cleanerPlacedAt: now,
      status: 'set_up',
      updatedAt: now,
    })
    .where(eq(kits.id, kitId));
  return { ok: true };
}

// Helper count per dashboard cleaner badge.
export async function countOpenKitsForCleaner(db: Database, cleanerId: string): Promise<number> {
  const rows = await db
    .select({ id: kits.id })
    .from(kits)
    .innerJoin(bookings, eq(kits.bookingId, bookings.id))
    .innerJoin(properties, eq(bookings.propertyId, properties.id))
    .where(
      and(
        eq(properties.cleanerId, cleanerId),
        isNull(kits.cleanerPlacedAt),
        sql`${kits.status} IN ${ACTIVE_STATUSES_SQL}`,
      ),
    );
  return rows.length;
}

export async function markCleanerAccepted(
  db: Database,
  cleanerId: string,
): Promise<{ updated: boolean }> {
  await db
    .update(cleaners)
    .set({ karenAccepted: true, updatedAt: new Date() })
    .where(eq(cleaners.id, cleanerId));
  return { updated: true };
}
