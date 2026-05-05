import { describe, expect, it } from 'vitest';
import {
  CONFIDENCE_HALF_LIFE,
  type CurrentVoiceProfile,
  type MergedVoiceProfile,
  calcConfidence,
  mergeVoiceProfile,
} from '../src/voice-profile-merger';
import type { VoiceAnalysis } from '../src/voice-profiler';

const baseAnalysis = (overrides: Partial<VoiceAnalysis> = {}): VoiceAnalysis => ({
  avg_sentence_length: 12,
  formality_score: 3,
  emoji_usage_rate: 0.4,
  common_phrases: [{ phrase: 'fammi sapere', count: 3 }],
  greeting_patterns: ['Ciao!'],
  closing_patterns: ['— Andrea'],
  language_distribution: { it: 5 },
  ...overrides,
});

describe('mergeVoiceProfile - primo run', () => {
  it('current vuoto + analysis base -> tutti i campi popolati', () => {
    const out = mergeVoiceProfile({
      current: {},
      newAnalysis: baseAnalysis(),
      newMessagesCount: 5,
      newMessageIds: ['m1', 'm2', 'm3', 'm4', 'm5'],
    });
    if (out === 'duplicate_skipped') throw new Error('unexpected');
    expect(out.avgSentenceLength).toBe(12);
    expect(out.formalityScore).toBe(3);
    expect(out.emojiUsageRate).toBe(0.4);
    expect(out.commonPhrases).toEqual([{ phrase: 'fammi sapere', count: 3 }]);
    expect(out.messagesAnalyzed).toBe(5);
    expect(out.processedMessageIds).toEqual(['m1', 'm2', 'm3', 'm4', 'm5']);
    expect(out.voiceConfidence).toBeGreaterThan(0);
    expect(out.voiceConfidence).toBeLessThan(0.2);
  });
});

describe('mergeVoiceProfile - convergenza weighted MA', () => {
  it('20 iterazioni stile dominante casual -> formality converge ~5 e plateau', () => {
    let current: CurrentVoiceProfile = {};
    let lastConf = 0;
    let lastFormality: number | null = null;
    for (let i = 0; i < 20; i++) {
      const out = mergeVoiceProfile({
        current,
        newAnalysis: baseAnalysis({ formality_score: 5, emoji_usage_rate: 0.9 }),
        newMessagesCount: 5,
        newMessageIds: [`m-${i}-1`, `m-${i}-2`, `m-${i}-3`, `m-${i}-4`, `m-${i}-5`],
      });
      if (out === 'duplicate_skipped') throw new Error('unexpected');
      current = out as CurrentVoiceProfile;
      lastConf = (out as MergedVoiceProfile).voiceConfidence;
      lastFormality = (out as MergedVoiceProfile).formalityScore;
    }
    expect(lastFormality).toBeGreaterThan(4.5);
    expect(lastFormality).toBeLessThanOrEqual(5);
    // confidence dopo 100 messaggi (20 iterazioni * 5 msg) plateau ~0.86
    expect(lastConf).toBeGreaterThan(0.8);
  });

  it('cambio drastico stile (formal->casual) la weighted MA si adatta gradualmente', () => {
    // 10 iterazioni formali (5*10 = 50 messaggi)
    let current: CurrentVoiceProfile = {};
    for (let i = 0; i < 10; i++) {
      const out = mergeVoiceProfile({
        current,
        newAnalysis: baseAnalysis({ formality_score: 1 }),
        newMessagesCount: 5,
        newMessageIds: [`f-${i}-1`, `f-${i}-2`, `f-${i}-3`, `f-${i}-4`, `f-${i}-5`],
      });
      if (out === 'duplicate_skipped') throw new Error('unexpected');
      current = out as CurrentVoiceProfile;
    }
    expect(current.formalityScore).toBeLessThan(2);

    // Cambio drastico: 5 iterazioni casual
    for (let i = 0; i < 5; i++) {
      const out = mergeVoiceProfile({
        current,
        newAnalysis: baseAnalysis({ formality_score: 5 }),
        newMessagesCount: 5,
        newMessageIds: [`c-${i}-1`, `c-${i}-2`, `c-${i}-3`, `c-${i}-4`, `c-${i}-5`],
      });
      if (out === 'duplicate_skipped') throw new Error('unexpected');
      current = out as CurrentVoiceProfile;
    }
    // Decay 0.95: 5 iterazioni di samples=5 spostano poco se 0.95^5 ~ 0.77.
    // E' una weighted MA pesata sul vecchio (0.95) -> sample (0.05).
    // 5 samples = 0.95^5 * 1 + 0.05 * sum_geom(5) ~ 0.77 + 0.05 * 4.5 = ~1
    // ma in realta' la formula e' iterativa: each step new = old * 0.95 + sample * 0.05
    // dopo 10 step formali con score=1, current ~ 1 (perche' partiamo da 1)
    // dopo 5 step casual con score=5: current evolve verso 5 ma molto lentamente
    // ~ 1 * 0.95^5 + 5 * (1 - 0.95^5) ~ 0.77 + 1.13 ~ 1.9
    expect(current.formalityScore).toBeGreaterThan(1.5);
    expect(current.formalityScore).toBeLessThan(2.5);
  });
});

describe('mergeVoiceProfile - common phrases', () => {
  it('union dedup + somma counts', () => {
    const out = mergeVoiceProfile({
      current: {
        commonPhrases: [
          { phrase: 'fammi sapere', count: 5 },
          { phrase: 'a presto', count: 3 },
        ],
        processedMessageIds: ['m-old'],
        messagesAnalyzed: 5,
      },
      newAnalysis: baseAnalysis({
        common_phrases: [
          { phrase: 'fammi sapere', count: 2 },
          { phrase: 'qualunque cosa', count: 1 },
        ],
      }),
      newMessagesCount: 5,
      newMessageIds: ['m-new-1', 'm-new-2', 'm-new-3', 'm-new-4', 'm-new-5'],
    });
    if (out === 'duplicate_skipped') throw new Error('unexpected');
    const phrases = out.commonPhrases.reduce<Record<string, number>>((acc, p) => {
      acc[p.phrase] = p.count;
      return acc;
    }, {});
    expect(phrases['fammi sapere']).toBe(7); // 5 + 2
    expect(phrases['a presto']).toBe(3);
    expect(phrases['qualunque cosa']).toBe(1);
  });

  it('top 20 cap rispettato', () => {
    const manyPhrases = Array.from({ length: 25 }, (_, i) => ({
      phrase: `phrase-${i}`,
      count: 30 - i,
    }));
    const out = mergeVoiceProfile({
      current: { commonPhrases: manyPhrases.slice(0, 15) },
      newAnalysis: baseAnalysis({
        common_phrases: manyPhrases.slice(15, 25),
      }),
      newMessagesCount: 5,
      newMessageIds: ['x1', 'x2', 'x3', 'x4', 'x5'],
    });
    if (out === 'duplicate_skipped') throw new Error('unexpected');
    expect(out.commonPhrases.length).toBeLessThanOrEqual(20);
    // top 1 deve essere quello con count piu' alto (30)
    expect(out.commonPhrases[0]?.count).toBeGreaterThanOrEqual(out.commonPhrases[1]?.count ?? 0);
  });
});

describe('mergeVoiceProfile - language distribution', () => {
  it('somma counts per lingua', () => {
    const out = mergeVoiceProfile({
      current: { languageDistribution: { it: 10, en: 2 }, messagesAnalyzed: 12 },
      newAnalysis: baseAnalysis({ language_distribution: { it: 5, en: 1, fr: 2 } }),
      newMessagesCount: 5,
      newMessageIds: ['m1', 'm2', 'm3', 'm4', 'm5'],
    });
    if (out === 'duplicate_skipped') throw new Error('unexpected');
    expect(out.languageDistribution).toEqual({ it: 15, en: 3, fr: 2 });
  });
});

describe('mergeVoiceProfile - idempotenza', () => {
  it('tutti i messageIds gia processati -> duplicate_skipped', () => {
    const out = mergeVoiceProfile({
      current: {
        processedMessageIds: ['m1', 'm2', 'm3'],
        messagesAnalyzed: 3,
      },
      newAnalysis: baseAnalysis(),
      newMessagesCount: 3,
      newMessageIds: ['m1', 'm2', 'm3'],
    });
    expect(out).toBe('duplicate_skipped');
  });

  it('alcuni messageIds gia processati -> processa solo i nuovi', () => {
    const out = mergeVoiceProfile({
      current: {
        processedMessageIds: ['m1', 'm2'],
        messagesAnalyzed: 2,
      },
      newAnalysis: baseAnalysis(),
      newMessagesCount: 5,
      newMessageIds: ['m1', 'm2', 'm3', 'm4', 'm5'],
    });
    if (out === 'duplicate_skipped') throw new Error('unexpected');
    // 3 nuovi (m3, m4, m5) -> messagesAnalyzed = 2 + 3 = 5
    expect(out.messagesAnalyzed).toBe(5);
    expect(out.processedMessageIds).toEqual(['m1', 'm2', 'm3', 'm4', 'm5']);
  });
});

describe('calcConfidence - logaritmica plateau', () => {
  it('0 messaggi -> 0', () => {
    expect(calcConfidence(0)).toBe(0);
  });

  it('half-life -> ~0.63', () => {
    // 1 - exp(-1) ~ 0.632
    expect(calcConfidence(CONFIDENCE_HALF_LIFE)).toBeCloseTo(0.632, 2);
  });

  it('100 messaggi (2 half-lives) -> ~0.86', () => {
    expect(calcConfidence(100)).toBeGreaterThan(0.85);
    expect(calcConfidence(100)).toBeLessThan(0.88);
  });

  it('logaritmica: derivata decrescente (sale lentamente)', () => {
    // Confronto delta su intervallo uguale (10 messaggi):
    // delta sui primi 10 messaggi >> delta dopo 100 messaggi.
    const c0to10 = calcConfidence(10) - calcConfidence(0);
    const c100to110 = calcConfidence(110) - calcConfidence(100);
    expect(c0to10).toBeGreaterThan(c100to110);
  });

  it('200 messaggi -> molto vicino a 1 (plateau)', () => {
    expect(calcConfidence(200)).toBeGreaterThan(0.98);
  });
});
