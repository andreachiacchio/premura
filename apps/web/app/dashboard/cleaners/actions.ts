'use server';

import { getCurrentHostId } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { normalizePhone } from '@/lib/phone-normalize';
import {
  type CreateCleanerInput,
  type UpdateCleanerInput,
  assignCleanerToProperty,
  createCleaner,
  deactivateCleaner,
  getCleanerForHost,
  reactivateCleaner,
  updateCleaner,
} from '@/lib/repositories/cleaners';
import { sendCleanerMagicLink } from '@premura/agents';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

// Slice F — Server actions cleaner CRUD.
// Tutte ownership-verified via repository (hostId match).

const idSchema = z.string().uuid();

const baseFields = {
  fullName: z.string().min(2).max(255),
  whatsappNumber: z.string().min(5).max(64),
  email: z.string().email().max(255).optional().nullable().or(z.literal('')),
  deliveryAddress: z.string().min(3).max(500),
  pickupPointCode: z.string().max(64).optional().nullable().or(z.literal('')),
  perKitFeeEur: z
    .number()
    .min(0)
    .max(50)
    .or(z.string().regex(/^\d+(\.\d{1,2})?$/))
    .optional(),
  payoutMethod: z.enum(['cash', 'stripe_connect']).optional(),
  payoutIban: z.string().max(34).optional().nullable().or(z.literal('')),
  languagePreferred: z.enum(['it', 'en', 'es']).optional(),
  notes: z.string().max(2000).optional().nullable().or(z.literal('')),
};

const createSchema = z.object(baseFields);
const updateSchema = z.object({
  fullName: baseFields.fullName.optional(),
  whatsappNumber: baseFields.whatsappNumber.optional(),
  email: baseFields.email,
  deliveryAddress: baseFields.deliveryAddress.optional(),
  pickupPointCode: baseFields.pickupPointCode,
  perKitFeeEur: baseFields.perKitFeeEur,
  payoutMethod: baseFields.payoutMethod,
  payoutIban: baseFields.payoutIban,
  languagePreferred: baseFields.languagePreferred,
  notes: baseFields.notes,
});

export type CreateCleanerActionResult =
  | { ok: true; cleanerId: string }
  | { ok: false; reason: 'invalid_phone' | 'invalid_payload'; detail?: string };

export async function createCleanerAction(raw: unknown): Promise<CreateCleanerActionResult> {
  let parsed: z.infer<typeof createSchema>;
  try {
    parsed = createSchema.parse(raw);
  } catch (err) {
    return {
      ok: false,
      reason: 'invalid_payload',
      detail: err instanceof Error ? err.message : 'invalid',
    };
  }
  const phone = normalizePhone(parsed.whatsappNumber);
  if (!phone.ok) {
    return { ok: false, reason: 'invalid_phone', detail: phone.reason };
  }
  const hostId = await getCurrentHostId();
  const { db } = await getDb();
  const input: CreateCleanerInput = {
    fullName: parsed.fullName.trim(),
    whatsappNumber: phone.e164,
    email: emptyToNull(parsed.email),
    deliveryAddress: parsed.deliveryAddress.trim(),
    pickupPointCode: emptyToNull(parsed.pickupPointCode),
    perKitFeeEur:
      parsed.perKitFeeEur !== undefined
        ? typeof parsed.perKitFeeEur === 'number'
          ? parsed.perKitFeeEur.toFixed(2)
          : parsed.perKitFeeEur
        : undefined,
    payoutMethod: parsed.payoutMethod,
    payoutIban: emptyToNull(parsed.payoutIban),
    languagePreferred: parsed.languagePreferred,
    notes: emptyToNull(parsed.notes),
  };
  const created = await createCleaner(db, hostId, input);
  revalidatePath('/dashboard');
  revalidatePath('/dashboard/cleaners');
  return { ok: true, cleanerId: created.id };
}

export type UpdateCleanerActionResult =
  | { ok: true }
  | { ok: false; reason: 'invalid_phone' | 'invalid_payload' | 'not_found'; detail?: string };

export async function updateCleanerAction(
  cleanerId: string,
  raw: unknown,
): Promise<UpdateCleanerActionResult> {
  const id = idSchema.parse(cleanerId);
  let parsed: z.infer<typeof updateSchema>;
  try {
    parsed = updateSchema.parse(raw);
  } catch (err) {
    return {
      ok: false,
      reason: 'invalid_payload',
      detail: err instanceof Error ? err.message : 'invalid',
    };
  }
  const hostId = await getCurrentHostId();
  const { db } = await getDb();

  const input: UpdateCleanerInput = {};
  if (parsed.fullName !== undefined) input.fullName = parsed.fullName.trim();
  if (parsed.whatsappNumber !== undefined) {
    const phone = normalizePhone(parsed.whatsappNumber);
    if (!phone.ok) return { ok: false, reason: 'invalid_phone', detail: phone.reason };
    input.whatsappNumber = phone.e164;
  }
  if (parsed.email !== undefined) input.email = emptyToNull(parsed.email);
  if (parsed.deliveryAddress !== undefined) input.deliveryAddress = parsed.deliveryAddress.trim();
  if (parsed.pickupPointCode !== undefined)
    input.pickupPointCode = emptyToNull(parsed.pickupPointCode);
  if (parsed.perKitFeeEur !== undefined) {
    input.perKitFeeEur =
      typeof parsed.perKitFeeEur === 'number'
        ? parsed.perKitFeeEur.toFixed(2)
        : parsed.perKitFeeEur;
  }
  if (parsed.payoutMethod !== undefined) input.payoutMethod = parsed.payoutMethod;
  if (parsed.payoutIban !== undefined) input.payoutIban = emptyToNull(parsed.payoutIban);
  if (parsed.languagePreferred !== undefined) input.languagePreferred = parsed.languagePreferred;
  if (parsed.notes !== undefined) input.notes = emptyToNull(parsed.notes);

  const result = await updateCleaner(db, id, hostId, input);
  if (!result.ok) return result;

  revalidatePath('/dashboard/cleaners');
  revalidatePath(`/dashboard/cleaners/${id}`);
  return { ok: true };
}

export type DeactivateCleanerActionResult = { ok: true } | { ok: false; reason: 'not_found' };

export async function deactivateCleanerAction(
  cleanerId: string,
): Promise<DeactivateCleanerActionResult> {
  const id = idSchema.parse(cleanerId);
  const hostId = await getCurrentHostId();
  const { db } = await getDb();
  const result = await deactivateCleaner(db, id, hostId);
  if (!result.ok) return result;
  revalidatePath('/dashboard');
  revalidatePath('/dashboard/cleaners');
  revalidatePath(`/dashboard/cleaners/${id}`);
  return { ok: true };
}

export async function reactivateCleanerAction(
  cleanerId: string,
): Promise<DeactivateCleanerActionResult> {
  const id = idSchema.parse(cleanerId);
  const hostId = await getCurrentHostId();
  const { db } = await getDb();
  const result = await reactivateCleaner(db, id, hostId);
  if (!result.ok) return result;
  revalidatePath('/dashboard');
  revalidatePath('/dashboard/cleaners');
  revalidatePath(`/dashboard/cleaners/${id}`);
  return { ok: true };
}

export type AssignCleanerActionResult =
  | { ok: true }
  | { ok: false; reason: 'not_found' | 'wrong_host' };

export async function assignCleanerToPropertyAction(
  propertyId: string,
  cleanerId: string | null,
): Promise<AssignCleanerActionResult> {
  const pid = idSchema.parse(propertyId);
  const cid = cleanerId === null ? null : idSchema.parse(cleanerId);
  const hostId = await getCurrentHostId();
  const { db } = await getDb();
  const result = await assignCleanerToProperty(db, pid, cid, hostId);
  if (!result.ok) return result;
  revalidatePath('/dashboard/cleaners');
  if (cid) revalidatePath(`/dashboard/cleaners/${cid}`);
  return { ok: true };
}

// ─── Slice D — Magic link via WhatsApp ────────────────────────────

export type SendWelcomeWaResult =
  | { ok: true; messageId: string; url: string }
  | { ok: false; reason: 'not_found' | 'send_error'; detail?: string };

export async function sendCleanerWelcomeWaAction(cleanerId: string): Promise<SendWelcomeWaResult> {
  const id = idSchema.parse(cleanerId);
  const hostId = await getCurrentHostId();
  const { db } = await getDb();
  const cleaner = await getCleanerForHost(db, id, hostId);
  if (!cleaner) return { ok: false, reason: 'not_found' };

  const result = await sendCleanerMagicLink(db, id);
  if (result.status === 'skipped_no_cleaner') return { ok: false, reason: 'not_found' };
  if (result.status === 'send_error') {
    return { ok: false, reason: 'send_error', detail: result.error };
  }

  revalidatePath(`/dashboard/cleaners/${id}`);
  return { ok: true, messageId: result.messageId, url: result.url };
}

function emptyToNull(s: string | null | undefined): string | null {
  if (s === undefined || s === null) return null;
  if (s.trim() === '') return null;
  return s;
}
