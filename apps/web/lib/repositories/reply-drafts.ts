import { type Database, bookings, messages, pendingDrafts, properties } from '@premura/db';
import { and, desc, eq } from 'drizzle-orm';

// Slice 11 / 7B / Fase 4 weekend — Repository helpers per reply_draft.
//
// Fase 4 (30/07): "Approva" NON invia. Marca la bozza approvata e
// ACCODA il messaggio (messages.status='queued'); l'invio vero lo fa
// solo il worker outbound-queue su apps/api, che rispetta kill switch,
// dry-run e guardia fornitori. Prima l'invio partiva da qui (Vercel)
// con la Meta Cloud API e col kill switch acceso la bozza risultava
// "sent" senza che nulla fosse partito: uno stato che mentiva. Ora lo
// stato dice la verita': queued finche' non parte davvero.

export type ReplyDraftView = {
  id: string;
  bookingId: string;
  hostId: string;
  draftBody: string;
  reasoning: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'modified' | 'expired' | 'sent' | 'failed';
  metadata: {
    confidence?: number;
    classification?: string;
    suggested_action?: string;
    routing?: string;
    voice_profile_version?: number;
    property_knowledge_used?: boolean;
    guest_insights_used?: boolean;
  };
  createdAt: Date;
  expiresAt: Date;
  // Messaggio inbound originale + ospite info.
  replyToMessageId: string | null;
  inboundMessageBody: string | null;
  guestFullName: string;
  guestFirstName: string | null;
  guestLanguage: string | null;
  channel: 'whatsapp' | 'booking_inbox' | 'airbnb_inbox' | 'email' | null;
  propertyName: string;
};

// Lista pending reply_draft attivi per host (status=pending, kind=reply_draft).
// JOIN con bookings + properties + messages (inbound originale) per
// dare alla card UI tutto il context necessario senza N+1 query.
export async function listPendingReplyDraftsForHost(
  db: Database,
  hostId: string,
): Promise<ReplyDraftView[]> {
  const rows = await db
    .select({
      id: pendingDrafts.id,
      bookingId: pendingDrafts.bookingId,
      hostId: pendingDrafts.hostId,
      draftBody: pendingDrafts.draftResponse,
      reasoning: pendingDrafts.reasoning,
      status: pendingDrafts.status,
      metadata: pendingDrafts.metadata,
      createdAt: pendingDrafts.createdAt,
      expiresAt: pendingDrafts.expiresAt,
      replyToMessageId: pendingDrafts.replyToMessageId,
      inboundMessageBody: messages.body,
      channel: messages.channel,
      guestFullName: bookings.guestFullName,
      guestFirstName: bookings.guestFirstName,
      guestLanguage: bookings.guestLanguage,
      propertyName: properties.name,
    })
    .from(pendingDrafts)
    .innerJoin(bookings, eq(pendingDrafts.bookingId, bookings.id))
    .innerJoin(properties, eq(bookings.propertyId, properties.id))
    .leftJoin(messages, eq(pendingDrafts.replyToMessageId, messages.id))
    .where(
      and(
        eq(pendingDrafts.hostId, hostId),
        eq(pendingDrafts.kind, 'reply_draft'),
        eq(pendingDrafts.status, 'pending'),
      ),
    )
    .orderBy(desc(pendingDrafts.createdAt))
    .limit(50);

  return rows.map((r) => ({
    id: r.id,
    bookingId: r.bookingId,
    hostId: r.hostId,
    draftBody: r.draftBody,
    reasoning: r.reasoning,
    status: r.status,
    metadata: r.metadata as ReplyDraftView['metadata'],
    createdAt: r.createdAt,
    expiresAt: r.expiresAt,
    replyToMessageId: r.replyToMessageId,
    inboundMessageBody: r.inboundMessageBody,
    guestFullName: r.guestFullName,
    guestFirstName: r.guestFirstName,
    guestLanguage: r.guestLanguage,
    channel: (r.channel as ReplyDraftView['channel']) ?? null,
    propertyName: r.propertyName,
  }));
}

export type ApproveResult =
  | { status: 'queued'; messageId: string }
  | { status: 'already_processed' }
  | { status: 'not_found' }
  | { status: 'no_guest_phone' }
  | { status: 'channel_not_supported'; channel: string };

// Fase 4: approve + ACCODA (nessuna chiamata di rete da qui).
// Step:
//  1. Fetch draft + booking + guest_phone + conversation dell'inbound.
//  2. Validate: draft esiste, status=pending, guest_phone presente,
//     canale=whatsapp (Booking/Airbnb inbox restano read-only).
//  3. Lock atomico status='approved'/'modified' (WHERE status='pending':
//     il doppio click perde la corsa e riceve already_processed).
//  4. Insert messages row con status='queued', sent_at NULL.
//     Il worker outbound-queue (apps/api) fara' l'invio quando il kill
//     switch lo permette, e portera' lo stato a sent/failed.
export async function approveAndQueueReplyDraft(
  db: Database,
  draftId: string,
  finalBody: string,
  hostId: string,
): Promise<ApproveResult> {
  // Single query: draft + booking guest_phone + inbound channel +
  // conversation (il messaggio in coda resta nel thread giusto).
  const [row] = await db
    .select({
      draft: pendingDrafts,
      guestPhone: bookings.guestPhone,
      inboundChannel: messages.channel,
      inboundConversationId: messages.conversationId,
    })
    .from(pendingDrafts)
    .innerJoin(bookings, eq(pendingDrafts.bookingId, bookings.id))
    .leftJoin(messages, eq(pendingDrafts.replyToMessageId, messages.id))
    .where(
      and(
        eq(pendingDrafts.id, draftId),
        eq(pendingDrafts.hostId, hostId),
        eq(pendingDrafts.kind, 'reply_draft'),
      ),
    )
    .limit(1);

  if (!row) return { status: 'not_found' };
  const { draft, guestPhone, inboundChannel, inboundConversationId } = row;

  // Idempotency: qualunque stato diverso da pending e' gia' deciso.
  if (draft.status !== 'pending') {
    return { status: 'already_processed' };
  }

  if (!guestPhone) {
    return { status: 'no_guest_phone' };
  }

  // Canale inbound originale (whatsapp | booking_inbox | airbnb_inbox |
  // email). Slice 7B v1 supporta solo whatsapp; per gli altri non
  // sappiamo ancora come inviare outbound (Booking/Airbnb sono read-only,
  // email e' fattibile ma non in questo slice).
  const outboundChannel: 'whatsapp' | 'booking_inbox' | 'airbnb_inbox' | 'email' =
    (inboundChannel as 'whatsapp' | 'booking_inbox' | 'airbnb_inbox' | 'email') ?? 'whatsapp';
  if (outboundChannel !== 'whatsapp') {
    return { status: 'channel_not_supported', channel: outboundChannel };
  }

  const wasModified = finalBody !== draft.draftResponse;
  const now = new Date();

  // Lock atomico: passa a 'approved' SOLO se status='pending'. Race
  // condition (doppio click): la seconda update non matcha e riceve
  // already_processed. Il lock viene PRIMA dell'insert in coda, cosi'
  // un doppio click non accoda mai due messaggi.
  const [locked] = await db
    .update(pendingDrafts)
    .set({
      status: wasModified ? 'modified' : 'approved',
      approvedAt: now,
      finalResponseSent: finalBody,
    })
    .where(and(eq(pendingDrafts.id, draftId), eq(pendingDrafts.status, 'pending')))
    .returning({ id: pendingDrafts.id });
  if (!locked) {
    return { status: 'already_processed' };
  }

  // In coda: sent_at NULL e platform_message_id NULL finche' il worker
  // non invia davvero. Lo stato del thread mostra "in coda".
  const [insertedMsg] = await db
    .insert(messages)
    .values({
      bookingId: draft.bookingId,
      conversationId: inboundConversationId ?? null,
      channel: outboundChannel,
      direction: 'outbound',
      fromEntity: 'host',
      toEntity: 'guest',
      body: finalBody,
      status: 'queued',
      recipientExternalId: guestPhone,
      metadata: {
        reply_draft_id: draftId,
        was_modified: wasModified,
        queued_via_dashboard: true,
      },
    })
    .returning({ id: messages.id });

  if (!insertedMsg) {
    throw new Error('[reply-drafts] queued message insert returned no row');
  }

  return { status: 'queued', messageId: insertedMsg.id };
}

export type RejectResult =
  | { status: 'rejected' }
  | { status: 'not_found' }
  | { status: 'already_processed' };

// Slice 7B: opzionale `reason` per audit (perche' l'host ha rejected).
// Salvato in pending_drafts.rejection_reason, max 500 char.
export async function rejectReplyDraft(
  db: Database,
  draftId: string,
  hostId: string,
  reason?: string,
): Promise<RejectResult> {
  const [draft] = await db
    .select({ id: pendingDrafts.id, status: pendingDrafts.status })
    .from(pendingDrafts)
    .where(
      and(
        eq(pendingDrafts.id, draftId),
        eq(pendingDrafts.hostId, hostId),
        eq(pendingDrafts.kind, 'reply_draft'),
      ),
    )
    .limit(1);
  if (!draft) return { status: 'not_found' };
  if (draft.status !== 'pending') return { status: 'already_processed' };

  await db
    .update(pendingDrafts)
    .set({
      status: 'rejected',
      rejectedAt: new Date(),
      rejectionReason: reason?.trim().slice(0, 500) ?? null,
    })
    .where(eq(pendingDrafts.id, draftId));
  return { status: 'rejected' };
}
