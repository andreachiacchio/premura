'use server';

import { getCurrentHostId } from '@/lib/auth';
import { getDb } from '@/lib/db';
import {
  approveKit,
  getKitForHost,
  getKitIdForBooking,
  modifyKit,
  rejectKit,
  toggleItemExecuted,
  updateKitStatus,
} from '@/lib/repositories/kits';
import {
  loadKitNotificationContext,
  logAgentAction,
  sendCleanerBrief,
  sendKitEmail,
  triggerKitProposal,
} from '@premura/agents';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

// Slice C — Server actions /dashboard/kits.
//
// Tutte verificano ownership host via getCurrentHostId() + repository
// queries che join properties.host_id. Audit via logAgentAction.

const idSchema = z.string().uuid();

// ─── 1. Generate (manual trigger) ─────────────────────────────────
export type GenerateKitActionResult =
  | { ok: true; kitId: string; itemCount: number; totalEstimatedEur: number }
  | {
      ok: false;
      reason: 'wrong_host' | 'no_survey' | 'no_booking' | 'already_proposed' | 'generator_error';
      detail?: string;
    };

export async function generateKitProposalAction(
  bookingId: string,
): Promise<GenerateKitActionResult> {
  const id = idSchema.parse(bookingId);
  const hostId = await getCurrentHostId();
  const { db } = await getDb();

  // Ownership check: verifica che il booking appartenga all'host.
  const existingKitId = await getKitIdForBooking(db, id, hostId);
  if (existingKitId === null) {
    // Booking trovato ma diverso host? Tentiamo lookup booking diretto
    // per capire se esiste senza match.
    const { db: dbCheck } = await getDb();
    const { bookings, properties } = await import('@premura/db');
    const { eq } = await import('drizzle-orm');
    const [bookingRow] = await dbCheck
      .select({ propertyHostId: properties.hostId })
      .from(bookings)
      .innerJoin(properties, eq(bookings.propertyId, properties.id))
      .where(eq(bookings.id, id))
      .limit(1);
    if (!bookingRow) return { ok: false, reason: 'no_booking' };
    if (bookingRow.propertyHostId !== hostId) return { ok: false, reason: 'wrong_host' };
    // Caso normale: booking dell'host ma nessun kit. triggerKitProposal lo crea.
  }

  const result = await triggerKitProposal(db, id);

  if (result.status === 'skipped_no_booking') return { ok: false, reason: 'no_booking' };
  if (result.status === 'skipped_no_survey') return { ok: false, reason: 'no_survey' };
  if (result.status === 'skipped_already_proposed') {
    return { ok: false, reason: 'already_proposed', detail: result.kitId };
  }
  if (result.status === 'generator_error') {
    return { ok: false, reason: 'generator_error', detail: result.error };
  }

  // Email founder kit_proposed (fire-and-forget).
  sendProposedEmailFireAndForget(db, result.kitId).catch(() => {});

  // Audit.
  logAgentAction(db, {
    hostId,
    agent: 'kit_composer',
    actionType: 'kit_proposed',
    bookingId: id,
    inputSummary: { manual: true },
    fn: async () => ({
      output: {
        kit_id: result.kitId,
        item_count: result.itemCount,
        total_estimated_eur: result.totalEstimatedEur,
        within_budget: result.withinBudget,
      } as Record<string, unknown>,
    }),
  }).catch(() => {});

  revalidatePath('/dashboard/kits');
  revalidatePath(`/dashboard/kits/${result.kitId}`);

  return {
    ok: true,
    kitId: result.kitId,
    itemCount: result.itemCount,
    totalEstimatedEur: result.totalEstimatedEur,
  };
}

// ─── 2. Approve ──────────────────────────────────────────────────
export type ApproveKitActionResult =
  | { ok: true }
  | { ok: false; reason: 'not_found' | 'invalid_status' };

export async function approveKitAction(kitId: string): Promise<ApproveKitActionResult> {
  const id = idSchema.parse(kitId);
  const hostId = await getCurrentHostId();
  const { db } = await getDb();
  const result = await approveKit(db, id, hostId);
  if (!result.ok) return result;

  sendApprovedEmailFireAndForget(db, id).catch(() => {});

  logAgentAction(db, {
    hostId,
    agent: 'system',
    actionType: 'kit_approved',
    inputSummary: { kit_id: id },
    fn: async () => ({ output: { approved: true } as Record<string, unknown> }),
  }).catch(() => {});

  revalidatePath('/dashboard/kits');
  revalidatePath(`/dashboard/kits/${id}`);
  return { ok: true };
}

// ─── 3. Reject ────────────────────────────────────────────────────
const rejectSchema = z.object({
  reason: z.string().min(2).max(500),
});

export type RejectKitActionResult =
  | { ok: true }
  | { ok: false; reason: 'not_found' | 'invalid_status' | 'invalid_payload' };

export async function rejectKitAction(
  kitId: string,
  rejectionReason: string,
): Promise<RejectKitActionResult> {
  const id = idSchema.parse(kitId);
  let parsed: z.infer<typeof rejectSchema>;
  try {
    parsed = rejectSchema.parse({ reason: rejectionReason });
  } catch {
    return { ok: false, reason: 'invalid_payload' };
  }
  const hostId = await getCurrentHostId();
  const { db } = await getDb();
  const result = await rejectKit(db, id, hostId, parsed.reason);
  if (!result.ok) return result;

  logAgentAction(db, {
    hostId,
    agent: 'system',
    actionType: 'kit_rejected',
    inputSummary: { kit_id: id, reason_len: parsed.reason.length },
    fn: async () => ({ output: { rejected: true } as Record<string, unknown> }),
  }).catch(() => {});

  revalidatePath('/dashboard/kits');
  revalidatePath(`/dashboard/kits/${id}`);
  return { ok: true };
}

// ─── 4. Modify items + theme + card ────────────────────────────────
const itemSchema = z.object({
  taxonomyKey: z.string().min(1).max(80),
  specificDescription: z.string().min(1).max(200),
  quantity: z.number().int().min(1).max(20),
  estimatedPriceEur: z.number().min(0).max(100),
  fonte: z.enum(['amazon', 'glovo', 'manual_print', 'manual_write']),
  leadTime: z.enum(['same_day', '1_day', '2_days', '1_hour']),
  amazonSearchHint: z.string().max(200).optional(),
  glovoSearchHint: z.string().max(200).optional(),
  reasoning: z.string().min(1).max(500).optional(),
  executedAt: z.string().nullable().optional(),
});

const modifySchema = z.object({
  items: z.array(itemSchema).min(1).max(8),
  theme: z.string().min(1).max(200).optional(),
  cardMessage: z.string().min(1).max(300).optional(),
  cardMessageEn: z.string().min(1).max(300).optional(),
});

export type ModifyKitActionResult =
  | { ok: true }
  | { ok: false; reason: 'not_found' | 'invalid_status' | 'invalid_payload'; detail?: string };

export async function modifyKitItemsAction(
  kitId: string,
  rawPayload: unknown,
): Promise<ModifyKitActionResult> {
  const id = idSchema.parse(kitId);
  let parsed: z.infer<typeof modifySchema>;
  try {
    parsed = modifySchema.parse(rawPayload);
  } catch (err) {
    return {
      ok: false,
      reason: 'invalid_payload',
      detail: err instanceof Error ? err.message : 'invalid',
    };
  }
  const hostId = await getCurrentHostId();
  const { db } = await getDb();
  const result = await modifyKit(db, id, hostId, {
    items: parsed.items,
    theme: parsed.theme,
    cardMessage: parsed.cardMessage,
    cardMessageEn: parsed.cardMessageEn,
  });
  if (!result.ok) return result;

  logAgentAction(db, {
    hostId,
    agent: 'system',
    actionType: 'kit_modified',
    inputSummary: { kit_id: id, item_count: parsed.items.length },
    fn: async () => ({ output: { modified: true } as Record<string, unknown> }),
  }).catch(() => {});

  revalidatePath(`/dashboard/kits/${id}`);
  revalidatePath('/dashboard/kits');
  return { ok: true };
}

// ─── 5. Toggle item executed (per item, su /execute) ──────────────
export type ToggleItemActionResult =
  | { ok: true; allExecuted: boolean }
  | { ok: false; reason: 'not_found' | 'invalid_index' };

export async function toggleItemExecutedAction(
  kitId: string,
  itemIndex: number,
): Promise<ToggleItemActionResult> {
  const id = idSchema.parse(kitId);
  const idx = z.number().int().min(0).max(7).parse(itemIndex);
  const hostId = await getCurrentHostId();
  const { db } = await getDb();
  const result = await toggleItemExecuted(db, id, hostId, idx);
  if (!result.ok) return result;
  revalidatePath(`/dashboard/kits/${id}/execute`);
  return { ok: true, allExecuted: result.allExecuted };
}

// ─── 6. Mark cleaner briefed (= "Tutto ordinato → notifica Karen") ─
export type MarkBriefedActionResult =
  // messageId null = invio simulato (WHATSAPP_DRY_RUN) o bloccato dal kill
  // switch: il brief e' stato composto ma non consegnato a Karen.
  | { ok: true; messageId: string | null }
  | {
      ok: false;
      reason:
        | 'not_found'
        | 'wrong_host'
        | 'invalid_status'
        | 'no_cleaner'
        | 'already_briefed'
        | 'send_error';
      detail?: string;
    };

export async function markCleanerBriefedAction(kitId: string): Promise<MarkBriefedActionResult> {
  const id = idSchema.parse(kitId);
  const hostId = await getCurrentHostId();
  const { db } = await getDb();
  const kit = await getKitForHost(db, id, hostId);
  if (!kit) return { ok: false, reason: 'not_found' };
  if (kit.status !== 'approved' && kit.status !== 'ordering') {
    return { ok: false, reason: 'invalid_status' };
  }

  const result = await sendCleanerBrief(db, id);
  if (result.status === 'skipped_no_kit') return { ok: false, reason: 'not_found' };
  if (result.status === 'skipped_no_cleaner') return { ok: false, reason: 'no_cleaner' };
  if (result.status === 'skipped_already_briefed') {
    return { ok: false, reason: 'already_briefed' };
  }
  if (result.status === 'send_error') {
    return { ok: false, reason: 'send_error', detail: result.error };
  }

  logAgentAction(db, {
    hostId,
    agent: 'system',
    actionType: 'cleaner_briefed',
    inputSummary: { kit_id: id, message_id: result.messageId },
    fn: async () => ({ output: { briefed: true } as Record<string, unknown> }),
  }).catch(() => {});

  revalidatePath(`/dashboard/kits/${id}`);
  revalidatePath(`/dashboard/kits/${id}/execute`);
  revalidatePath('/dashboard/kits');
  return { ok: true, messageId: result.messageId };
}

// ─── 7. Update generic status (in_transit / set_up / delivered) ────
export type UpdateStatusActionResult =
  | { ok: true }
  | { ok: false; reason: 'not_found' | 'invalid_transition' };

const transitionableStatuses = z.enum([
  'in_transit',
  'arrived_at_locker',
  'picked_up_by_cleaner',
  'set_up',
  'delivered_to_guest',
]);

export async function updateKitStatusAction(
  kitId: string,
  newStatus: string,
  extra: { cleanerPhotoUrl?: string | null } = {},
): Promise<UpdateStatusActionResult> {
  const id = idSchema.parse(kitId);
  const status = transitionableStatuses.parse(newStatus);
  const hostId = await getCurrentHostId();
  const { db } = await getDb();
  const result = await updateKitStatus(db, id, hostId, status, extra);
  if (!result.ok) return result;

  // Email founder per certi stati.
  if (status === 'set_up') {
    sendPhotoUploadedEmailFireAndForget(db, id, extra.cleanerPhotoUrl ?? null).catch(() => {});
  }

  logAgentAction(db, {
    hostId,
    agent: 'system',
    actionType: 'kit_status_updated',
    inputSummary: { kit_id: id, to_status: status },
    fn: async () => ({ output: { updated: true } as Record<string, unknown> }),
  }).catch(() => {});

  revalidatePath(`/dashboard/kits/${id}`);
  revalidatePath('/dashboard/kits');
  return { ok: true };
}

// ─── Helpers email fire-and-forget ────────────────────────────────
async function sendProposedEmailFireAndForget(
  db: Awaited<ReturnType<typeof getDb>>['db'],
  kitId: string,
): Promise<void> {
  const ctx = await loadKitNotificationContext(db, kitId);
  if (!ctx) return;
  await sendKitEmail('kit_proposed', ctx);
}

async function sendApprovedEmailFireAndForget(
  db: Awaited<ReturnType<typeof getDb>>['db'],
  kitId: string,
): Promise<void> {
  const ctx = await loadKitNotificationContext(db, kitId);
  if (!ctx) return;
  await sendKitEmail('kit_approved', ctx);
}

async function sendPhotoUploadedEmailFireAndForget(
  db: Awaited<ReturnType<typeof getDb>>['db'],
  kitId: string,
  photoUrl: string | null,
): Promise<void> {
  const ctx = await loadKitNotificationContext(db, kitId);
  if (!ctx) return;
  await sendKitEmail('cleaner_uploaded_photo', ctx, { photoUrl });
}
