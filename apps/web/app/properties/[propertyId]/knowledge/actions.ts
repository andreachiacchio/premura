'use server';

import { getCurrentHostId } from '@/lib/auth';
import { getDb } from '@/lib/db';
import {
  type PropertyKnowledgePatch,
  isPropertyOwnedByHost,
  upsertPropertyKnowledge,
} from '@/lib/repositories/property-knowledge';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

// Slice 12 — Server actions per property knowledge form.
//
// Auto-save: ogni sezione invoca la sua action al blur. Atomicita'
// per sezione: solo i campi della sezione vengono passati nel patch.
// Pre-check ownership pattern slice 6 fase 6.5.

const idSchema = z.string().uuid();
const NOT_FOUND_MESSAGE = 'Property non trovata';

async function assertOwnership(propertyId: string): Promise<string> {
  const hostId = await getCurrentHostId();
  const { db } = await getDb();
  const ok = await isPropertyOwnedByHost(db, propertyId, hostId);
  if (!ok) throw new Error(NOT_FOUND_MESSAGE);
  return hostId;
}

const keyboxSchema = z.object({
  code: z.string().trim().max(64).optional(),
  instructions: z.string().trim().max(2000).optional(),
});

export async function saveKeyboxAction(propertyId: string, formData: FormData): Promise<void> {
  const id = idSchema.parse(propertyId);
  const hostId = await assertOwnership(id);
  const payload = keyboxSchema.parse({
    code: formData.get('code') ?? undefined,
    instructions: formData.get('instructions') ?? undefined,
  });
  const { db } = await getDb();
  await upsertPropertyKnowledge(db, id, hostId, {
    keybox: payload.code || payload.instructions ? payload : null,
  });
  revalidatePath(`/properties/${id}/knowledge`);
}

const wifiSchema = z.object({
  ssid: z.string().trim().max(64).optional(),
  password: z.string().trim().max(64).optional(),
  notes: z.string().trim().max(500).optional(),
});

export async function saveWifiAction(propertyId: string, formData: FormData): Promise<void> {
  const id = idSchema.parse(propertyId);
  const hostId = await assertOwnership(id);
  const payload = wifiSchema.parse({
    ssid: formData.get('ssid') ?? undefined,
    password: formData.get('password') ?? undefined,
    notes: formData.get('notes') ?? undefined,
  });
  const { db } = await getDb();
  const isEmpty = !payload.ssid && !payload.password && !payload.notes;
  await upsertPropertyKnowledge(db, id, hostId, {
    wifi: isEmpty ? null : payload,
  });
  revalidatePath(`/properties/${id}/knowledge`);
}

const parkingSchema = z.object({
  available: z.boolean().optional(),
  type: z.enum(['street', 'garage', 'private', 'paid', 'none']).optional(),
  instructions: z.string().trim().max(2000).optional(),
});

export async function saveParkingAction(propertyId: string, formData: FormData): Promise<void> {
  const id = idSchema.parse(propertyId);
  const hostId = await assertOwnership(id);
  const rawAvailable = formData.get('available');
  const payload = parkingSchema.parse({
    available: rawAvailable === 'true' ? true : rawAvailable === 'false' ? false : undefined,
    type: (formData.get('type') as string) ?? undefined,
    instructions: formData.get('instructions') ?? undefined,
  });
  const { db } = await getDb();
  const isEmpty = payload.available === undefined && !payload.type && !payload.instructions;
  await upsertPropertyKnowledge(db, id, hostId, {
    parking: isEmpty ? null : payload,
  });
  revalidatePath(`/properties/${id}/knowledge`);
}

const houseRulesSchema = z.object({
  quietHoursStart: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional()
    .or(z.literal('')),
  quietHoursEnd: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional()
    .or(z.literal('')),
  smokingAllowed: z.boolean().optional(),
  petsAllowed: z.boolean().optional(),
  additionalNotes: z.string().trim().max(2000).optional(),
});

export async function saveHouseRulesAction(propertyId: string, formData: FormData): Promise<void> {
  const id = idSchema.parse(propertyId);
  const hostId = await assertOwnership(id);
  const payload = houseRulesSchema.parse({
    quietHoursStart: formData.get('quietHoursStart') ?? undefined,
    quietHoursEnd: formData.get('quietHoursEnd') ?? undefined,
    smokingAllowed:
      formData.get('smokingAllowed') === 'on' || formData.get('smokingAllowed') === 'true',
    petsAllowed: formData.get('petsAllowed') === 'on' || formData.get('petsAllowed') === 'true',
    additionalNotes: formData.get('additionalNotes') ?? undefined,
  });
  const cleaned = {
    quietHoursStart: payload.quietHoursStart || undefined,
    quietHoursEnd: payload.quietHoursEnd || undefined,
    smokingAllowed: payload.smokingAllowed,
    petsAllowed: payload.petsAllowed,
    additionalNotes: payload.additionalNotes,
  };
  const { db } = await getDb();
  const isEmpty =
    !cleaned.quietHoursStart &&
    !cleaned.quietHoursEnd &&
    !cleaned.additionalNotes &&
    cleaned.smokingAllowed === undefined &&
    cleaned.petsAllowed === undefined;
  await upsertPropertyKnowledge(db, id, hostId, {
    houseRules: isEmpty ? null : cleaned,
  });
  revalidatePath(`/properties/${id}/knowledge`);
}

const emergencyContactsSchema = z.array(
  z.object({
    name: z.string().trim().min(1).max(128),
    phone: z.string().trim().min(1).max(64),
    role: z.string().trim().min(1).max(64),
  }),
);

export async function saveEmergencyContactsAction(
  propertyId: string,
  contacts: unknown,
): Promise<void> {
  const id = idSchema.parse(propertyId);
  const hostId = await assertOwnership(id);
  const parsed = emergencyContactsSchema.parse(contacts);
  const { db } = await getDb();
  await upsertPropertyKnowledge(db, id, hostId, { emergencyContacts: parsed });
  revalidatePath(`/properties/${id}/knowledge`);
}

const nearbyEssentialsSchema = z.array(
  z.object({
    category: z.enum(['pharmacy', 'supermarket', 'restaurant', 'transport', 'other']),
    name: z.string().trim().min(1).max(128),
    address: z.string().trim().max(255).optional(),
    distanceM: z.coerce.number().int().min(0).max(50000).optional(),
  }),
);

export async function saveNearbyEssentialsAction(
  propertyId: string,
  essentials: unknown,
): Promise<void> {
  const id = idSchema.parse(propertyId);
  const hostId = await assertOwnership(id);
  const parsed = nearbyEssentialsSchema.parse(essentials);
  const { db } = await getDb();
  await upsertPropertyKnowledge(db, id, hostId, { nearbyEssentials: parsed });
  revalidatePath(`/properties/${id}/knowledge`);
}

const additionalInfoSchema = z.string().trim().max(5000).optional();

export async function saveAdditionalInfoAction(
  propertyId: string,
  formData: FormData,
): Promise<void> {
  const id = idSchema.parse(propertyId);
  const hostId = await assertOwnership(id);
  const value = additionalInfoSchema.parse(formData.get('additionalInfo') ?? undefined);
  const { db } = await getDb();
  await upsertPropertyKnowledge(db, id, hostId, {
    additionalInfo: value && value.length > 0 ? value : null,
  });
  revalidatePath(`/properties/${id}/knowledge`);
}

export type { PropertyKnowledgePatch };
