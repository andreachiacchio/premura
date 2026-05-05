import type { CommonPhrase, LanguageDistribution } from '@premura/db';
import type { VoiceAnalysis } from './voice-profiler';

// Slice 8.4 — merge incrementale del voice profile con weighted moving
// average + decay factor.
//
// Strategia per campo:
//   - avgSentenceLength, formalityScore, emojiUsageRate: weighted MA
//     con peso decay = 0.95 sui campionamenti precedenti, peso 1
//     sull'ultimo. Decay implicito tramite formula:
//       new = old * decay + sample * (1 - decay)
//     dove decay e' costante. Plateau a ~50 messaggi (logaritmica).
//   - commonPhrases: union dedup, somma counts. Top 20 by count.
//   - greetingPatterns / closingPatterns: union dedup, max 8.
//   - languageDistribution: somma counts per lingua.
//   - voiceConfidence: 1 - exp(-messagesAnalyzed / 50). Plateau ~50.
//
// Idempotente per messageIds: se messageId gia' in processedMessageIds,
// mergeVoiceProfile ritorna current invariato.

const DECAY = 0.95;
const MAX_PHRASES = 20;
const MAX_GREETINGS = 8;
const MAX_CLOSINGS = 8;
const MAX_PROCESSED_IDS = 200;
const CONFIDENCE_HALF_LIFE = 50; // messaggi a cui voiceConfidence ~= 0.63

export type CurrentVoiceProfile = {
  avgSentenceLength?: number | null;
  formalityScore?: number | null;
  emojiUsageRate?: number | null;
  commonPhrases?: CommonPhrase[] | null;
  greetingPatterns?: string[] | null;
  closingPatterns?: string[] | null;
  languageDistribution?: LanguageDistribution | null;
  messagesAnalyzed?: number | null;
  voiceConfidence?: number | null;
  processedMessageIds?: string[] | null;
};

export type MergedVoiceProfile = {
  avgSentenceLength: number;
  formalityScore: number;
  emojiUsageRate: number;
  commonPhrases: CommonPhrase[];
  greetingPatterns: string[];
  closingPatterns: string[];
  languageDistribution: LanguageDistribution;
  messagesAnalyzed: number;
  voiceConfidence: number;
  processedMessageIds: string[];
};

export type MergeVoiceInput = {
  current: CurrentVoiceProfile;
  newAnalysis: VoiceAnalysis;
  // Numero di nuovi messaggi che hanno generato newAnalysis.
  // L'analisi e' di una sliding window (es. 20 messaggi) ma N e' il
  // count di NUOVI messaggi che hanno triggerato il refresh (es. 5
  // ogni 5 nuovi outbound).
  newMessagesCount: number;
  // messageIds nuovi processati in questa run.
  newMessageIds: string[];
};

export function mergeVoiceProfile(
  input: MergeVoiceInput,
): MergedVoiceProfile | 'duplicate_skipped' {
  const { current, newAnalysis, newMessagesCount, newMessageIds } = input;

  const processedIds = current.processedMessageIds ?? [];
  // Idempotenza: se TUTTI i nuovi messageId sono gia' processati, skip.
  const trulyNew = newMessageIds.filter((id) => !processedIds.includes(id));
  if (trulyNew.length === 0) {
    return 'duplicate_skipped';
  }

  const oldCount = current.messagesAnalyzed ?? 0;
  const newCount = oldCount + trulyNew.length;

  // Numeric fields: weighted MA con decay implicito.
  const oldAvgSentence = current.avgSentenceLength ?? null;
  const oldFormality = current.formalityScore ?? null;
  const oldEmojiRate = current.emojiUsageRate ?? null;

  const mergedAvgSentence = blendNumeric(oldAvgSentence, newAnalysis.avg_sentence_length, oldCount);
  const mergedFormality = blendNumeric(oldFormality, newAnalysis.formality_score, oldCount);
  const mergedEmojiRate = blendNumeric(oldEmojiRate, newAnalysis.emoji_usage_rate, oldCount);

  // commonPhrases: union dedup, somma count, top 20.
  const phraseMap = new Map<string, number>();
  for (const p of current.commonPhrases ?? []) {
    phraseMap.set(p.phrase.toLowerCase(), p.count);
  }
  for (const p of newAnalysis.common_phrases) {
    const key = p.phrase.toLowerCase();
    phraseMap.set(key, (phraseMap.get(key) ?? 0) + p.count);
  }
  const mergedPhrases: CommonPhrase[] = Array.from(phraseMap.entries())
    .map(([phrase, count]) => ({ phrase, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_PHRASES);

  // greetingPatterns / closingPatterns: union dedup, max N.
  // Preferenza ai nuovi (most-recent-first) per riflettere stile attuale.
  const mergedGreetings = uniqLimit(
    [...newAnalysis.greeting_patterns, ...(current.greetingPatterns ?? [])],
    MAX_GREETINGS,
  );
  const mergedClosings = uniqLimit(
    [...newAnalysis.closing_patterns, ...(current.closingPatterns ?? [])],
    MAX_CLOSINGS,
  );

  // languageDistribution: somma counts.
  const mergedLangs: LanguageDistribution = { ...(current.languageDistribution ?? {}) };
  for (const [lang, count] of Object.entries(newAnalysis.language_distribution)) {
    mergedLangs[lang] = (mergedLangs[lang] ?? 0) + count;
  }

  // voiceConfidence: logaritmica con plateau a ~50 messaggi.
  // confidence = 1 - exp(-N / halfLife)
  const confidence = roundTo(1 - Math.exp(-newCount / CONFIDENCE_HALF_LIFE), 3);

  // processedMessageIds: append, FIFO trunc a MAX_PROCESSED_IDS.
  const mergedIds = [...processedIds, ...trulyNew].slice(-MAX_PROCESSED_IDS);

  return {
    avgSentenceLength: roundTo(mergedAvgSentence, 2),
    formalityScore: roundTo(mergedFormality, 2),
    emojiUsageRate: roundTo(mergedEmojiRate, 3),
    commonPhrases: mergedPhrases,
    greetingPatterns: mergedGreetings,
    closingPatterns: mergedClosings,
    languageDistribution: mergedLangs,
    messagesAnalyzed: newCount,
    voiceConfidence: confidence,
    processedMessageIds: mergedIds,
  };
}

// Weighted moving average con decay 0.95 + bias verso il sample piu'
// recente quando ci sono pochi dati. Per oldCount=0 (primo sample),
// il valore nuovo passa intero.
function blendNumeric(old: number | null, sample: number, oldCount: number): number {
  if (old === null || oldCount === 0) return sample;
  return old * DECAY + sample * (1 - DECAY);
}

function uniqLimit(items: string[], max: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const key = item.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item.trim());
    if (out.length >= max) break;
  }
  return out;
}

function roundTo(n: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}

// Calcola voiceConfidence da messagesAnalyzed. Esposto per test e UI.
export function calcConfidence(messagesAnalyzed: number): number {
  return roundTo(1 - Math.exp(-messagesAnalyzed / CONFIDENCE_HALF_LIFE), 3);
}

export { CONFIDENCE_HALF_LIFE, DECAY };
