import type { Database } from '@premura/db';
import { describe, expect, it, vi } from 'vitest';
import { triggerDnaExtraction } from '../lib/dna-extraction-pipeline';

// Test della pipeline DNA extraction (slice 8.1) end-to-end con
// Drizzle mockato + extractor mockato (no Anthropic).

function makeMockDb(opts: {
  bookingHasProfile?: boolean;
  profileExists?: boolean;
  alreadyProcessed?: boolean;
  recentMessages?: Array<{ id: string; body: string; createdAt: Date }>;
}) {
  const updateCalls: Array<{ values: Record<string, unknown> }> = [];
  const profile = opts.profileExists
    ? {
        insights: opts.alreadyProcessed
          ? {
              processedMessageIds: ['msg-target'],
              processedMessages: 1,
            }
          : {},
        firstMessageAt: null,
      }
    : null;

  // Sequenza chiamate select reale del pipeline:
  //   1. fetchRecentMessageContext: from(messages).where().orderBy().limit()
  //   2. applyInsightToProfile: from(bookings).where().limit() [booking lookup]
  //   3. applyInsightToProfile: from(guestProfiles).where().limit() [profile lookup]
  let limitCount = 0;
  let orderByLimitCount = 0;
  const mock = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => {
            limitCount++;
            if (limitCount === 1) {
              // booking lookup
              if (opts.bookingHasProfile === false) {
                return Promise.resolve([{ guestProfileId: null }]);
              }
              return Promise.resolve([{ guestProfileId: 'profile-1' }]);
            }
            if (limitCount === 2) {
              // profile lookup
              return Promise.resolve(profile ? [profile] : []);
            }
            return Promise.resolve([]);
          },
          orderBy: () => ({
            limit: () => {
              orderByLimitCount++;
              return Promise.resolve(opts.recentMessages ?? []);
            },
          }),
        }),
      }),
    }),
    update: () => ({
      set: (vals: Record<string, unknown>) => {
        updateCalls.push({ values: vals });
        return { where: () => Promise.resolve() };
      },
    }),
  };

  return { db: mock as unknown as Database, updateCalls };
}

const fakeExtractor = vi.fn().mockResolvedValue({
  preferred_language: 'it',
  communication_style_score: 4,
  communication_style_label: 'casual',
  topics_mentioned: ['parking', 'wifi'],
  urgency_signals: false,
  sentiment: 0.5,
});

describe('triggerDnaExtraction — skip cases', () => {
  it('body troppo corto -> skipped_short_body, no extractor call', async () => {
    fakeExtractor.mockClear();
    const { db } = makeMockDb({});
    const r = await triggerDnaExtraction(db, {
      messageId: 'msg-1',
      bookingId: 'booking-1',
      body: 'ok',
      sentAt: new Date(),
      extractor: fakeExtractor,
    });
    expect(r.status).toBe('skipped_short_body');
    expect(fakeExtractor).not.toHaveBeenCalled();
  });

  it('body signal-only [...] -> skipped_signal_only', async () => {
    fakeExtractor.mockClear();
    const { db } = makeMockDb({});
    const r = await triggerDnaExtraction(db, {
      messageId: 'msg-1',
      bookingId: 'booking-1',
      body: '[Booking message ricevuto da X — apri Extranet]',
      sentAt: new Date(),
      extractor: fakeExtractor,
    });
    expect(r.status).toBe('skipped_signal_only');
    expect(fakeExtractor).not.toHaveBeenCalled();
  });
});

describe('triggerDnaExtraction — happy path', () => {
  it('body valido + booking ha profile -> applied + update', async () => {
    fakeExtractor.mockClear();
    const { db, updateCalls } = makeMockDb({
      bookingHasProfile: true,
      profileExists: true,
    });
    const r = await triggerDnaExtraction(db, {
      messageId: 'msg-target',
      bookingId: 'booking-1',
      body: 'Ciao, posso fare check-in alle 16?',
      sentAt: new Date('2026-05-05T10:00:00Z'),
      extractor: fakeExtractor,
    });
    expect(r.status).toBe('applied');
    expect(r.guestProfileId).toBe('profile-1');
    expect(fakeExtractor).toHaveBeenCalledOnce();

    // Verifica update con merged insights.
    expect(updateCalls.length).toBe(1);
    const updated = updateCalls[0]?.values as Record<string, unknown>;
    const insights = updated.messageInsights as Record<string, unknown>;
    expect(insights.preferredLanguage).toBe('it');
    expect(insights.topicsMentioned).toEqual(expect.arrayContaining(['parking', 'wifi']));
    expect(updated.messageCount).toBe(1);
    expect(updated.lastMessageAt).toEqual(new Date('2026-05-05T10:00:00Z'));
  });
});

describe('triggerDnaExtraction — edge cases', () => {
  it('booking senza guest_profile_id -> skipped_no_profile', async () => {
    fakeExtractor.mockClear();
    const { db } = makeMockDb({ bookingHasProfile: false });
    const r = await triggerDnaExtraction(db, {
      messageId: 'msg-1',
      bookingId: 'booking-orphan',
      body: 'Ciao, dove sono le chiavi?',
      sentAt: new Date(),
      extractor: fakeExtractor,
    });
    expect(r.status).toBe('skipped_no_profile');
  });

  it('messageId gia processato -> duplicate_skipped', async () => {
    fakeExtractor.mockClear();
    const { db } = makeMockDb({
      bookingHasProfile: true,
      profileExists: true,
      alreadyProcessed: true,
    });
    const r = await triggerDnaExtraction(db, {
      messageId: 'msg-target',
      bookingId: 'booking-1',
      body: 'Ciao mondo lungo abbastanza',
      sentAt: new Date(),
      extractor: fakeExtractor,
    });
    expect(r.status).toBe('duplicate_skipped');
  });

  it('extractor throws -> extractor_error con reason', async () => {
    const failing = vi.fn().mockRejectedValue(new Error('Anthropic timeout'));
    const { db } = makeMockDb({});
    const r = await triggerDnaExtraction(db, {
      messageId: 'msg-1',
      bookingId: 'booking-1',
      body: 'Ciao mondo lungo abbastanza',
      sentAt: new Date(),
      extractor: failing,
    });
    expect(r.status).toBe('extractor_error');
    expect(r.reason).toBe('Anthropic timeout');
  });
});
