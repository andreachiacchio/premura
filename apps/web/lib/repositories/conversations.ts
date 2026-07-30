import { type Database, bookings, conversations, messages, pendingDrafts, properties } from '@premura/db';
import { and, asc, desc, eq, inArray, isNull, or } from 'drizzle-orm';

// Sezione Conversazioni (Fase 4 weekend, 30/07).
//
// Regola di fondo: "Nessun messaggio invisibile". Tutto cio' che entra
// ed esce da WhatsApp sta qui, con stato esplicito in linguaggio umano.
// Le conversazioni NON ATTRIBUITE (numero sconosciuto, booking_id null)
// si vedono comunque: un messaggio senza casa e' un problema da vedere,
// non da nascondere.
//
// Nota pilot: le non attribuite non hanno host (nessun booking → nessuna
// property). Con un solo host per installazione le mostriamo a chi e'
// loggato; quando ci sara' piu' di un host servira' la mappa
// numero-WhatsApp-ricevente → host (annotato nelle domande aperte).

export type ConversationListItem = {
  id: string;
  attributed: boolean;
  guestFullName: string | null;
  guestFirstName: string | null;
  propertyName: string | null;
  propertyColor: string | null;
  /** Numero/thread esterno (per le non attribuite e' l'unico nome). */
  externalThreadId: string | null;
  channel: string;
  status: string;
  lastMessageAt: Date | null;
  lastMessagePreview: string | null;
  lastMessageDirection: 'inbound' | 'outbound' | null;
  /** Bozze in attesa di decisione dell'host in questo thread. */
  pendingDraftCount: number;
};

export async function listConversationsForHost(
  db: Database,
  hostId: string,
): Promise<ConversationListItem[]> {
  const rows = await db
    .select({
      id: conversations.id,
      bookingId: conversations.bookingId,
      channel: conversations.channel,
      externalThreadId: conversations.externalThreadId,
      status: conversations.status,
      lastMessageAt: conversations.lastMessageAt,
      guestFullName: bookings.guestFullName,
      guestFirstName: bookings.guestFirstName,
      propertyName: properties.name,
      propertyColor: properties.color,
    })
    .from(conversations)
    .leftJoin(bookings, eq(conversations.bookingId, bookings.id))
    .leftJoin(properties, eq(bookings.propertyId, properties.id))
    .where(or(eq(properties.hostId, hostId), isNull(conversations.bookingId)))
    .orderBy(desc(conversations.lastMessageAt));

  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);

  // Anteprima: ultimo messaggio per conversazione. Volumi pilot: una
  // query sola e riduzione in JS, niente lateral join.
  const msgRows = await db
    .select({
      conversationId: messages.conversationId,
      body: messages.body,
      direction: messages.direction,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(inArray(messages.conversationId, ids))
    .orderBy(desc(messages.createdAt));
  const lastByConv = new Map<string, { body: string; direction: 'inbound' | 'outbound' }>();
  for (const m of msgRows) {
    if (m.conversationId && !lastByConv.has(m.conversationId)) {
      lastByConv.set(m.conversationId, {
        body: m.body,
        direction: m.direction as 'inbound' | 'outbound',
      });
    }
  }

  // Bozze pending per conversazione (via messaggio inbound di origine).
  const draftRows = await db
    .select({ conversationId: messages.conversationId })
    .from(pendingDrafts)
    .innerJoin(messages, eq(pendingDrafts.replyToMessageId, messages.id))
    .where(
      and(
        eq(pendingDrafts.kind, 'reply_draft'),
        eq(pendingDrafts.status, 'pending'),
        inArray(messages.conversationId, ids),
      ),
    );
  const draftCount = new Map<string, number>();
  for (const d of draftRows) {
    if (d.conversationId) {
      draftCount.set(d.conversationId, (draftCount.get(d.conversationId) ?? 0) + 1);
    }
  }

  return rows.map((r) => {
    const last = lastByConv.get(r.id) ?? null;
    return {
      id: r.id,
      attributed: r.bookingId !== null,
      guestFullName: r.guestFullName,
      guestFirstName: r.guestFirstName,
      propertyName: r.propertyName,
      propertyColor: r.propertyColor,
      externalThreadId: r.externalThreadId,
      channel: r.channel,
      status: r.status,
      lastMessageAt: r.lastMessageAt,
      lastMessagePreview: last?.body ?? null,
      lastMessageDirection: last?.direction ?? null,
      pendingDraftCount: draftCount.get(r.id) ?? 0,
    };
  });
}

export type ThreadMessage = {
  id: string;
  direction: 'inbound' | 'outbound';
  fromEntity: string;
  body: string;
  /** received | queued | sent | failed | blocked */
  status: string;
  sentAt: Date | null;
  createdAt: Date;
};

export type ThreadDraft = {
  id: string;
  replyToMessageId: string | null;
  draftBody: string;
  reasoning: string | null;
  createdAt: Date;
  metadata: {
    confidence?: number;
    classification?: string;
    routing?: string;
  };
};

export type ConversationThread = {
  conversation: ConversationListItem;
  messages: ThreadMessage[];
  drafts: ThreadDraft[];
};

export async function getConversationThread(
  db: Database,
  hostId: string,
  conversationId: string,
): Promise<ConversationThread | null> {
  const [conv] = await db
    .select({
      id: conversations.id,
      bookingId: conversations.bookingId,
      channel: conversations.channel,
      externalThreadId: conversations.externalThreadId,
      status: conversations.status,
      lastMessageAt: conversations.lastMessageAt,
      guestFullName: bookings.guestFullName,
      guestFirstName: bookings.guestFirstName,
      propertyName: properties.name,
      propertyColor: properties.color,
      ownerHostId: properties.hostId,
    })
    .from(conversations)
    .leftJoin(bookings, eq(conversations.bookingId, bookings.id))
    .leftJoin(properties, eq(bookings.propertyId, properties.id))
    .where(eq(conversations.id, conversationId))
    .limit(1);
  if (!conv) return null;
  // Attribuita a un altro host: non esiste per questo host.
  if (conv.bookingId !== null && conv.ownerHostId !== hostId) return null;

  const msgs = await db
    .select({
      id: messages.id,
      direction: messages.direction,
      fromEntity: messages.fromEntity,
      body: messages.body,
      status: messages.status,
      sentAt: messages.sentAt,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.createdAt));

  const msgIds = msgs.map((m) => m.id);
  const drafts =
    msgIds.length === 0
      ? []
      : await db
          .select({
            id: pendingDrafts.id,
            replyToMessageId: pendingDrafts.replyToMessageId,
            draftBody: pendingDrafts.draftResponse,
            reasoning: pendingDrafts.reasoning,
            createdAt: pendingDrafts.createdAt,
            metadata: pendingDrafts.metadata,
          })
          .from(pendingDrafts)
          .where(
            and(
              eq(pendingDrafts.kind, 'reply_draft'),
              eq(pendingDrafts.status, 'pending'),
              inArray(pendingDrafts.replyToMessageId, msgIds),
            ),
          )
          .orderBy(asc(pendingDrafts.createdAt));

  return {
    conversation: {
      id: conv.id,
      attributed: conv.bookingId !== null,
      guestFullName: conv.guestFullName,
      guestFirstName: conv.guestFirstName,
      propertyName: conv.propertyName,
      propertyColor: conv.propertyColor,
      externalThreadId: conv.externalThreadId,
      channel: conv.channel,
      status: conv.status,
      lastMessageAt: conv.lastMessageAt,
      lastMessagePreview: null,
      lastMessageDirection: null,
      pendingDraftCount: drafts.length,
    },
    messages: msgs.map((m) => ({
      id: m.id,
      direction: m.direction as 'inbound' | 'outbound',
      fromEntity: m.fromEntity,
      body: m.body,
      status: m.status,
      sentAt: m.sentAt,
      createdAt: m.createdAt,
    })),
    drafts: drafts.map((d) => ({
      id: d.id,
      replyToMessageId: d.replyToMessageId,
      draftBody: d.draftBody ?? '',
      reasoning: d.reasoning,
      createdAt: d.createdAt,
      metadata: (d.metadata ?? {}) as ThreadDraft['metadata'],
    })),
  };
}
