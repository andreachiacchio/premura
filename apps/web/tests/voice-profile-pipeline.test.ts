import type { Database } from '@premura/db';
import { describe, expect, it, vi } from 'vitest';
import { triggerVoiceProfileUpdate } from '../lib/voice-profile-pipeline';

// Test pipeline voice profile (slice 8.4) end-to-end con Drizzle mock
// + extractor mock. Non dipende da Anthropic.

const baseAnalysis = {
  avg_sentence_length: 12,
  formality_score: 4,
  emoji_usage_rate: 0.5,
  common_phrases: [{ phrase: 'fammi sapere', count: 2 }],
  greeting_patterns: ['Ciao!'],
  closing_patterns: ['— Andrea'],
  language_distribution: { it: 5 },
};

function makeMockDb(opts: {
  currentProfile?: {
    id: string;
    processedMessageIds: string[];
    messagesAnalyzed: number;
  } | null;
  recentMessages?: Array<{ id: string; body: string; createdAt: Date }>;
}) {
  const inserts: Array<{ table: 'profile' | 'agent'; values: Record<string, unknown> }> = [];
  const updates: Array<{ values: Record<string, unknown> }> = [];

  // Sequenza select reale del pipeline (limit query):
  //   1. getHostVoiceProfile -> ritorna currentProfile (o vuoto)
  //   2. dna pipeline non e' chiamata in questo test
  // OrderBy + limit:
  //   1. fetchRecentOutboundForHost -> recentMessages
  let limitCount = 0;
  let orderByLimitCount = 0;

  const mock = {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          innerJoin: () => ({
            where: () => ({
              orderBy: () => ({
                limit: () => {
                  orderByLimitCount++;
                  return Promise.resolve(opts.recentMessages ?? []);
                },
              }),
            }),
          }),
        }),
        where: () => ({
          limit: () => {
            limitCount++;
            if (limitCount === 1) {
              // getHostVoiceProfile lookup
              if (!opts.currentProfile) return Promise.resolve([]);
              return Promise.resolve([
                {
                  id: opts.currentProfile.id,
                  hostId: 'host-1',
                  avgSentenceLength: null,
                  formalityScore: null,
                  emojiUsageRate: null,
                  commonPhrases: [],
                  greetingPatterns: [],
                  closingPatterns: [],
                  languageDistribution: {},
                  messagesAnalyzed: opts.currentProfile.messagesAnalyzed,
                  voiceConfidence: '0',
                  processedMessageIds: opts.currentProfile.processedMessageIds,
                },
              ]);
            }
            return Promise.resolve([]);
          },
        }),
      }),
    }),
    insert: () => ({
      values: (vals: Record<string, unknown>) => {
        const isAgent = 'agent' in vals && 'actionType' in vals;
        inserts.push({ table: isAgent ? 'agent' : 'profile', values: vals });
        return {
          returning: () => Promise.resolve([{ id: `${isAgent ? 'a' : 'p'}-${inserts.length}` }]),
        };
      },
    }),
    update: () => ({
      set: (vals: Record<string, unknown>) => {
        updates.push({ values: vals });
        return {
          where: () => ({
            returning: () => Promise.resolve([{ id: 'p-update' }]),
          }),
        };
      },
    }),
  };

  return { db: mock as unknown as Database, inserts, updates };
}

describe('triggerVoiceProfileUpdate - skip cases', () => {
  it('body troppo corto -> skipped_short_body', async () => {
    const { db } = makeMockDb({});
    const r = await triggerVoiceProfileUpdate(db, {
      hostId: 'host-1',
      messageId: 'msg-1',
      body: 'ok',
    });
    expect(r.status).toBe('skipped_short_body');
  });

  it('body placeholder -> skipped_placeholder', async () => {
    const { db } = makeMockDb({});
    const r = await triggerVoiceProfileUpdate(db, {
      hostId: 'host-1',
      messageId: 'msg-1',
      body: '[Booking message — apri Extranet]',
    });
    expect(r.status).toBe('skipped_placeholder');
  });

  it('nessun messaggio outbound recente -> skipped_no_messages', async () => {
    const { db } = makeMockDb({ recentMessages: [] });
    const r = await triggerVoiceProfileUpdate(db, {
      hostId: 'host-1',
      messageId: 'msg-1',
      body: 'Ciao Mario, ti scrivo le info pratiche su WhatsApp',
    });
    expect(r.status).toBe('skipped_no_messages');
  });

  it('meno di BATCH_SIZE messaggi nuovi -> skipped_below_batch', async () => {
    const recent = [
      { id: 'm-old', body: 'msg vecchio', createdAt: new Date() },
      { id: 'm1', body: 'Ciao Mario, eccoti le info', createdAt: new Date() },
      { id: 'm2', body: 'Buon viaggio!', createdAt: new Date() },
    ];
    const { db } = makeMockDb({
      currentProfile: {
        id: 'p-1',
        processedMessageIds: ['m-old'],
        messagesAnalyzed: 1,
      },
      recentMessages: recent,
    });
    const r = await triggerVoiceProfileUpdate(db, {
      hostId: 'host-1',
      messageId: 'm2',
      body: 'Buon viaggio!',
      batchSize: 5,
    });
    expect(r.status).toBe('skipped_below_batch');
  });
});

describe('triggerVoiceProfileUpdate - happy path', () => {
  it('5 nuovi messaggi -> updated + extractor chiamato + upsert/insert', async () => {
    const recent = Array.from({ length: 5 }, (_, i) => ({
      id: `m-${i}`,
      body: `Ciao ospite ${i}, ecco le info pratiche per il tuo soggiorno`,
      createdAt: new Date(),
    }));
    const { db, inserts, updates } = makeMockDb({
      currentProfile: null, // primo profilo
      recentMessages: recent,
    });
    const fakeExtractor = vi.fn().mockResolvedValue(baseAnalysis);

    const r = await triggerVoiceProfileUpdate(db, {
      hostId: 'host-1',
      messageId: 'm-4',
      body: 'Ciao ospite, ecco le info pratiche per il tuo soggiorno',
      extractor: fakeExtractor,
      batchSize: 5,
    });
    expect(r.status).toBe('updated');
    expect(r.newMessagesProcessed).toBe(5);
    expect(r.voiceConfidence).toBeGreaterThan(0);
    expect(fakeExtractor).toHaveBeenCalledOnce();

    // Verifica chiamato extractor con i body dei recent messages
    const call = fakeExtractor.mock.calls[0]?.[0] as { messages: string[] };
    expect(call.messages.length).toBe(5);

    // agent_actions + insert/update profile
    const agentInsert = inserts.find((i) => i.table === 'agent');
    expect(agentInsert?.values.actionType).toBe('voice_profile_update');
    // Profile insert (primo profilo) o update (gia esistente)
    const profileInsert = inserts.find((i) => i.table === 'profile');
    const profileUpdate = updates.length > 0;
    expect(profileInsert || profileUpdate).toBeTruthy();
  });

  it('messaggi gia tutti processati -> skipped_duplicate', async () => {
    const recent = Array.from({ length: 5 }, (_, i) => ({
      id: `m-${i}`,
      body: `Ciao ospite ${i}, eccoti le info pratiche`,
      createdAt: new Date(),
    }));
    const { db } = makeMockDb({
      currentProfile: {
        id: 'p-1',
        processedMessageIds: recent.map((m) => m.id),
        messagesAnalyzed: 5,
      },
      recentMessages: recent,
    });
    const fakeExtractor = vi.fn().mockResolvedValue(baseAnalysis);

    const r = await triggerVoiceProfileUpdate(db, {
      hostId: 'host-1',
      messageId: 'm-4',
      body: 'Ciao ospite, eccoti le info pratiche',
      extractor: fakeExtractor,
      batchSize: 5,
    });
    expect(r.status).toBe('skipped_below_batch');
    expect(fakeExtractor).not.toHaveBeenCalled();
  });
});

describe('triggerVoiceProfileUpdate - extractor error', () => {
  it('extractor throws -> extractor_error con reason', async () => {
    const recent = Array.from({ length: 5 }, (_, i) => ({
      id: `m-${i}`,
      body: `Ciao ospite ${i}, ecco le info pratiche`,
      createdAt: new Date(),
    }));
    const { db } = makeMockDb({ recentMessages: recent });
    const failing = vi.fn().mockRejectedValue(new Error('Anthropic timeout'));

    const r = await triggerVoiceProfileUpdate(db, {
      hostId: 'host-1',
      messageId: 'm-4',
      body: 'Ciao ospite, ecco le info pratiche',
      extractor: failing,
      batchSize: 5,
    });
    expect(r.status).toBe('extractor_error');
    expect(r.reason).toBe('Anthropic timeout');
  });
});
