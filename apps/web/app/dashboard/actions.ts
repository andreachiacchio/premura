'use server';

import { completeBookingManual, skipBookingCompletion, triggerIcalPollNow } from '@/lib/api';
import { getCurrentAccessToken, getCurrentHostId } from '@/lib/auth';
import { getDb } from '@/lib/db';
import {
  confirmCancellation,
  dismissCancellation,
} from '@/lib/repositories/possible-cancellations';
import { getOrCreateDeflectionDraft, markDeflectionSent } from '@/lib/deflection-draft';
import { composeGuestInvite } from '@/lib/guest-invite';
import { findOwnership } from '@/lib/repositories/bookings';
import { findHostWaNumber } from '@/lib/repositories/hosts';
import { createProperty } from '@/lib/repositories/properties';
import { approveAndSendReplyDraft, rejectReplyDraft } from '@/lib/repositories/reply-drafts';
import { bookings, properties } from '@premura/db';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

// Server actions per la dashboard host (M2a.4 slice 5 sezione E).
//
// Le firme rispecchiano cio' che CompleteBookingDialog si aspetta via
// prop: completeBookingAction prende FormData (progressive enhancement
// nativo Next), skipBookingAction prende solo l'id.
//
// Validazione zod inline qui prima di inoltrare alle mutazioni HTTP
// dell'API Fastify (apps/api/src/api/bookings.ts). Schema duplicato
// rispetto al server: vedi docs/KNOWN-LIMITS.md sezione 20 per il debito
// tecnico (refactor proposto: estrarre in packages/shared).
//
// Slice 6 fase 6.5: pre-check ownership via findOwnership prima di
// inoltrare all'API. Difesa applicativa contro modifica booking
// altrui. Fix architetturale (JWT validation Fastify) in slice 6.5
// dedicato.

const idSchema = z.string().uuid();

// Errore generico volutamente identico per "booking non esiste" e
// "booking di altro host": evita di rivelare l'esistenza di booking
// altrui via 404 vs 403 differenziati.
const NOT_FOUND_MESSAGE = 'Booking non trovata';

async function assertOwnership(bookingId: string): Promise<void> {
  const currentHostId = await getCurrentHostId();
  const { db } = await getDb();
  const ownership = await findOwnership({ db, bookingId });
  if (!ownership || ownership.hostId !== currentHostId) {
    throw new Error(NOT_FOUND_MESSAGE);
  }
}

const completePayloadSchema = z.object({
  guestFullName: z.string().trim().min(2),
  guestPhone: z.string().trim().min(8),
  guestLanguage: z.string().trim().min(2).max(8),
  numGuests: z.coerce.number().int().min(1).max(20).optional(),
});

export async function completeBookingAction(formData: FormData): Promise<void> {
  const bookingId = idSchema.parse(formData.get('bookingId'));
  const rawNum = formData.get('numGuests');
  const payload = completePayloadSchema.parse({
    guestFullName: formData.get('guestFullName'),
    guestPhone: formData.get('guestPhone'),
    guestLanguage: formData.get('guestLanguage'),
    numGuests: rawNum === null || rawNum === '' ? undefined : rawNum,
  });

  await assertOwnership(bookingId);
  await completeBookingManual(bookingId, payload);
  revalidatePath('/dashboard');
}

export async function skipBookingAction(bookingId: string): Promise<void> {
  const id = idSchema.parse(bookingId);
  await assertOwnership(id);
  await skipBookingCompletion(id);
  revalidatePath('/dashboard');
}

// Slice 6 fase 6: creazione prima property dall'EmptyOnboardingState.
// host_id deriva dalla sessione Supabase (getCurrentHostId), niente
// trust del client. Schema zod allineato a quello di AddPropertyDialog,
// stesso debito di duplicazione gia' tracciato in KNOWN-LIMITS sezione 20
// (refactor proposto: schema condiviso in packages/shared).
const createPropertyPayloadSchema = z.object({
  name: z.string().trim().min(2).max(255),
  city: z.string().trim().min(2).max(128),
  icalBookingUrl: z
    .string()
    .trim()
    .refine((v) => v === '' || z.string().url().safeParse(v).success, { message: 'URL non valido' })
    .optional(),
});

export async function createPropertyAction(formData: FormData): Promise<void> {
  const hostId = await getCurrentHostId();
  const rawIcal = formData.get('icalBookingUrl');
  const payload = createPropertyPayloadSchema.parse({
    name: formData.get('name'),
    city: formData.get('city'),
    icalBookingUrl: rawIcal === null ? undefined : rawIcal,
  });

  const { db } = await getDb();
  const created = await createProperty({
    db,
    hostId,
    name: payload.name,
    city: payload.city,
    icalBookingUrl:
      payload.icalBookingUrl && payload.icalBookingUrl.length > 0
        ? payload.icalBookingUrl
        : undefined,
  });

  // Slice 6.5.3: trigger one-shot iCal poll immediato. Best-effort: se
  // fallisce, il prossimo cron tick (max 15 min) fara' il poll comunque.
  // Solo se la property ha icalBookingUrl (altrimenti niente da pollare).
  if (payload.icalBookingUrl && payload.icalBookingUrl.length > 0) {
    try {
      const token = await getCurrentAccessToken();
      await triggerIcalPollNow(created.id, token);
    } catch (err) {
      console.warn('[createPropertyAction] iCal poll trigger failed', err);
    }
  }

  revalidatePath('/dashboard');
}

// Slice 7a.3 — deflection draft.
//
// generateDeflectionDraftAction: lookup-or-insert pending_draft di kind
// 'deflection_wa_invite' per la booking. Triggered lazy dalla UI (card
// dashboard renderizzata per ogni booking nuova non ancora deflectata).
// Body draft generato deterministicamente da buildDeflectionBody con
// lingua dell'ospite + numero WA host.
//
// markDeflectionSentAction: chiamata quando host clicka "Copia + apri
// Booking inbox". Registra il tentativo: pending_draft passa a
// status='approved' + insert messages outbound con
// metadata.deflection_attempt=true. Misura conversion rate in slice 8+.
//
// Pre-check ownership su entrambe le action (slice 6 fase 6.5 pattern).

export async function generateDeflectionDraftAction(bookingId: string): Promise<void> {
  const id = idSchema.parse(bookingId);
  await assertOwnership(id);

  const hostId = await getCurrentHostId();
  const { db } = await getDb();

  const hostWa = await findHostWaNumber(db, hostId);
  if (!hostWa) {
    throw new Error('Numero WhatsApp host non configurato');
  }

  await getOrCreateDeflectionDraft(db, id, hostWa);
  revalidatePath('/dashboard');
}

export async function markDeflectionSentAction(draftId: string): Promise<void> {
  const id = idSchema.parse(draftId);

  // Pre-check ownership: il draft deve appartenere all'host corrente.
  const currentHostId = await getCurrentHostId();
  const { db } = await getDb();

  const { pendingDrafts } = await import('@premura/db');
  const { eq } = await import('drizzle-orm');
  const [draft] = await db
    .select({ hostId: pendingDrafts.hostId })
    .from(pendingDrafts)
    .where(eq(pendingDrafts.id, id))
    .limit(1);
  if (!draft || draft.hostId !== currentHostId) {
    throw new Error(NOT_FOUND_MESSAGE);
  }

  await markDeflectionSent(db, id);
  revalidatePath('/dashboard');
}

// Slice 11 / 7B — Reply draft actions (approve/edit/reject).
//
// approveReplyDraftAction: usato dal bottone "Invia". Body rimane il
// draft originale. Slice 7B: chiama Meta Cloud API per inviare
// realmente al guest. Ritorna l'esito strutturato (sent/failed/...) cosi'
// l'UI mostra toast appropriato senza throw generico.
//
// editAndSendReplyDraftAction: usato dal bottone "Invia modifiche"
// dopo edit inline. Body custom passato dal client. status='modified'
// + invio Meta come sopra.
//
// rejectReplyDraftAction: usato dal bottone "Scarta". Slice 7B accetta
// reason opzionale (audit). Niente outbound message.

const replyDraftBodySchema = z.string().trim().min(2).max(2000);
const rejectionReasonSchema = z.string().trim().max(500).optional();

// Risultato pubblico per l'UI: enumeration per tipi di esito senza
// leakare dettagli implementativi (Meta error body, ecc.). Lato client
// si fa switch per mostrare toast giusto.
export type ApproveActionResult =
  // metaMessageId null = invio simulato (WHATSAPP_DRY_RUN) o bloccato dal
  // kill switch: la bozza risulta inviata nel nostro stato ma nessun
  // provider l'ha accettata, quindi non c'e' un id a cui agganciare gli
  // ack. L'UI deve poter distinguere "inviato" da "inviato davvero".
  | { ok: true; metaMessageId: string | null }
  | {
      ok: false;
      reason: 'not_found' | 'no_guest_phone' | 'channel_not_supported' | 'send_failed';
      detail?: string;
    };

export async function approveReplyDraftAction(draftId: string): Promise<ApproveActionResult> {
  const id = idSchema.parse(draftId);
  const hostId = await getCurrentHostId();
  const { db } = await getDb();
  const { pendingDrafts } = await import('@premura/db');
  const { eq, and: andOp } = await import('drizzle-orm');
  const [draft] = await db
    .select({ body: pendingDrafts.draftResponse, hostId: pendingDrafts.hostId })
    .from(pendingDrafts)
    .where(andOp(eq(pendingDrafts.id, id), eq(pendingDrafts.kind, 'reply_draft')))
    .limit(1);
  if (!draft || draft.hostId !== hostId) {
    return { ok: false, reason: 'not_found' };
  }
  const result = await approveAndSendReplyDraft(db, id, draft.body, hostId);
  revalidatePath('/dashboard');
  return mapApproveResult(result);
}

export async function editAndSendReplyDraftAction(
  draftId: string,
  finalBody: string,
): Promise<ApproveActionResult> {
  const id = idSchema.parse(draftId);
  const body = replyDraftBodySchema.parse(finalBody);
  const hostId = await getCurrentHostId();
  const { db } = await getDb();
  const result = await approveAndSendReplyDraft(db, id, body, hostId);
  revalidatePath('/dashboard');
  return mapApproveResult(result);
}

function mapApproveResult(
  r: Awaited<ReturnType<typeof approveAndSendReplyDraft>>,
): ApproveActionResult {
  if (r.status === 'sent') return { ok: true, metaMessageId: r.metaMessageId };
  if (r.status === 'already_sent') {
    return r.metaMessageId
      ? { ok: true, metaMessageId: r.metaMessageId }
      : { ok: false, reason: 'send_failed', detail: 'gia processato senza wamid' };
  }
  if (r.status === 'not_found') return { ok: false, reason: 'not_found' };
  if (r.status === 'no_guest_phone') return { ok: false, reason: 'no_guest_phone' };
  if (r.status === 'channel_not_supported') {
    return { ok: false, reason: 'channel_not_supported', detail: r.channel };
  }
  return { ok: false, reason: 'send_failed', detail: r.error };
}

export async function rejectReplyDraftAction(draftId: string, reason?: string): Promise<void> {
  const id = idSchema.parse(draftId);
  const parsedReason = rejectionReasonSchema.parse(reason);
  const hostId = await getCurrentHostId();
  const { db } = await getDb();
  await rejectReplyDraft(db, id, hostId, parsedReason);
  revalidatePath('/dashboard');
}

// L1 del principio di onboarding: quando il numero non c'e', l'host
// manda lui il primo messaggio nell'inbox Booking/Airbnb. Qui si genera
// il testo pronto da incollare (zero automazione sulle loro inbox).
export type GuestInviteResult = { ok: true; message: string } | { ok: false; error: string };

export async function buildGuestInviteAction(bookingId: string): Promise<GuestInviteResult> {
  try {
    const id = idSchema.parse(bookingId);
    await assertOwnership(id);
    const { db } = await getDb();
    const [row] = await db
      .select({
        guestFirstName: bookings.guestFirstName,
        guestFullName: bookings.guestFullName,
        guestLanguage: bookings.guestLanguage,
        propertyName: properties.name,
      })
      .from(bookings)
      .innerJoin(properties, eq(properties.id, bookings.propertyId))
      .where(eq(bookings.id, id))
      .limit(1);
    if (!row) return { ok: false, error: NOT_FOUND_MESSAGE };

    const message = composeGuestInvite({
      guestFirstName: row.guestFirstName,
      guestFullName: row.guestFullName,
      propertyName: row.propertyName,
      language: row.guestLanguage,
      guestAppUrl: process.env.WELCOME_GUEST_APP_URL?.trim() || null,
    });
    return { ok: true, message };
  } catch (err) {
    console.error('[dashboard] buildGuestInviteAction failed', err);
    return { ok: false, error: 'Non sono riuscito a generare il messaggio, riprova.' };
  }
}

// ─── Possibili cancellazioni (30/07) ────────────────────────────────

export async function confirmCancellationAction(
  bookingId: string,
): Promise<{ ok: boolean }> {
  const hostId = await getCurrentHostId();
  const parsed = idSchema.safeParse(bookingId);
  if (!parsed.success) return { ok: false };
  const { db } = await getDb();
  const result = await confirmCancellation(db, hostId, parsed.data);
  revalidatePath('/dashboard');
  return { ok: result.ok };
}

export async function dismissCancellationAction(
  bookingId: string,
): Promise<{ ok: boolean }> {
  const hostId = await getCurrentHostId();
  const parsed = idSchema.safeParse(bookingId);
  if (!parsed.success) return { ok: false };
  const { db } = await getDb();
  const result = await dismissCancellation(db, hostId, parsed.data);
  revalidatePath('/dashboard');
  return { ok: result.ok };
}
