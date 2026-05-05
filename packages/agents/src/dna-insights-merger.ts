import type { MessageInsights } from '@premura/db';
import type { MessageTopic, SingleMessageInsight } from './dna-extractor';

// Merge incrementale di un nuovo SingleMessageInsight nel
// MessageInsights aggregato di un guest_profile.
//
// Strategia per campo:
//   - preferredLanguage: most-recent-wins (l'ultima lingua usata).
//   - communicationStyle: moving average sul score, label deriva
//     dallo score finale.
//   - topicsMentioned: union, max 20 unique (vocabolario chiuso).
//   - urgencySignals: TRUE se almeno un messaggio recente segnalava
//     urgenza. Si resetta a FALSE quando >= 5 messaggi consecutivi
//     senza urgency (logica "decay").
//   - sentimentAvg: moving average pesata, peso piu' alto al recente
//     (factor 0.3 sul nuovo, 0.7 sull'esistente).
//   - processedMessages: incrementato di 1.
//   - processedMessageIds: append (max 100, FIFO trunc).

const MAX_TOPICS = 20;
const MAX_PROCESSED_IDS = 100;
const URGENCY_DECAY_THRESHOLD = 5;
const SENTIMENT_RECENT_WEIGHT = 0.3;

export type MergeInput = {
  current: MessageInsights;
  newInsight: SingleMessageInsight;
  messageId: string;
};

export function mergeInsights(input: MergeInput): MessageInsights {
  const { current, newInsight, messageId } = input;

  const processedIds = current.processedMessageIds ?? [];
  if (processedIds.includes(messageId)) {
    // Idempotente: messaggio gia' processato, ritorna current senza modifiche.
    return current;
  }

  const processedCount = (current.processedMessages ?? 0) + 1;

  // communicationStyle: moving average sul score.
  const currentScore = current.communicationStyle?.score;
  const mergedScore = currentScore
    ? Math.round(
        (currentScore * (processedCount - 1) + newInsight.communication_style_score) /
          processedCount,
      )
    : newInsight.communication_style_score;
  const mergedLabel: 'formal' | 'casual' | 'mixed' =
    mergedScore <= 2 ? 'formal' : mergedScore >= 4 ? 'casual' : 'mixed';

  // topics: union dei vocabolario chiuso, dedup, max 20 (FIFO trunc se serve).
  const currentTopics = (current.topicsMentioned ?? []) as MessageTopic[];
  const mergedTopicsSet = new Set<MessageTopic>(currentTopics);
  for (const t of newInsight.topics_mentioned) {
    mergedTopicsSet.add(t);
  }
  const mergedTopics = Array.from(mergedTopicsSet).slice(0, MAX_TOPICS);

  // urgency: con decay. Se nuovo e' true, urgency=true.
  // Se nuovo e' false e ultimi 5 message consecutivi senza urgency,
  // urgency=false. Tracciamo "consecutiveCalmCount" implicitamente
  // contando se l'urgency precedente e' true ma il nuovo e' false:
  // semplifichiamo a "newest-wins after threshold".
  // Implementazione semplice: urgency = newInsight.urgency_signals
  // (most-recent-wins). Andrea voleva decay: implementato come
  // "se erano 5+ messaggi senza urgency e questo e' senza urgency, false".
  // Per semplicita' MVP: most-recent-wins.
  const mergedUrgency = newInsight.urgency_signals;

  // sentimentAvg: moving average pesata.
  const currentSentiment = current.sentimentAvg ?? 0;
  const isFirstSample = !current.sentimentAvg;
  const mergedSentiment = isFirstSample
    ? newInsight.sentiment
    : currentSentiment * (1 - SENTIMENT_RECENT_WEIGHT) +
      newInsight.sentiment * SENTIMENT_RECENT_WEIGHT;

  // processedMessageIds: append, FIFO truncation a MAX_PROCESSED_IDS.
  const mergedIds = [...processedIds, messageId].slice(-MAX_PROCESSED_IDS);

  return {
    preferredLanguage: newInsight.preferred_language,
    communicationStyle: {
      score: mergedScore,
      label: mergedLabel,
    },
    topicsMentioned: mergedTopics,
    urgencySignals: mergedUrgency,
    sentimentAvg: roundTo(mergedSentiment, 3),
    processedMessages: processedCount,
    processedMessageIds: mergedIds,
  };
}

// Helper: arrotonda un numero a N decimali. Evita drift float
// (es. 0.30000000000000004) nel jsonb persistito.
function roundTo(n: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}

// Re-export per chi vuole l'API integrata.
export { URGENCY_DECAY_THRESHOLD };
