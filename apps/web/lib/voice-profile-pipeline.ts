import {
  type VoiceAnalysis,
  extractVoiceProfile,
  mergeVoiceProfile,
  shouldSkipVoiceUpdate,
} from '@premura/agents';
import type { Database } from '@premura/db';
import { logAgentAction } from './agent-action-logger';
import {
  fetchRecentOutboundForHost,
  getHostVoiceProfile,
  upsertVoiceProfile,
} from './repositories/host-voice-profiles';

// Slice 8.4 — orchestrazione fire-and-forget triggered da insert
// outbound message dell'host (es. markDeflectionSent in slice 7a.3).
//
// Step:
//   1. Skip se body too short / placeholder.
//   2. Conta messaggi outbound host non ancora processati. Se < BATCH_SIZE
//      skip (rispetta "batch ogni 5 nuovi messaggi outbound").
//   3. Fetch sliding window ultimi 20 outbound dell'host.
//   4. Chiama Sonnet 4.6 (extractVoiceProfile).
//   5. Merge weighted moving average con profile corrente.
//   6. Upsert host_voice_profiles.
//   7. Log agent_actions (riusa logger slice 8.2).
//
// No throw: pipeline e' fire-and-forget.

const BATCH_SIZE = 5;
const SLIDING_WINDOW = 20;

export type TriggerVoiceUpdateInput = {
  hostId: string;
  messageId: string;
  body: string;
  // Test injection: override extractor (skip Anthropic).
  extractor?: (input: { messages: string[] }) => Promise<VoiceAnalysis>;
  // Override BATCH_SIZE per test (default 5).
  batchSize?: number;
};

export type VoiceUpdateResult = {
  status:
    | 'updated'
    | 'skipped_short_body'
    | 'skipped_placeholder'
    | 'skipped_below_batch'
    | 'skipped_duplicate'
    | 'skipped_no_messages'
    | 'extractor_error';
  newMessagesProcessed?: number;
  voiceConfidence?: number;
  reason?: string;
};

export async function triggerVoiceProfileUpdate(
  db: Database,
  input: TriggerVoiceUpdateInput,
): Promise<VoiceUpdateResult> {
  if (shouldSkipVoiceUpdate(input.body)) {
    const trimmed = input.body.trim();
    return {
      status:
        trimmed.startsWith('[') && trimmed.endsWith(']')
          ? 'skipped_placeholder'
          : 'skipped_short_body',
      reason: 'body troppo corto o placeholder',
    };
  }

  const batchSize = input.batchSize ?? BATCH_SIZE;
  const current = await getHostVoiceProfile(db, input.hostId);

  // Fetch ultimi 20 outbound dell'host.
  const recent = await fetchRecentOutboundForHost(db, input.hostId, SLIDING_WINDOW);
  if (recent.length === 0) {
    return { status: 'skipped_no_messages' };
  }

  // Identifica nuovi messaggi (non in processedMessageIds).
  const processed = new Set(current?.processedMessageIds ?? []);
  const newMessages = recent.filter((m) => !processed.has(m.id));

  if (newMessages.length < batchSize) {
    return {
      status: 'skipped_below_batch',
      reason: `${newMessages.length}/${batchSize} nuovi messaggi: aspetto piu' dati`,
    };
  }

  // Ok extract.
  const extractor = input.extractor ?? extractVoiceProfile;
  const messageBodies = recent.map((m) => m.body);

  let analysis: VoiceAnalysis;
  try {
    const logged = await logAgentAction(db, {
      hostId: input.hostId,
      agent: 'system',
      actionType: 'voice_profile_update',
      messageId: input.messageId,
      inputSummary: {
        sliding_window_size: recent.length,
        new_messages_count: newMessages.length,
      },
      fn: async () => {
        const out = await extractor({ messages: messageBodies });
        return {
          output: out as unknown as Record<string, unknown>,
          model: process.env.CLAUDE_MODEL_EMAIL_PARSER ?? 'claude-sonnet-4-6',
        };
      },
    });
    analysis = logged.output as unknown as VoiceAnalysis;
  } catch (err) {
    return {
      status: 'extractor_error',
      reason: err instanceof Error ? err.message : String(err),
    };
  }

  const merged = mergeVoiceProfile({
    current: current ?? {},
    newAnalysis: analysis,
    newMessagesCount: newMessages.length,
    newMessageIds: newMessages.map((m) => m.id),
  });

  if (merged === 'duplicate_skipped') {
    return { status: 'skipped_duplicate' };
  }

  await upsertVoiceProfile(db, input.hostId, merged);

  return {
    status: 'updated',
    newMessagesProcessed: newMessages.length,
    voiceConfidence: merged.voiceConfidence,
  };
}
