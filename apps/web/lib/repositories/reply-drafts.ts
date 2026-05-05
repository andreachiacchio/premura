import { type Database, bookings, messages, pendingDrafts, properties } from '@premura/db';
import { and, desc, eq } from 'drizzle-orm';

// Slice 11 — Repository helpers per reply_draft pending.

export type ReplyDraftView = {
  id: string;
  bookingId: string;
  hostId: string;
  draftBody: string;
  reasoning: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'modified' | 'expired';
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

// Marca draft come inviato: insert messages outbound + update draft.
// Idempotente: clic multipli non duplicano message.
export async function approveAndSendReplyDraft(
  db: Database,
  draftId: string,
  finalBody: string,
  hostId: string,
): Promise<{ status: 'sent' | 'already_sent' | 'not_found'; messageId?: string }> {
  const [draft] = await db
    .select()
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
  if (draft.status === 'approved') return { status: 'already_sent' };

  // Determina canale outbound dal messaggio inbound originale.
  let outboundChannel: 'whatsapp' | 'booking_inbox' | 'airbnb_inbox' | 'email' = 'whatsapp';
  if (draft.replyToMessageId) {
    const [inbound] = await db
      .select({ channel: messages.channel })
      .from(messages)
      .where(eq(messages.id, draft.replyToMessageId))
      .limit(1);
    if (inbound?.channel) {
      outboundChannel = inbound.channel as typeof outboundChannel;
    }
  }

  const now = new Date();
  const wasModified = finalBody !== draft.draftResponse;

  await db
    .update(pendingDrafts)
    .set({
      status: wasModified ? 'modified' : 'approved',
      approvedAt: now,
      finalResponseSent: finalBody,
    })
    .where(eq(pendingDrafts.id, draftId));

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
      metadata: {
        reply_draft_id: draftId,
        was_modified: wasModified,
        sent_via_dashboard: true,
      },
    })
    .returning({ id: messages.id });

  return { status: 'sent', messageId: insertedMsg?.id };
}

export async function rejectReplyDraft(
  db: Database,
  draftId: string,
  hostId: string,
): Promise<{ status: 'rejected' | 'not_found' | 'already_processed' }> {
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
    .set({ status: 'rejected', rejectedAt: new Date() })
    .where(eq(pendingDrafts.id, draftId));
  return { status: 'rejected' };
}
