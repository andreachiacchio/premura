import type { MessageInsights } from '@premura/db';
import { describe, expect, it } from 'vitest';
import type { SingleMessageInsight } from '../src/dna-extractor';
import { mergeInsights } from '../src/dna-insights-merger';

const baseInsight = (overrides: Partial<SingleMessageInsight> = {}): SingleMessageInsight => ({
  preferred_language: 'it',
  communication_style_score: 3,
  communication_style_label: 'mixed',
  topics_mentioned: ['wifi'],
  urgency_signals: false,
  sentiment: 0,
  ...overrides,
});

describe('mergeInsights — primo messaggio', () => {
  it('current vuoto + insight base -> tutti i campi popolati', () => {
    const out = mergeInsights({
      current: {},
      newInsight: baseInsight(),
      messageId: 'msg-1',
    });
    expect(out.preferredLanguage).toBe('it');
    expect(out.communicationStyle).toEqual({ score: 3, label: 'mixed' });
    expect(out.topicsMentioned).toEqual(['wifi']);
    expect(out.urgencySignals).toBe(false);
    expect(out.sentimentAvg).toBe(0);
    expect(out.processedMessages).toBe(1);
    expect(out.processedMessageIds).toEqual(['msg-1']);
  });
});

describe('mergeInsights — incrementale', () => {
  const after1: MessageInsights = {
    preferredLanguage: 'it',
    communicationStyle: { score: 5, label: 'casual' },
    topicsMentioned: ['wifi', 'keybox'],
    urgencySignals: false,
    sentimentAvg: 0.8,
    processedMessages: 1,
    processedMessageIds: ['msg-1'],
  };

  it('topics: union dei nuovi e vecchi, dedup', () => {
    const out = mergeInsights({
      current: after1,
      newInsight: baseInsight({ topics_mentioned: ['parking', 'wifi'] }),
      messageId: 'msg-2',
    });
    expect(out.topicsMentioned).toEqual(expect.arrayContaining(['wifi', 'keybox', 'parking']));
    expect(new Set(out.topicsMentioned).size).toBe(out.topicsMentioned?.length);
  });

  it('communicationStyle: moving avg sullo score', () => {
    const out = mergeInsights({
      current: after1, // score 5
      newInsight: baseInsight({ communication_style_score: 1 }),
      messageId: 'msg-2',
    });
    // (5*1 + 1) / 2 = 3
    expect(out.communicationStyle?.score).toBe(3);
    expect(out.communicationStyle?.label).toBe('mixed');
  });

  it('communicationStyle: score finale <=2 -> formal', () => {
    const out = mergeInsights({
      current: { ...after1, communicationStyle: { score: 1, label: 'formal' } },
      newInsight: baseInsight({ communication_style_score: 2 }),
      messageId: 'msg-2',
    });
    expect(out.communicationStyle?.score).toBe(2);
    expect(out.communicationStyle?.label).toBe('formal');
  });

  it('urgency: most-recent-wins (true vince anche se prima era false)', () => {
    const out = mergeInsights({
      current: after1, // false
      newInsight: baseInsight({ urgency_signals: true }),
      messageId: 'msg-2',
    });
    expect(out.urgencySignals).toBe(true);
  });

  it('urgency: nuovo false -> reset (most-recent-wins)', () => {
    const out = mergeInsights({
      current: { ...after1, urgencySignals: true },
      newInsight: baseInsight({ urgency_signals: false }),
      messageId: 'msg-2',
    });
    expect(out.urgencySignals).toBe(false);
  });

  it('sentiment: moving average pesata 70%/30%', () => {
    const out = mergeInsights({
      current: after1, // sentiment 0.8
      newInsight: baseInsight({ sentiment: -0.4 }),
      messageId: 'msg-2',
    });
    // 0.8 * 0.7 + (-0.4) * 0.3 = 0.56 - 0.12 = 0.44
    expect(out.sentimentAvg).toBeCloseTo(0.44, 2);
  });

  it('sentiment: primo sample non e' + " moving avg, e' valore puro", () => {
    const out = mergeInsights({
      current: {},
      newInsight: baseInsight({ sentiment: -0.5 }),
      messageId: 'msg-1',
    });
    expect(out.sentimentAvg).toBe(-0.5);
  });

  it('processedMessages: incrementato a ogni call', () => {
    const out = mergeInsights({
      current: after1,
      newInsight: baseInsight(),
      messageId: 'msg-2',
    });
    expect(out.processedMessages).toBe(2);
  });

  it('processedMessageIds: append', () => {
    const out = mergeInsights({
      current: after1,
      newInsight: baseInsight(),
      messageId: 'msg-2',
    });
    expect(out.processedMessageIds).toEqual(['msg-1', 'msg-2']);
  });

  it('preferredLanguage: most-recent-wins', () => {
    const out = mergeInsights({
      current: after1, // it
      newInsight: baseInsight({ preferred_language: 'en' }),
      messageId: 'msg-2',
    });
    expect(out.preferredLanguage).toBe('en');
  });
});

describe('mergeInsights — idempotenza', () => {
  it('messageId gia processato -> ritorna current invariato', () => {
    const current: MessageInsights = {
      preferredLanguage: 'it',
      processedMessageIds: ['msg-existing'],
      processedMessages: 1,
    };
    const out = mergeInsights({
      current,
      newInsight: baseInsight({ preferred_language: 'fr' }),
      messageId: 'msg-existing',
    });
    expect(out).toBe(current);
    expect(out.preferredLanguage).toBe('it');
  });
});

describe('mergeInsights — limit', () => {
  it('topics oltre 20 -> truncato a 20', () => {
    const manyTopics = Array.from({ length: 25 }, (_, i) => `topic-${i}`);
    const current: MessageInsights = {
      topicsMentioned: manyTopics as never,
    };
    const out = mergeInsights({
      current,
      newInsight: baseInsight({ topics_mentioned: ['parking'] }),
      messageId: 'msg-1',
    });
    expect(out.topicsMentioned?.length).toBeLessThanOrEqual(20);
  });

  it('processedMessageIds oltre 100 -> FIFO trunc', () => {
    const ids = Array.from({ length: 105 }, (_, i) => `msg-old-${i}`);
    const out = mergeInsights({
      current: {
        processedMessageIds: ids,
        processedMessages: ids.length,
      },
      newInsight: baseInsight(),
      messageId: 'msg-new',
    });
    expect(out.processedMessageIds?.length).toBe(100);
    expect(out.processedMessageIds?.[99]).toBe('msg-new');
    // I primi vengono droppati
    expect(out.processedMessageIds?.[0]).not.toBe('msg-old-0');
  });
});
