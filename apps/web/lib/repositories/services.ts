import { type Database, properties, providers, services } from '@premura/db';
import { and, asc, eq } from 'drizzle-orm';
import type { ServiceFormValues, ServiceRow } from '../services-form';
import { slugify } from '../services-form';

export type { ServiceFormValues, ServiceRow } from '../services-form';

// Repository sezione Servizi per struttura (30/07): l'host registra i
// suoi servizi (nome, prezzo, descrizione, foto, fornitore collegato).
// La tabella services esisteva gia' — questa e' la prima superficie di
// gestione dall'interfaccia. Senza catalogo, il punto 3 del flusso
// canonico (guest app con i servizi) non esiste.
//
// Ownership: ogni operazione passa dalla property e verifica che
// appartenga all'host. Stesso pattern di upcoming-checkins.

async function assertPropertyOwnership(
  db: Database,
  hostId: string,
  propertyId: string,
): Promise<{ id: string; name: string } | null> {
  const [row] = await db
    .select({ id: properties.id, name: properties.name })
    .from(properties)
    .where(and(eq(properties.id, propertyId), eq(properties.hostId, hostId)))
    .limit(1);
  return row ?? null;
}

export async function listServicesForProperty(
  db: Database,
  hostId: string,
  propertyId: string,
): Promise<{ property: { id: string; name: string }; services: ServiceRow[] } | null> {
  const property = await assertPropertyOwnership(db, hostId, propertyId);
  if (!property) return null;

  const rows = await db
    .select({
      id: services.id,
      slug: services.slug,
      category: services.category,
      titleEn: services.titleEn,
      titleIt: services.titleIt,
      descriptionEn: services.descriptionEn,
      descriptionIt: services.descriptionIt,
      photoUrl: services.photoUrl,
      salePriceEur: services.salePriceEur,
      priceOnRequest: services.priceOnRequest,
      providerId: services.providerId,
      providerName: providers.name,
      isActive: services.isActive,
      sortOrder: services.sortOrder,
    })
    .from(services)
    .leftJoin(providers, eq(providers.id, services.providerId))
    .where(eq(services.propertyId, propertyId))
    .orderBy(asc(services.sortOrder), asc(services.titleEn));

  return { property, services: rows };
}

export async function listProvidersForHost(
  db: Database,
  hostId: string,
): Promise<Array<{ id: string; name: string }>> {
  return db
    .select({ id: providers.id, name: providers.name })
    .from(providers)
    .where(eq(providers.hostId, hostId))
    .orderBy(asc(providers.name));
}

function normalizePrice(raw: string | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(',', '.');
  return cleaned.length > 0 ? cleaned : null;
}

function emptyToNull(raw: string | undefined): string | null {
  const trimmed = raw?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

export type MutateServiceResult =
  | { ok: true; serviceId: string }
  | { ok: false; reason: 'not_found' | 'wrong_host' | 'slug_conflict' };

export async function createService(
  db: Database,
  hostId: string,
  propertyId: string,
  values: ServiceFormValues,
): Promise<MutateServiceResult> {
  const property = await assertPropertyOwnership(db, hostId, propertyId);
  if (!property) return { ok: false, reason: 'wrong_host' };

  // Slug dal titolo, con suffisso progressivo sui conflitti (lo slug e'
  // unico per property e stabile nel tempo).
  const base = slugify(values.titleEn);
  const existing = await db
    .select({ slug: services.slug })
    .from(services)
    .where(eq(services.propertyId, propertyId));
  const taken = new Set(existing.map((r) => r.slug));
  let slug = base;
  for (let n = 2; taken.has(slug); n += 1) {
    if (n > 50) return { ok: false, reason: 'slug_conflict' };
    slug = `${base}-${n}`;
  }

  const [inserted] = await db
    .insert(services)
    .values({
      propertyId,
      slug,
      category: values.category,
      titleEn: values.titleEn,
      titleIt: emptyToNull(values.titleIt),
      descriptionEn: emptyToNull(values.descriptionEn),
      descriptionIt: emptyToNull(values.descriptionIt),
      photoUrl: emptyToNull(values.photoUrl),
      salePriceEur: values.priceOnRequest ? null : normalizePrice(values.salePriceEur),
      priceOnRequest: values.priceOnRequest,
      providerId: emptyToNull(values.providerId),
    })
    .returning({ id: services.id });

  if (!inserted) return { ok: false, reason: 'slug_conflict' };
  return { ok: true, serviceId: inserted.id };
}

export async function updateService(
  db: Database,
  hostId: string,
  serviceId: string,
  values: ServiceFormValues,
): Promise<MutateServiceResult> {
  const [row] = await db
    .select({ id: services.id, ownerHostId: properties.hostId })
    .from(services)
    .innerJoin(properties, eq(properties.id, services.propertyId))
    .where(eq(services.id, serviceId))
    .limit(1);
  if (!row) return { ok: false, reason: 'not_found' };
  if (row.ownerHostId !== hostId) return { ok: false, reason: 'wrong_host' };

  await db
    .update(services)
    .set({
      category: values.category,
      titleEn: values.titleEn,
      titleIt: emptyToNull(values.titleIt),
      descriptionEn: emptyToNull(values.descriptionEn),
      descriptionIt: emptyToNull(values.descriptionIt),
      photoUrl: emptyToNull(values.photoUrl),
      salePriceEur: values.priceOnRequest ? null : normalizePrice(values.salePriceEur),
      priceOnRequest: values.priceOnRequest,
      providerId: emptyToNull(values.providerId),
      updatedAt: new Date(),
    })
    .where(eq(services.id, serviceId));

  return { ok: true, serviceId };
}

export async function setServiceActive(
  db: Database,
  hostId: string,
  serviceId: string,
  isActive: boolean,
): Promise<MutateServiceResult> {
  const [row] = await db
    .select({ id: services.id, ownerHostId: properties.hostId })
    .from(services)
    .innerJoin(properties, eq(properties.id, services.propertyId))
    .where(eq(services.id, serviceId))
    .limit(1);
  if (!row) return { ok: false, reason: 'not_found' };
  if (row.ownerHostId !== hostId) return { ok: false, reason: 'wrong_host' };

  await db
    .update(services)
    .set({ isActive, updatedAt: new Date() })
    .where(eq(services.id, serviceId));
  return { ok: true, serviceId };
}
