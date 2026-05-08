import { type Database, messages, pendingDrafts } from '@premura/db';
import { eq } from 'drizzle-orm';

// Slice 7B — Persistenza eventi status outbound da Meta Cloud API.
//
// Meta invia "statuses" payload per ogni outbound message:
//   sent → delivered → read   (happy path)
//   failed                     (errore, opzionale prima di sent)
//
// Cross-reference: wamid (Meta) -> messages.platform_message_id e
// pending_drafts.meta_message_id, entrambi setati nel send-time path
// di apps/web (approveAndSendReplyDraft). Se non match, e' uno status
// per un outbound non nostro (pre-7B, message_writer cleaner brief, ecc.):
// skip senza rumore.
//
// Idempotenza: Meta puo' rimandare lo stesso evento (rare ma documentato).
// L'update setta i timestamp solo se non gia' presenti, cosi' un retry
// non sovrascrive.

export type StatusUpdateInput = {
  wamid: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: Date;
  errorMessage: string | null;
};

export type StatusUpdateResult = {
  matched: boolean;
  messageId: string | null;
  draftId: string | null;
  applied: 'no_match' | 'already_applied' | 'updated';
};

export async function applyOutboundStatusUpdate(
  db: Database,
  input: StatusUpdateInput,
): Promise<StatusUpdateResult> {
  const { wamid, status, timestamp, errorMessage } = input;

  const [msg] = await db
    .select({
      id: messages.id,
      deliveredAt: messages.deliveredAt,
      readAt: messages.readAt,
      failedAt: messages.failedAt,
    })
    .from(messages)
    .where(eq(messages.platformMessageId, wamid))
    .limit(1);
  if (!msg) {
    return { matched: false, messageId: null, draftId: null, applied: 'no_match' };
  }

  const updates: Partial<{
    deliveredAt: Date;
    readAt: Date;
    failedAt: Date;
    failureReason: string | null;
  }> = {};
  if (status === 'delivered' && !msg.deliveredAt) {
    updates.deliveredAt = timestamp;
  } else if (status === 'read' && !msg.readAt) {
    updates.readAt = timestamp;
    // 'read' implica delivered. Se mancante, setta anche quello (Meta a
    // volte salta 'delivered' se il guest legge il messaggio mentre il
    // device e' online).
    if (!msg.deliveredAt) updates.deliveredAt = timestamp;
  } else if (status === 'failed' && !msg.failedAt) {
    updates.failedAt = timestamp;
    updates.failureReason = errorMessage;
  }

  if (Object.keys(updates).length > 0) {
    await db.update(messages).set(updates).where(eq(messages.id, msg.id));
  }

  let draftId: string | null = null;
  const [draft] = await db
    .select({ id: pendingDrafts.id, status: pendingDrafts.status })
    .from(pendingDrafts)
    .where(eq(pendingDrafts.metaMessageId, wamid))
    .limit(1);
  if (draft) {
    draftId = draft.id;
    if (status === 'failed' && draft.status !== 'failed') {
      await db
        .update(pendingDrafts)
        .set({
          status: 'failed',
          errorLog: errorMessage ?? 'meta_status_failed',
        })
        .where(eq(pendingDrafts.id, draft.id));
    }
  }

  return {
    matched: true,
    messageId: msg.id,
    draftId,
    applied: Object.keys(updates).length > 0 ? 'updated' : 'already_applied',
  };
}
