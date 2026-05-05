import type { MergedVoiceProfile } from '@premura/agents';
import { type Database, hostVoiceProfiles, messages } from '@premura/db';
import { and, desc, eq } from 'drizzle-orm';

// Slice 8.4 — Repository host_voice_profiles.
//
// getHostVoiceProfile: helper esposto per draft generator futuro
// (Conversation Agent userà questo come system prompt context).
//
// upsertVoiceProfile: lookup-or-insert + UPDATE atomico con merged
// fields. Race condition lock-free accettata (bassa concorrenza:
// outbound host messaggi seriali).
//
// fetchRecentOutboundForHost: sliding window N=20 messaggi outbound
// piu' recenti dell'host (across tutte le properties / canali),
// usati come input al voice profiler.

export type VoiceProfileSummary = {
  id: string;
  hostId: string;
  avgSentenceLength: number | null;
  formalityScore: number | null;
  emojiUsageRate: number | null;
  commonPhrases: Array<{ phrase: string; count: number }>;
  greetingPatterns: string[];
  closingPatterns: string[];
  languageDistribution: Record<string, number>;
  messagesAnalyzed: number;
  voiceConfidence: number;
  processedMessageIds: string[];
};

export async function getHostVoiceProfile(
  db: Database,
  hostId: string,
): Promise<VoiceProfileSummary | null> {
  const [row] = await db
    .select({
      id: hostVoiceProfiles.id,
      hostId: hostVoiceProfiles.hostId,
      avgSentenceLength: hostVoiceProfiles.avgSentenceLength,
      formalityScore: hostVoiceProfiles.formalityScore,
      emojiUsageRate: hostVoiceProfiles.emojiUsageRate,
      commonPhrases: hostVoiceProfiles.commonPhrases,
      greetingPatterns: hostVoiceProfiles.greetingPatterns,
      closingPatterns: hostVoiceProfiles.closingPatterns,
      languageDistribution: hostVoiceProfiles.languageDistribution,
      messagesAnalyzed: hostVoiceProfiles.messagesAnalyzed,
      voiceConfidence: hostVoiceProfiles.voiceConfidence,
      processedMessageIds: hostVoiceProfiles.processedMessageIds,
    })
    .from(hostVoiceProfiles)
    .where(eq(hostVoiceProfiles.hostId, hostId))
    .limit(1);

  if (!row) return null;
  return {
    id: row.id,
    hostId: row.hostId,
    avgSentenceLength: row.avgSentenceLength ? Number(row.avgSentenceLength) : null,
    formalityScore: row.formalityScore ? Number(row.formalityScore) : null,
    emojiUsageRate: row.emojiUsageRate ? Number(row.emojiUsageRate) : null,
    commonPhrases: row.commonPhrases ?? [],
    greetingPatterns: row.greetingPatterns ?? [],
    closingPatterns: row.closingPatterns ?? [],
    languageDistribution: row.languageDistribution ?? {},
    messagesAnalyzed: row.messagesAnalyzed,
    voiceConfidence: Number(row.voiceConfidence ?? 0),
    processedMessageIds: row.processedMessageIds ?? [],
  };
}

export async function upsertVoiceProfile(
  db: Database,
  hostId: string,
  merged: MergedVoiceProfile,
): Promise<{ inserted: boolean }> {
  // Try update first (path comune dopo il primo profilo).
  const [updated] = await db
    .update(hostVoiceProfiles)
    .set({
      avgSentenceLength: String(merged.avgSentenceLength),
      formalityScore: String(merged.formalityScore),
      emojiUsageRate: String(merged.emojiUsageRate),
      commonPhrases: merged.commonPhrases,
      greetingPatterns: merged.greetingPatterns,
      closingPatterns: merged.closingPatterns,
      languageDistribution: merged.languageDistribution,
      messagesAnalyzed: merged.messagesAnalyzed,
      voiceConfidence: String(merged.voiceConfidence),
      processedMessageIds: merged.processedMessageIds,
      lastUpdatedAt: new Date(),
    })
    .where(eq(hostVoiceProfiles.hostId, hostId))
    .returning({ id: hostVoiceProfiles.id });

  if (updated) return { inserted: false };

  // Nessuna riga aggiornata: insert new.
  await db.insert(hostVoiceProfiles).values({
    hostId,
    avgSentenceLength: String(merged.avgSentenceLength),
    formalityScore: String(merged.formalityScore),
    emojiUsageRate: String(merged.emojiUsageRate),
    commonPhrases: merged.commonPhrases,
    greetingPatterns: merged.greetingPatterns,
    closingPatterns: merged.closingPatterns,
    languageDistribution: merged.languageDistribution,
    messagesAnalyzed: merged.messagesAnalyzed,
    voiceConfidence: String(merged.voiceConfidence),
    processedMessageIds: merged.processedMessageIds,
  });
  return { inserted: true };
}

// Sliding window: ultimi N messaggi outbound dell'host (across canali
// platform-based: whatsapp, booking_inbox, airbnb_inbox).
// Filtro fromEntity=host esclude messaggi outbound generati da Premura
// agente (fromEntity=premura) — quelli sono auto-generati e
// inquinerebbero il voice profile.
export async function fetchRecentOutboundForHost(
  db: Database,
  hostId: string,
  limit = 20,
): Promise<Array<{ id: string; body: string; createdAt: Date }>> {
  // Risoluzione hostId -> bookingIds tramite properties + bookings.
  // I messaggi non hanno host_id diretto, ma booking_id -> property_id ->
  // host_id. JOIN piu' stretto possibile.
  const { bookings, properties } = await import('@premura/db');
  const rows = await db
    .select({
      id: messages.id,
      body: messages.body,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .innerJoin(bookings, eq(messages.bookingId, bookings.id))
    .innerJoin(properties, eq(bookings.propertyId, properties.id))
    .where(
      and(
        eq(properties.hostId, hostId),
        eq(messages.direction, 'outbound'),
        eq(messages.fromEntity, 'host'),
      ),
    )
    .orderBy(desc(messages.createdAt))
    .limit(limit);
  return rows.reverse(); // cronologico crescente per il prompt
}
