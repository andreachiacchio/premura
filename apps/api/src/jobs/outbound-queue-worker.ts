import {
  type Database,
  bookings,
  conversations,
  createServerClient,
  messages,
  pendingDrafts,
  properties,
  providers,
} from '@premura/db';
import { isKillSwitchOn, sendText } from '@premura/integrations';
import { findForbiddenPhone } from '@premura/shared';
import { Cron } from 'croner';
import { and, asc, eq, isNull } from 'drizzle-orm';
import pino from 'pino';

// Coda outbound (Fase 4 weekend, 30/07).
//
// "Approva" in dashboard NON invia: accoda (messages.status='queued').
// Questo worker e' l'UNICO punto che porta un messaggio approvato dal
// database a WhatsApp. Regole:
//
//  - KILL SWITCH PRIMA DI TUTTO: con l'interruttore acceso la coda
//    resta ferma, i messaggi restano 'queued' e non si perde nulla —
//    partiranno al primo tick dopo la riattivazione.
//  - Guardia contatti fornitori ANCHE qui: il corpo e' gia' passato
//    dalla guardia in fase di bozza, ma l'host puo' aver MODIFICATO il
//    testo prima di approvare. Ultimo controllo prima della rete.
//  - La disclosure AI e' gia' nel corpo quando serviva (la pipeline
//    bozze la antepone, Fase 3); dopo il primo invio riuscito la
//    conversazione viene marcata (ai_disclosure_sent_at) cosi' le
//    bozze successive non la ripetono.
//  - Errori di invio: fino a 3 tentativi (uno per tick), poi 'failed'
//    — visibile nel thread, mai silenzioso.

const logger = pino({
  name: 'outbound-queue-worker',
  level: process.env.LOG_LEVEL ?? 'info',
});

export const MAX_SEND_ATTEMPTS = 3;
const BATCH_SIZE = 10;

export type QueueTickSummary = {
  queued: number;
  sent: number;
  failed: number;
  blocked: number;
  /** true = kill switch acceso: coda intatta, nessun tentativo. */
  deferred: boolean;
};

type QueueDeps = {
  sendFn?: typeof sendText;
  killSwitchOn?: boolean;
  now?: Date;
};

export async function drainOutboundQueue(
  db: Database,
  deps: QueueDeps = {},
): Promise<QueueTickSummary> {
  const now = deps.now ?? new Date();
  const send = deps.sendFn ?? sendText;
  const killSwitch = deps.killSwitchOn ?? isKillSwitchOn();

  const rows = await db
    .select({
      id: messages.id,
      bookingId: messages.bookingId,
      conversationId: messages.conversationId,
      body: messages.body,
      recipientExternalId: messages.recipientExternalId,
      metadata: messages.metadata,
    })
    .from(messages)
    .where(
      and(
        eq(messages.status, 'queued'),
        eq(messages.direction, 'outbound'),
        eq(messages.channel, 'whatsapp'),
      ),
    )
    .orderBy(asc(messages.createdAt))
    .limit(BATCH_SIZE);

  const summary: QueueTickSummary = {
    queued: rows.length,
    sent: 0,
    failed: 0,
    blocked: 0,
    deferred: false,
  };
  if (rows.length === 0) return summary;

  if (killSwitch) {
    summary.deferred = true;
    return summary;
  }

  for (const row of rows) {
    const metadata = (row.metadata ?? {}) as Record<string, unknown>;
    const draftId = typeof metadata.reply_draft_id === 'string' ? metadata.reply_draft_id : null;

    if (!row.recipientExternalId) {
      // Non dovrebbe accadere (l'approve richiede il numero): failed
      // esplicito, mai un retry infinito su un destinatario vuoto.
      await db
        .update(messages)
        .set({ metadata: { ...metadata, error: 'destinatario mancante' }, status: 'failed' })
        .where(eq(messages.id, row.id));
      summary.failed++;
      continue;
    }

    // Guardia fornitori sul testo FINALE (l'host puo' averlo modificato).
    if (row.bookingId) {
      const [owner] = await db
        .select({ hostId: properties.hostId })
        .from(bookings)
        .innerJoin(properties, eq(bookings.propertyId, properties.id))
        .where(eq(bookings.id, row.bookingId))
        .limit(1);
      if (owner) {
        const internalPhones = await db
          .select({ phone: providers.phone })
          .from(providers)
          .where(
            and(eq(providers.hostId, owner.hostId), eq(providers.contactVisibility, 'internal')),
          );
        const leaked = findForbiddenPhone(
          row.body,
          internalPhones.map((p) => p.phone),
        );
        if (leaked) {
          await db
            .update(messages)
            .set({
              status: 'blocked',
              metadata: { ...metadata, blocked_reason: 'provider_contact_leak' },
            })
            .where(eq(messages.id, row.id));
          if (draftId) {
            await db
              .update(pendingDrafts)
              .set({ status: 'failed', errorLog: 'contatto fornitore interno nel testo finale' })
              .where(eq(pendingDrafts.id, draftId));
          }
          logger.error(
            { messageId: row.id, draftId },
            'messaggio in coda BLOCCATO: contatto fornitore interno nel testo',
          );
          summary.blocked++;
          continue;
        }
      }
    }

    try {
      const result = await send(row.recipientExternalId, row.body);
      if (result.skippedReason === 'kill_switch') {
        // Interruttore girato a meta' tick: fermiamo tutto, la coda
        // resta com'e'.
        summary.deferred = true;
        break;
      }
      await db
        .update(messages)
        .set({
          status: 'sent',
          sentAt: now,
          platformMessageId: result.messageId,
          metadata: { ...metadata, dry_run: result.dryRun },
        })
        .where(eq(messages.id, row.id));
      if (draftId) {
        await db
          .update(pendingDrafts)
          .set({ status: 'sent', sentAt: now, metaMessageId: result.messageId })
          .where(eq(pendingDrafts.id, draftId));
      }
      if (row.conversationId) {
        // Primo outbound della conversazione: la disclosure (gia' nel
        // corpo) risulta consegnata, le bozze future non la ripetono.
        await db
          .update(conversations)
          .set({ aiDisclosureSentAt: now })
          .where(
            and(eq(conversations.id, row.conversationId), isNull(conversations.aiDisclosureSentAt)),
          );
      }
      summary.sent++;
      logger.info({ messageId: row.id, draftId, dryRun: result.dryRun }, 'messaggio in coda inviato');
    } catch (err) {
      const attempts = (typeof metadata.attempts === 'number' ? metadata.attempts : 0) + 1;
      const errStr = err instanceof Error ? err.message : String(err);
      if (attempts >= MAX_SEND_ATTEMPTS) {
        await db
          .update(messages)
          .set({ status: 'failed', metadata: { ...metadata, attempts, error: errStr } })
          .where(eq(messages.id, row.id));
        if (draftId) {
          await db
            .update(pendingDrafts)
            .set({ status: 'failed', errorLog: errStr, retryCount: attempts })
            .where(eq(pendingDrafts.id, draftId));
        }
        summary.failed++;
        logger.error(
          { messageId: row.id, draftId, attempts, err: errStr },
          'messaggio in coda FALLITO dopo i tentativi massimi',
        );
      } else {
        await db
          .update(messages)
          .set({ metadata: { ...metadata, attempts, error: errStr } })
          .where(eq(messages.id, row.id));
        logger.warn(
          { messageId: row.id, draftId, attempts, err: errStr },
          'invio fallito, resta in coda per il prossimo tick',
        );
      }
    }
  }

  return summary;
}

export async function runOutboundQueueTick(now: Date = new Date()): Promise<void> {
  const client = createServerClient();
  try {
    const summary = await drainOutboundQueue(client.db, { now });
    if (summary.queued > 0) {
      if (summary.deferred) {
        logger.info(
          { queued: summary.queued },
          'kill switch acceso: coda outbound ferma, nessun invio',
        );
      } else {
        logger.info(summary, 'outbound queue tick done');
      }
    }
  } catch (err) {
    logger.error({ err }, 'outbound queue tick failed');
  } finally {
    await client.close();
  }
}

export function startOutboundQueueCron(): Cron {
  // Ogni 2 minuti: una risposta approvata dall'host e' una decisione
  // umana gia' presa, deve partire in fretta (quando il kill switch
  // lo permette). Nessuna finestra oraria: l'orario l'ha scelto l'host
  // approvando.
  return new Cron('*/2 * * * *', () => runOutboundQueueTick());
}
