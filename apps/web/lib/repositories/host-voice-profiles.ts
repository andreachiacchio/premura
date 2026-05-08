import type { MergedVoiceProfile } from '@premura/agents';
import { type Database, hostVoiceProfiles, messages } from '@premura/db';
import { and, desc, eq } from 'drizzle-orm';

// Slice 8.4 — Repository host_voice_profiles.
//
// upsertVoiceProfile: lookup-or-insert + UPDATE atomico con merged
// fields. Race condition lock-free accettata (bassa concorrenza:
// outbound host messaggi seriali).
//
// fetchRecentOutboundForHost: sliding window N=20 messaggi outbound
// piu' recenti dell'host (across tutte le properties / canali),
// usati come input al voice profiler.
//
// Slice 7a.4: getHostVoiceProfile (read-only) spostato in
// @premura/agents (context-readers) per condivisione apps/web +
// apps/api worker. Re-export qui per compat dei call-site interni.

export {
  type VoiceProfileSummary,
  getHostVoiceProfile,
} from '@premura/agents';

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
