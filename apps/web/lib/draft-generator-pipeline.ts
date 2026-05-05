import { type DraftOutput, decideRouting, generateReplyDraft } from '@premura/agents';
import {
  type Database,
  bookings,
  conversations,
  messages,
  pendingDrafts,
  properties,
} from '@premura/db';
import { and, desc, eq, gte } from 'drizzle-orm';
import { logAgentAction } from './agent-action-logger';
import { getHostVoiceProfile } from './repositories/host-voice-profiles';
import { getPropertyKnowledge } from './repositories/property-knowledge';

// ─────────────────────────────────────────────────────────────
// Slice 11 — Draft Generator pipeline.
//
// Triggered da insertInboundMessage (apps/web/lib/repositories/messages.ts)
// fire-and-forget. Step:
//   1. Skip se body < 10 char o placeholder.
//   2. Skip dedup: ospite ha outbound approvato negli ultimi 30 min sullo
//      stesso thread.
//   3. Skip dedup: esiste gia' pending_draft kind=reply_draft per questo
//      message_id.
//   4. Fetch context: conversation history, voice profile, guest DNA,
//      property knowledge.
//   5. generateReplyDraft (Sonnet 4.6).
//   6. Insert pending_drafts kind='reply_draft' con metadata.
//   7. Log via agent_action_logger (riusa slice 8.2).
// ─────────────────────────────────────────────────────────────

const DEDUP_WINDOW_MINUTES = 30;
const CONTEXT_MESSAGE_LIMIT = 10;

export type TriggerDraftGenerationInput = {
  messageId: string;
  bookingId: string;
  body: string;
  hostId: string;
  guestProfileId?: string | null;
  // Test injection: override generator (skip Anthropic).
  generator?: typeof generateReplyDraft;
  // Override smart routing options (default: WA non live).
  waChannelLive?: boolean;
};

export type DraftGenerationResult = {
  status:
    | 'generated'
    | 'skipped_short_body'
    | 'skipped_placeholder'
    | 'skipped_recent_outbound'
    | 'skipped_existing_draft'
    | 'skipped_no_property'
    | 'generator_error';
  draftId?: string;
  routing?: 'auto_send' | 'notify_host' | 'escalate';
  confidence?: number;
  reason?: string;
};

export async function triggerDraftGeneration(
  db: Database,
  input: TriggerDraftGenerationInput,
): Promise<DraftGenerationResult> {
  const trimmed = input.body.trim();
  if (trimmed.length < 10) {
    return { status: 'skipped_short_body', reason: 'body < 10 char' };
  }
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    return { status: 'skipped_placeholder', reason: "body e' placeholder" };
  }

  // Dedup: pending_draft gia' esistente per questo messageId.
  const [existing] = await db
    .select({ id: pendingDrafts.id })
    .from(pendingDrafts)
    .where(
      and(
        eq(pendingDrafts.replyToMessageId, input.messageId),
        eq(pendingDrafts.kind, 'reply_draft'),
      ),
    )
    .limit(1);
  if (existing) {
    return { status: 'skipped_existing_draft', draftId: existing.id };
  }

  // Dedup: outbound recente (host ha gia' risposto manualmente / Premura
  // ha gia' inviato altro draft auto-approved nei 30 min).
  const cutoff = new Date(Date.now() - DEDUP_WINDOW_MINUTES * 60_000);
  const [recentOutbound] = await db
    .select({ id: messages.id })
    .from(messages)
    .where(
      and(
        eq(messages.bookingId, input.bookingId),
        eq(messages.direction, 'outbound'),
        gte(messages.createdAt, cutoff),
      ),
    )
    .limit(1);
  if (recentOutbound) {
    return {
      status: 'skipped_recent_outbound',
      reason: `outbound entro ${DEDUP_WINDOW_MINUTES} min`,
    };
  }

  // Fetch booking + property name.
  const [bookingRow] = await db
    .select({
      bookingId: bookings.id,
      propertyId: bookings.propertyId,
      propertyName: properties.name,
      hostId: properties.hostId,
      guestFirstName: bookings.guestFirstName,
      guestFullName: bookings.guestFullName,
    })
    .from(bookings)
    .innerJoin(properties, eq(bookings.propertyId, properties.id))
    .where(eq(bookings.id, input.bookingId))
    .limit(1);
  if (!bookingRow) {
    return { status: 'skipped_no_property', reason: 'booking senza property' };
  }

  // Fetch context messaggi (ultimi N inbound + outbound del booking).
  const recentMessages = await db
    .select({
      direction: messages.direction,
      fromEntity: messages.fromEntity,
      body: messages.body,
      sentAt: messages.sentAt,
    })
    .from(messages)
    .where(eq(messages.bookingId, input.bookingId))
    .orderBy(desc(messages.createdAt))
    .limit(CONTEXT_MESSAGE_LIMIT);
  const conversationHistory = recentMessages
    .reverse()
    // Escludi messaggi cleaner (out of scope per draft generator).
    .filter(
      (m): m is typeof m & { fromEntity: 'guest' | 'host' | 'premura' } =>
        m.fromEntity === 'guest' || m.fromEntity === 'host' || m.fromEntity === 'premura',
    )
    .map((m) => ({
      direction: m.direction,
      fromEntity: m.fromEntity,
      body: m.body,
      sentAt: m.sentAt,
    }));

  // Fetch voice profile + property knowledge in parallelo.
  const [voiceProfile, propertyKnowledge] = await Promise.all([
    getHostVoiceProfile(db, bookingRow.hostId),
    getPropertyKnowledge(db, bookingRow.propertyId),
  ]);

  // Fetch guest DNA insights (dal guest_profile).
  let guestInsights: {
    preferredLanguage?: string;
    communicationStyle?: { score: number; label: string };
    topicsMentioned?: string[];
    sentimentAvg?: number;
  } | null = null;
  if (input.guestProfileId) {
    const { guestProfiles } = await import('@premura/db');
    const [profile] = await db
      .select({ insights: guestProfiles.messageInsights })
      .from(guestProfiles)
      .where(eq(guestProfiles.id, input.guestProfileId))
      .limit(1);
    if (profile?.insights) {
      const i = profile.insights;
      guestInsights = {
        preferredLanguage: i.preferredLanguage,
        communicationStyle: i.communicationStyle
          ? {
              score: i.communicationStyle.score,
              label: i.communicationStyle.label,
            }
          : undefined,
        topicsMentioned: i.topicsMentioned,
        sentimentAvg: i.sentimentAvg,
      };
    }
  }

  const guestFirstName = bookingRow.guestFirstName ?? bookingRow.guestFullName.split(/\s+/)[0];

  const generator = input.generator ?? generateReplyDraft;

  // Generate via logger (slice 8.2): cattura cost + latency + classification.
  let output: DraftOutput;
  try {
    const logged = await logAgentAction(db, {
      hostId: input.hostId,
      agent: 'conversation',
      actionType: 'generate_reply_draft',
      bookingId: input.bookingId,
      guestProfileId: input.guestProfileId ?? undefined,
      messageId: input.messageId,
      inputSummary: {
        conversation_count: conversationHistory.length,
        has_voice_profile: Boolean(voiceProfile),
        voice_confidence: voiceProfile?.voiceConfidence ?? 0,
        has_property_knowledge: Boolean(propertyKnowledge),
        has_guest_insights: Boolean(guestInsights),
      },
      fn: async () => {
        const draft = await generator({
          conversation: conversationHistory,
          voiceProfile: voiceProfile
            ? {
                avgSentenceLength: voiceProfile.avgSentenceLength,
                formalityScore: voiceProfile.formalityScore,
                emojiUsageRate: voiceProfile.emojiUsageRate,
                commonPhrases: voiceProfile.commonPhrases,
                greetingPatterns: voiceProfile.greetingPatterns,
                closingPatterns: voiceProfile.closingPatterns,
                voiceConfidence: voiceProfile.voiceConfidence,
              }
            : null,
          guestInsights,
          propertyKnowledge,
          propertyName: bookingRow.propertyName,
          guestFirstName,
        });
        return {
          output: draft as unknown as Record<string, unknown>,
          reasoning: draft.reasoning,
          model: process.env.CLAUDE_MODEL_PRIMARY ?? 'claude-sonnet-4-6',
        };
      },
    });
    output = logged.output as unknown as DraftOutput;
  } catch (err) {
    return {
      status: 'generator_error',
      reason: err instanceof Error ? err.message : String(err),
    };
  }

  // Smart routing: hardcoded thresholds.
  const routing = decideRouting(output, { waChannelLive: input.waChannelLive ?? false });

  // Insert pending_draft.
  const [inserted] = await db
    .insert(pendingDrafts)
    .values({
      kind: 'reply_draft',
      bookingId: input.bookingId,
      hostId: bookingRow.hostId,
      replyToMessageId: input.messageId,
      // messageId legacy (kind='message_reply' originale): non riusato.
      messageId: null,
      draftResponse: output.draft_body,
      reasoning: output.reasoning,
      suggestedAction: output.suggested_action,
      metadata: {
        confidence: output.confidence,
        classification: output.classification,
        suggested_action: output.suggested_action,
        routing,
        voice_profile_version: voiceProfile?.voiceConfidence ?? 0,
        property_knowledge_used: Boolean(propertyKnowledge),
        guest_insights_used: Boolean(guestInsights),
      },
      // TTL: 7 giorni dal now (oltre il draft scade automaticamente).
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    })
    .returning({ id: pendingDrafts.id });

  if (!inserted) {
    return { status: 'generator_error', reason: 'pending_draft insert returned no row' };
  }

  return {
    status: 'generated',
    draftId: inserted.id,
    routing,
    confidence: output.confidence,
  };
}

// Re-export per testing.
export { decideRouting };
