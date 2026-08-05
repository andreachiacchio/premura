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
import { normalizeEuroAmount } from '@/lib/euro-amount';
import { normalizePhone } from '@/lib/phone-normalize';
import { findOwnership } from '@/lib/repositories/bookings';
import { createDirectBooking } from '@/lib/repositories/direct-bookings';
import { findHostWaNumber } from '@/lib/repositories/hosts';
import { createProperty } from '@/lib/repositories/properties';
import { approveAndQueueReplyDraft, rejectReplyDraft } from '@/lib/repositories/reply-drafts';
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

// Slice 11 / 7B / Fase 4 — Reply draft actions (approve/edit/reject).
//
// Fase 4 (30/07): "Approva" NON invia. Marca la bozza approvata e la
// mette in coda (messages.status='queued'); l'invio lo fa il worker
// outbound-queue su apps/api quando il kill switch lo permette. L'UI
// lo dice esplicitamente: nessun messaggio parte da qui.
//
// rejectReplyDraftAction: usato dal bottone "Scarta". Reason opzionale
// (audit). Niente outbound message.

const replyDraftBodySchema = z.string().trim().min(2).max(2000);
const rejectionReasonSchema = z.string().trim().max(500).optional();

export type ApproveActionResult =
  | { ok: true; queued: true }
  | {
      ok: false;
      reason: 'not_found' | 'no_guest_phone' | 'channel_not_supported' | 'already_processed';
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
  const result = await approveAndQueueReplyDraft(db, id, draft.body ?? '', hostId);
  revalidatePath('/dashboard');
  revalidatePath('/dashboard/conversations');
  return mapApproveResult(result);
}

export async function editAndQueueReplyDraftAction(
  draftId: string,
  finalBody: string,
): Promise<ApproveActionResult> {
  const id = idSchema.parse(draftId);
  const body = replyDraftBodySchema.parse(finalBody);
  const hostId = await getCurrentHostId();
  const { db } = await getDb();
  const result = await approveAndQueueReplyDraft(db, id, body, hostId);
  revalidatePath('/dashboard');
  revalidatePath('/dashboard/conversations');
  return mapApproveResult(result);
}

function mapApproveResult(
  r: Awaited<ReturnType<typeof approveAndQueueReplyDraft>>,
): ApproveActionResult {
  if (r.status === 'queued') return { ok: true, queued: true };
  if (r.status === 'not_found') return { ok: false, reason: 'not_found' };
  if (r.status === 'no_guest_phone') return { ok: false, reason: 'no_guest_phone' };
  if (r.status === 'channel_not_supported') {
    return { ok: false, reason: 'channel_not_supported', detail: r.channel };
  }
  return { ok: false, reason: 'already_processed' };
}

export async function rejectReplyDraftAction(draftId: string, reason?: string): Promise<void> {
  const id = idSchema.parse(draftId);
  const parsedReason = rejectionReasonSchema.parse(reason);
  const hostId = await getCurrentHostId();
  const { db } = await getDb();
  await rejectReplyDraft(db, id, hostId, parsedReason);
  revalidatePath('/dashboard');
  revalidatePath('/dashboard/conversations');
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

// ─── Prenotazione inserita dall'host (05/08) ────────────────────────
//
// "La diretta va trattata come il caso migliore, non come fallback."
// L'action ritorna un risultato tipizzato invece di lanciare: il
// dialog e' un client component con useTransition e deve poter
// mostrare all'host cosa e' successo (assorbita? Premura attiva?
// sovrapposizioni parziali?), non un errore generico.

const directBookingSchema = z.object({
  propertyId: z.string().uuid('Scegli la struttura'),
  platform: z.enum(['direct', 'booking', 'airbnb', 'altro']),
  // I max riflettono le colonne: varchar(255) su nome ed email,
  // varchar(32) sul telefono. Senza, l'errore arrivava da Postgres.
  guestFullName: z
    .string()
    .trim()
    .min(2, 'Il nome deve avere almeno 2 caratteri')
    .max(255, 'Nome troppo lungo'),
  guestPhone: z.string().trim().max(32, 'Numero troppo lungo').optional(),
  guestEmail: z
    .string()
    .trim()
    .max(255, 'Email troppo lunga')
    .optional()
    .refine((v) => !v || z.string().email().safeParse(v).success, {
      message: 'Email non valida',
    }),
  guestLanguage: z.string().trim().min(2, 'Scegli la lingua').max(8).optional(),
  numGuests: z.coerce.number().int().min(1, 'Almeno 1 ospite').max(20, 'Troppi ospiti'),
  checkinDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data di arrivo mancante'),
  checkoutDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data di partenza mancante'),
  priceTotal: z.string().trim().optional(),
  hostNotes: z.string().trim().max(2000).optional(),
});

export type CreateDirectBookingActionResult =
  | {
      ok: true;
      absorbed: boolean;
      premuraActivated: boolean;
      partialOverlapCount: number;
    }
  | { ok: false; error: string };

/** YYYY-MM-DD -> mezzanotte UTC (stessa convenzione di parseIsoDate). */
function isoToUtcMidnight(yyyymmdd: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(yyyymmdd);
  if (!m) throw new Error(`isoToUtcMidnight: formato non valido "${yyyymmdd}"`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

export async function createDirectBookingAction(
  formData: FormData,
): Promise<CreateDirectBookingActionResult> {
  const parsed = directBookingSchema.safeParse({
    propertyId: formData.get('propertyId'),
    platform: formData.get('platform'),
    guestFullName: formData.get('guestFullName'),
    guestPhone: formData.get('guestPhone') ?? undefined,
    guestEmail: formData.get('guestEmail') ?? undefined,
    guestLanguage: formData.get('guestLanguage') ?? undefined,
    numGuests: formData.get('numGuests') ?? 1,
    checkinDate: formData.get('checkinDate'),
    checkoutDate: formData.get('checkoutDate'),
    priceTotal: formData.get('priceTotal') ?? undefined,
    hostNotes: formData.get('hostNotes') ?? undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Dati non validi' };
  }
  const p = parsed.data;

  // Il telefono va normalizzato come ovunque: senza E.164 l'agente non
  // riesce a scrivere, e un numero salvato male e' peggio di assente.
  let phone: string | null = null;
  if (p.guestPhone) {
    const norm = normalizePhone(p.guestPhone);
    if (!norm.ok) {
      return { ok: false, error: 'Numero non valido: scrivilo con il prefisso, es. +39 333…' };
    }
    phone = norm.e164;
  }

  // "1.234,50" e' come un host italiano scrive milleduecentotrentaquattro
  // e cinquanta. Un replace(',', '.') secco lo avrebbe salvato come
  // 1,234 euro: il prezzo pilota il budget del kit, quindi sbagliarlo
  // di mille volte non e' un dettaglio.
  const prezzo = p.priceTotal ? normalizeEuroAmount(p.priceTotal) : null;
  if (p.priceTotal && prezzo === null) {
    return { ok: false, error: 'Prezzo non valido: scrivilo come 450 oppure 1.234,50' };
  }

  const hostId = await getCurrentHostId();
  const { db } = await getDb();
  const result = await createDirectBooking(db, hostId, {
    propertyId: p.propertyId,
    platform: p.platform,
    guestFullName: p.guestFullName,
    guestPhone: phone,
    guestEmail: p.guestEmail || null,
    guestLanguage: p.guestLanguage || null,
    numGuests: p.numGuests,
    checkinAt: isoToUtcMidnight(p.checkinDate),
    checkoutAt: isoToUtcMidnight(p.checkoutDate),
    priceTotal: prezzo,
    hostNotes: p.hostNotes || null,
  });

  if (!result.ok) {
    const messaggi = {
      property_not_found: 'Struttura non trovata',
      wrong_host: 'Struttura non trovata',
      invalid_dates: 'La partenza deve essere dopo l’arrivo',
      stay_too_long: 'Più di un anno non è un soggiorno: controlla le date',
      duplicate:
        'Su queste date hai già una prenotazione con un nome. Aprila e modificala, invece di crearne una seconda.',
    } as const;
    return { ok: false, error: messaggi[result.reason] };
  }

  revalidatePath('/dashboard');
  revalidatePath('/dashboard/upcoming-checkins');
  revalidatePath('/properties');
  return {
    ok: true,
    absorbed: result.absorbed,
    premuraActivated: result.premuraActivated,
    partialOverlapCount: result.partialOverlaps.length,
  };
}
