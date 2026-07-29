import { type Database, bookings, messages, pendingDrafts, properties } from '@premura/db';
import { WhatsappSendError, sendText } from '@premura/integrations';
import { and, desc, eq } from 'drizzle-orm';

// Slice 11 / 7B — Repository helpers per reply_draft pending.
//
// Slice 7B (outbound): approveAndSendReplyDraft chiama davvero Meta
// Cloud API per inviare il messaggio al guest, poi traccia status
// ('sent' su 200, 'failed' su errore non recuperabile). Retry inline
// 1x su 5xx/429 (transient). Per resilienza piu' robusta (cron retry,
// dead-letter), TODO follow-up con worker BullMQ in apps/api.

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
  // metaMessageId null = invio simulato (WHATSAPP_DRY_RUN) o kill switch:
  // la bozza risulta inviata nel nostro stato ma nessun provider l'ha
  // accettata, quindi non esiste un id a cui agganciare gli ack.
  | { status: 'sent'; messageId: string; metaMessageId: string | null }
  | { status: 'already_sent'; metaMessageId: string | null }
  | { status: 'not_found' }
  | { status: 'no_guest_phone' }
  | { status: 'failed'; error: string }
  | { status: 'channel_not_supported'; channel: string };

// Slice 7B: approve + invio outbound via Meta Cloud API (canale whatsapp).
// Step:
//  1. Fetch draft + booking + guest_phone (singola query JOIN).
//  2. Validate: draft esiste, status=pending, guest_phone presente,
//     canale=whatsapp (per ora; slice 7B v1 fa solo WA).
//  3. Mark status='approved' temporaneamente (idempotency lock).
//  4. Call sendText (Meta Cloud API). Retry 1x su 5xx/429.
//  5. Su success: status='sent', sent_at, meta_message_id;
//     insert messages row con platform_message_id=wamid.
//  6. Su failure: status='failed', error_log.
//
// Idempotenza: status check pre-send. Se gia' sent/failed/approved,
// non rifa la chiamata. Race su click multipli: l'UPDATE atomico
// con WHERE status='pending' garantisce singolo invio.
export async function approveAndSendReplyDraft(
  db: Database,
  draftId: string,
  finalBody: string,
  hostId: string,
): Promise<ApproveResult> {
  // Single query: draft + booking guest_phone + inbound channel.
  const [row] = await db
    .select({
      draft: pendingDrafts,
      guestPhone: bookings.guestPhone,
      inboundChannel: messages.channel,
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
  const { draft, guestPhone, inboundChannel } = row;

  // Idempotency: gia' processato.
  if (draft.status === 'sent' || draft.status === 'approved' || draft.status === 'modified') {
    return { status: 'already_sent', metaMessageId: draft.metaMessageId };
  }
  if (draft.status !== 'pending') {
    return { status: 'failed', error: `unexpected status: ${draft.status}` };
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
  // condition (doppio click): la seconda update non matcha (status
  // gia' approved) e ritorniamo already_sent.
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
    // Race: qualcun altro l'ha gia' approvato. Re-leggi per vedere lo
    // stato corrente e ritornare il metaMessageId se sent.
    const [latest] = await db
      .select({ metaMessageId: pendingDrafts.metaMessageId })
      .from(pendingDrafts)
      .where(eq(pendingDrafts.id, draftId))
      .limit(1);
    return { status: 'already_sent', metaMessageId: latest?.metaMessageId ?? null };
  }

  // Send via Meta. Retry 1x su 5xx/429.
  // null quando l'invio e' simulato: pendingDrafts.metaMessageId e
  // messages.platformMessageId sono gia' nullable a schema.
  let wamid: string | null;
  let lastError: string | null = null;
  let retried = false;
  while (true) {
    try {
      const result = await sendText(guestPhone, finalBody);
      wamid = result.messageId;
      break;
    } catch (err) {
      const isWa = err instanceof WhatsappSendError;
      const errStr = isWa ? `${err.status}: ${err.body.slice(0, 500)}` : String(err);
      lastError = errStr;
      const retryable = isWa ? err.retryable : true; // network/timeout = retry
      if (retryable && !retried) {
        retried = true;
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }
      // Non recuperabile o retry esaurito: status='failed' + error_log.
      await db
        .update(pendingDrafts)
        .set({
          status: 'failed',
          errorLog: errStr,
          retryCount: retried ? 1 : 0,
        })
        .where(eq(pendingDrafts.id, draftId));
      return { status: 'failed', error: errStr };
    }
  }

  // Success: persist outbound message + finalize draft state.
  const [insertedMsg] = await db
    .insert(messages)
    .values({
      bookingId: draft.bookingId,
      conversationId: null,
      channel: outboundChannel,
      direction: 'outbound',
      fromEntity: 'host',
      toEntity: 'guest',
      body: finalBody,
      sentAt: now,
      platformMessageId: wamid,
      recipientExternalId: guestPhone,
      metadata: {
        reply_draft_id: draftId,
        was_modified: wasModified,
        sent_via_dashboard: true,
        retried: retried,
      },
    })
    .returning({ id: messages.id });

  await db
    .update(pendingDrafts)
    .set({
      status: 'sent',
      sentAt: now,
      metaMessageId: wamid,
      retryCount: retried ? 1 : 0,
    })
    .where(eq(pendingDrafts.id, draftId));

  return {
    status: 'sent',
    messageId: insertedMsg?.id ?? '',
    metaMessageId: wamid,
  };
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
