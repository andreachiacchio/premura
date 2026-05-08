'use server';

import { getCurrentHostId } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { normalizePhone } from '@/lib/phone-normalize';
import { clearBookingGuestPhone, setBookingGuestPhone } from '@/lib/repositories/upcoming-checkins';
import { logAgentAction } from '@premura/agents';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

// Slice A — Server actions per la dashboard "Prossimi check-in".
//
// Audit: ogni set/clear logga in agent_actions tipo
// 'guest_phone_added' / 'guest_phone_removed' (riusiamo l'infrastruttura
// slice 8.2). Cosi' Andrea puo' fare query "quanti host stanno
// effettivamente attivando booking via slice A" senza tracking
// addizionale.

const idSchema = z.string().uuid();
const phoneRawSchema = z.string().trim().min(1).max(64);

export type SetPhoneActionResult =
  | { ok: true; bookingId: string; premuraActiveAt: string }
  | { ok: false; reason: 'invalid_phone' | 'not_found' | 'wrong_host'; detail?: string };

export async function setBookingGuestPhoneAction(
  bookingId: string,
  rawPhone: string,
): Promise<SetPhoneActionResult> {
  const id = idSchema.parse(bookingId);
  const raw = phoneRawSchema.parse(rawPhone);

  const normalized = normalizePhone(raw);
  if (!normalized.ok) {
    return { ok: false, reason: 'invalid_phone', detail: normalized.reason };
  }

  const hostId = await getCurrentHostId();
  const { db } = await getDb();
  const result = await setBookingGuestPhone(db, id, hostId, normalized.e164);

  if (!result.ok) {
    return { ok: false, reason: result.reason };
  }

  // Log fire-and-forget. Niente await: failure logging non blocca l'UI.
  logAgentAction(db, {
    hostId,
    agent: 'system',
    actionType: 'guest_phone_added',
    bookingId: id,
    inputSummary: { source: 'manual', e164_len: normalized.e164.length },
    fn: async () => ({
      output: { e164_set: true } as Record<string, unknown>,
    }),
  }).catch((err) => {
    console.warn('[upcoming-checkins] log agent_action failed', err);
  });

  revalidatePath('/dashboard');
  revalidatePath('/dashboard/upcoming-checkins');

  return {
    ok: true,
    bookingId: id,
    premuraActiveAt: result.premuraActiveAt.toISOString(),
  };
}

export type ClearPhoneActionResult =
  | { ok: true }
  | { ok: false; reason: 'not_found' | 'wrong_host' };

export async function clearBookingGuestPhoneAction(
  bookingId: string,
): Promise<ClearPhoneActionResult> {
  const id = idSchema.parse(bookingId);
  const hostId = await getCurrentHostId();
  const { db } = await getDb();
  const result = await clearBookingGuestPhone(db, id, hostId);
  if (!result.ok) return { ok: false, reason: result.reason };

  logAgentAction(db, {
    hostId,
    agent: 'system',
    actionType: 'guest_phone_removed',
    bookingId: id,
    fn: async () => ({ output: { e164_cleared: true } as Record<string, unknown> }),
  }).catch((err) => {
    console.warn('[upcoming-checkins] log agent_action failed', err);
  });

  revalidatePath('/dashboard');
  revalidatePath('/dashboard/upcoming-checkins');

  return { ok: true };
}
