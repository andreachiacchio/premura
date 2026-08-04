import {
  type Database,
  bookings,
  conversations,
  hosts,
  messages,
  pendingDrafts,
  properties,
  providers,
} from '@premura/db';
import { findForbiddenPhone, needsAiDisclosure, resolveAiDisclosure } from '@premura/shared';
import { and, desc, eq, gte } from 'drizzle-orm';
import { guestAppInviteDisclosures } from './outbound/guest-app-invite-content';
import { logAgentAction } from './agent-action-logger';
import { getHostVoiceProfile, getPropertyKnowledge } from './context-readers';
import {
  type DraftOutput,
  type DraftUsage,
  decideRouting,
  generateReplyDraft,
} from './draft-generator';

// ─────────────────────────────────────────────────────────────
// Slice 11 — Draft Generator pipeline.
//
// Triggered:
//   - apps/web fire-and-forget da insertInboundMessage (slice 11)
//   - apps/api worker BullMQ draft-generation (slice 7a.4) consumando
//     output di whatsapp-persist
//
// Step:
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
//
// Slice 7a.4: spostato in packages/agents per condivisione apps/web +
// apps/api. Comportamento invariato. Idempotenza garantita dal check
// pending_drafts.replyToMessageId.
// ─────────────────────────────────────────────────────────────

const DEDUP_WINDOW_MINUTES = 30;
const CONTEXT_MESSAGE_LIMIT = 10;

export type TriggerDraftGenerationInput = {
  messageId: string;
  bookingId: string;
  body: string;
  hostId: string;
  guestProfileId?: string | null;
  /** Conversation del messaggio inbound: serve per sapere se la
   *  disclosure AI e' gia' stata inviata in questo thread. */
  conversationId?: string | null;
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
    | 'generator_error'
    // FASE 3 (30/07): bozza scartata perche' conteneva il contatto di
    // un fornitore interno — mai davanti all'host, mai approvabile.
    | 'provider_contact_leak';
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
      guestLanguage: bookings.guestLanguage,
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
        // task #18 (04/08): usage catturata via callback — il logger la
        // trasforma in input/output_tokens + cost_usd sulla riga success.
        let usage: DraftUsage | undefined;
        const draft = await generator(
          {
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
          },
          {
            onUsage: (u) => {
              usage = u;
            },
          },
        );
        return {
          output: draft as unknown as Record<string, unknown>,
          reasoning: draft.reasoning,
          model: process.env.CLAUDE_MODEL_PRIMARY ?? 'claude-sonnet-4-6',
          usage,
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

  // FASE 3 (30/07): guardia contatti fornitori ANCHE sulle bozze. Il
  // numero di Antonio non deve poter comparire in un draft che l'host
  // approverebbe con un tocco. Qualunque provider 'internal' dell'host
  // e' vietato, non solo quelli della property: piu' conservativo.
  const providerPhones = await db
    .select({ phone: providers.phone })
    .from(providers)
    .where(
      and(eq(providers.hostId, bookingRow.hostId), eq(providers.contactVisibility, 'internal')),
    );
  const leakedPhone = findForbiddenPhone(
    output.draft_body,
    providerPhones.map((p) => p.phone),
  );
  if (leakedPhone) {
    return {
      status: 'provider_contact_leak',
      reason: 'la bozza conteneva il contatto di un fornitore interno: scartata',
    };
  }

  // FASE 3 (30/07): disclosure AI nel testo proposto, se questa
  // conversazione non l'ha ancora ricevuta. Stessa formula per
  // struttura dell'invito guest app (il default fisso nomina Villa
  // Cristina); il custom dell'host vince.
  let draftBody = output.draft_body;
  if (input.conversationId) {
    const [conv] = await db
      .select({ at: conversations.aiDisclosureSentAt })
      .from(conversations)
      .where(eq(conversations.id, input.conversationId))
      .limit(1);
    if (needsAiDisclosure(conv?.at ?? null)) {
      const [hostRow] = await db
        .select({ custom: hosts.aiDisclosureCustom })
        .from(hosts)
        .where(eq(hosts.id, bookingRow.hostId))
        .limit(1);
      const disclosures = guestAppInviteDisclosures(bookingRow.propertyName, hostRow?.custom);
      // Lingua: preferenza rilevata dai messaggi, poi quella del booking.
      const disclosureLanguage = guestInsights?.preferredLanguage ?? bookingRow.guestLanguage;
      draftBody = `${resolveAiDisclosure(disclosures, disclosureLanguage)}\n\n${draftBody}`;
    }
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
      draftResponse: draftBody,
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
