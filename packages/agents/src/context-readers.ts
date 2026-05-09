import {
  type Database,
  type EmergencyContact,
  type HouseRules,
  type KeyboxInfo,
  type LocalTip,
  type NearbyEssential,
  type ParkingInfo,
  type WifiInfo,
  hostVoiceProfiles,
  propertyKnowledge,
} from '@premura/db';
import { eq } from 'drizzle-orm';

// Read-only context helpers usati dalle pipeline AI.
// Esposti in @premura/agents per condivisione fra apps/web (server actions
// + dashboard) e apps/api (worker BullMQ draft-generation, slice 7a.4).
//
// Le scritture (upsertVoiceProfile, upsertPropertyKnowledge) restano in
// apps/web/lib/repositories perche' attaccate al ciclo onboarding/edit
// dell'host.

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

export type PropertyKnowledgeView = {
  propertyId: string;
  keybox: KeyboxInfo | null;
  wifi: WifiInfo | null;
  parking: ParkingInfo | null;
  houseRules: HouseRules | null;
  emergencyContacts: EmergencyContact[];
  nearbyEssentials: NearbyEssential[];
  additionalInfo: string | null;
  // Slice C/G aggiunte.
  kitDefaultPlacement: string | null;
  checkInInstructions: string | null;
  checkOutInstructions: string | null;
  localTipsCuratedHost: LocalTip[];
  housePhotos: string[];
  languageDefault: string;
  updatedAt: Date | null;
};

export async function getPropertyKnowledge(
  db: Database,
  propertyId: string,
): Promise<PropertyKnowledgeView | null> {
  const [row] = await db
    .select()
    .from(propertyKnowledge)
    .where(eq(propertyKnowledge.propertyId, propertyId))
    .limit(1);
  if (!row) return null;
  return {
    propertyId: row.propertyId,
    keybox: row.keybox,
    wifi: row.wifi,
    parking: row.parking,
    houseRules: row.houseRules,
    emergencyContacts: row.emergencyContacts,
    nearbyEssentials: row.nearbyEssentials,
    additionalInfo: row.additionalInfo,
    kitDefaultPlacement: row.kitDefaultPlacement ?? null,
    checkInInstructions: row.checkInInstructions ?? null,
    checkOutInstructions: row.checkOutInstructions ?? null,
    localTipsCuratedHost: row.localTipsCuratedHost ?? [],
    housePhotos: row.housePhotos ?? [],
    languageDefault: row.languageDefault ?? 'it',
    updatedAt: row.updatedAt,
  };
}
