import {
  type SingleMessageInsight,
  extractMessageInsights,
  shouldSkipExtraction,
} from '@premura/agents';
import type { Database } from '@premura/db';
import { logAgentAction } from './agent-action-logger';
import {
  applyInsightToProfile,
  fetchRecentMessageContext,
} from './repositories/guest-profile-insights';

// Slice 8.1 — Pipeline 2: orchestrazione fire-and-forget triggered da
// insertInboundMessage.
//
// Step:
//   1. Skip se body signal-only o troppo corto.
//   2. Recupera contesto (ultimi 5 messaggi inbound dello stesso booking).
//   3. Chiama Sonnet 4.6 (extractMessageInsights).
//   4. Applica al guest_profile via applyInsightToProfile.
//   5. Log success/skip/error (no throw — pipeline e' fire-and-forget).
//
// Override-able per test via injectable extractor.

export type TriggerDnaExtractionInput = {
  messageId: string;
  bookingId: string;
  body: string;
  sentAt: Date;
  // Test injection: override extractor (skip Anthropic).
  extractor?: (input: { body: string; context?: string[] }) => Promise<SingleMessageInsight>;
  // Slice 8.2: hostId per loggare l'azione in agent_actions. Optional
  // per back-compat con caller esistenti (se assente, skip logging).
  hostId?: string;
};

export type DnaExtractionResult = {
  status:
    | 'applied'
    | 'skipped_short_body'
    | 'skipped_signal_only'
    | 'skipped_no_profile'
    | 'duplicate_skipped'
    | 'extractor_error';
  guestProfileId?: string;
  reason?: string;
};

export async function triggerDnaExtraction(
  db: Database,
  input: TriggerDnaExtractionInput,
): Promise<DnaExtractionResult> {
  if (shouldSkipExtraction(input.body)) {
    const reason =
      input.body.trim().startsWith('[') && input.body.trim().endsWith(']')
        ? 'signal-only or placeholder body'
        : 'body shorter than 10 chars';
    return {
      status: input.body.trim().startsWith('[') ? 'skipped_signal_only' : 'skipped_short_body',
      reason,
    };
  }

  const context = await fetchRecentMessageContext(db, input.bookingId, input.messageId, 5);

  const extractor = input.extractor ?? extractMessageInsights;
  let insight: SingleMessageInsight;

  // Slice 8.2: log su agent_actions se hostId fornito. Wrappa l'extractor
  // misurando latency + costo. Re-throw e' gestito dal try/catch sotto.
  const runExtraction = async (): Promise<SingleMessageInsight> =>
    extractor({ body: input.body, context });

  try {
    if (input.hostId) {
      const logged = await logAgentAction(db, {
        hostId: input.hostId,
        agent: 'guest_dna',
        actionType: 'extract_message_insights',
        bookingId: input.bookingId,
        messageId: input.messageId,
        inputSummary: {
          body_length: input.body.length,
          context_count: context.length,
        },
        fn: async () => {
          const result = await runExtraction();
          return {
            output: result as unknown as Record<string, unknown>,
            model: process.env.CLAUDE_MODEL_EMAIL_PARSER ?? 'claude-sonnet-4-6',
            // Usage tokens non disponibili senza modificare extractor; per
            // ora null (cost calcolato a 0). In slice futuro si potra'
            // restituire usage da extractMessageInsights.
            usage: undefined,
          };
        },
      });
      insight = logged.output as unknown as SingleMessageInsight;
    } else {
      insight = await runExtraction();
    }
  } catch (err) {
    return {
      status: 'extractor_error',
      reason: err instanceof Error ? err.message : String(err),
    };
  }

  const result = await applyInsightToProfile(db, {
    bookingId: input.bookingId,
    messageId: input.messageId,
    messageSentAt: input.sentAt,
    insight,
  });

  if (result.status === 'no_profile_for_booking') {
    return { status: 'skipped_no_profile', reason: 'booking has no guest_profile_id' };
  }
  if (result.status === 'duplicate_skipped') {
    return { status: 'duplicate_skipped', guestProfileId: result.guestProfileId };
  }
  return { status: 'applied', guestProfileId: result.guestProfileId };
}
