import {
  type Database,
  bookings,
  hostVoiceProfiles,
  hosts,
  kits,
  properties,
  propertyKnowledge,
} from '@premura/db';
import { and, eq, gte, isNotNull, isNull, lte, sql } from 'drizzle-orm';
import type { VoiceProfileHints } from './welcome-generator';

// Slice E — Finder kit pronti per welcome message.
//
// Criteri:
//  - kit.status = 'set_up' AND cleanerPhotoUrl IS NOT NULL
//  - booking.checkinAt e' OGGI
//  - kit.welcomeMessageSentAt IS NULL (idempotency)
//  - host.welcomeAutoSend = true
//  - now >= host.welcomeTimeSlot (HH:MM)

export type WelcomeMessageCandidate = {
  kitId: string;
  bookingId: string;
  hostId: string;
  hostFullName: string | null;
  hostFirstName: string | null;
  guestFullName: string;
  guestFirstName: string | null;
  guestPhone: string | null;
  guestLanguage: string;
  propertyName: string;
  propertyId: string;
  checkinAt: Date;
  cleanerPhotoUrl: string;
  cardMessage: string | null;
  cardMessageEn: string | null;
  keyboxCode: string | null;
};

export async function findKitsForWelcomeMessage(
  db: Database,
  now: Date = new Date(),
): Promise<WelcomeMessageCandidate[]> {
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const rows = await db
    .select({
      kitId: kits.id,
      bookingId: kits.bookingId,
      hostId: hosts.id,
      hostFullName: hosts.fullName,
      hostEmail: hosts.email,
      guestFullName: bookings.guestFullName,
      guestFirstName: bookings.guestFirstName,
      guestPhone: bookings.guestPhone,
      guestLanguage: kits.guestLanguage,
      propertyName: properties.name,
      propertyId: properties.id,
      checkinAt: bookings.checkinAt,
      cleanerPhotoUrl: kits.cleanerPhotoUrl,
      cardMessage: kits.cardMessage,
      cardMessageEn: kits.cardMessageEn,
      welcomeAutoSend: hosts.welcomeAutoSend,
      welcomeTimeSlot: hosts.welcomeTimeSlot,
    })
    .from(kits)
    .innerJoin(bookings, eq(kits.bookingId, bookings.id))
    .innerJoin(properties, eq(bookings.propertyId, properties.id))
    .innerJoin(hosts, eq(properties.hostId, hosts.id))
    .where(
      and(
        sql`${kits.status} = 'set_up'`,
        isNotNull(kits.cleanerPhotoUrl),
        isNull(kits.welcomeMessageSentAt),
        gte(bookings.checkinAt, startOfDay),
        lte(bookings.checkinAt, endOfDay),
        eq(hosts.welcomeAutoSend, true),
        lte(hosts.welcomeTimeSlot, hhmm),
      ),
    );

  if (rows.length === 0) return [];

  const propIds = [...new Set(rows.map((r) => r.propertyId))];
  const knowledgeRows = await db
    .select({
      propertyId: propertyKnowledge.propertyId,
      keybox: propertyKnowledge.keybox,
    })
    .from(propertyKnowledge)
    .where(sql`${propertyKnowledge.propertyId} = ANY(${propIds})`);
  const keyboxMap = new Map<string, string | null>();
  for (const k of knowledgeRows) {
    keyboxMap.set(k.propertyId, k.keybox?.code ?? null);
  }

  return rows.map((r) => ({
    kitId: r.kitId,
    bookingId: r.bookingId,
    hostId: r.hostId,
    hostFullName: r.hostFullName,
    hostFirstName: r.hostFullName ? (r.hostFullName.split(' ')[0] ?? null) : null,
    guestFullName: r.guestFullName,
    guestFirstName: r.guestFirstName,
    guestPhone: r.guestPhone,
    guestLanguage: r.guestLanguage,
    propertyName: r.propertyName,
    propertyId: r.propertyId,
    checkinAt: r.checkinAt,
    cleanerPhotoUrl: r.cleanerPhotoUrl ?? '',
    cardMessage: r.cardMessage,
    cardMessageEn: r.cardMessageEn,
    keyboxCode: keyboxMap.get(r.propertyId) ?? null,
  }));
}

// Voice profile hints loader per il generator (Sonnet 4.6 path).
// Ritorna null se profile assente o confidence <= 0.6 (caller scartera').
export async function loadVoiceProfileForHost(
  db: Database,
  hostId: string,
): Promise<VoiceProfileHints | null> {
  const [row] = await db
    .select({
      voiceConfidence: hostVoiceProfiles.voiceConfidence,
      formality: hostVoiceProfiles.formality,
      emojiUsage: hostVoiceProfiles.emojiUsage,
      emojiExamples: hostVoiceProfiles.emojiExamples,
      toneKeywords: hostVoiceProfiles.toneKeywords,
      signatureStyle: hostVoiceProfiles.signatureStyle,
      exampleGreetings: hostVoiceProfiles.exampleGreetings,
      exampleClosings: hostVoiceProfiles.exampleClosings,
      avgMessageLength: hostVoiceProfiles.avgMessageLength,
    })
    .from(hostVoiceProfiles)
    .where(eq(hostVoiceProfiles.hostId, hostId))
    .limit(1);
  if (!row) return null;
  return {
    confidence: Number(row.voiceConfidence ?? 0),
    formality: row.formality,
    emojiUsage: row.emojiUsage,
    emojiExamples: row.emojiExamples ?? [],
    toneKeywords: row.toneKeywords ?? [],
    signatureStyle: row.signatureStyle ?? null,
    exampleGreetings: row.exampleGreetings ?? [],
    exampleClosings: row.exampleClosings ?? [],
    avgMessageLength: row.avgMessageLength,
  };
}

// Stale: kit con checkin oggi ma cleanerPhotoUrl null (foto manca).
// thresholdHour = 8 (08:00 alert founder + cleaner) o 9 (09:00 escalation).
export async function findStaleSetups(
  db: Database,
  thresholdHour = 9,
  now: Date = new Date(),
): Promise<
  Array<{
    kitId: string;
    bookingId: string;
    hostId: string;
    propertyName: string;
    propertyId: string;
    cleanerName: string | null;
    cleanerPhone: string | null;
    guestFirstName: string | null;
    checkinAt: Date;
    kitStatus: string;
    photoUploaded: boolean;
  }>
> {
  if (now.getHours() < thresholdHour) return [];
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);

  // Lazy import cleaners per evitare cycle (relations.ts gestisce FK gia').
  const { cleaners } = await import('@premura/db');

  const rows = await db
    .select({
      kitId: kits.id,
      bookingId: kits.bookingId,
      hostId: hosts.id,
      kitStatus: kits.status,
      cleanerPhotoUrl: kits.cleanerPhotoUrl,
      propertyName: properties.name,
      propertyId: properties.id,
      cleanerName: cleaners.fullName,
      cleanerPhone: cleaners.whatsappNumber,
      guestFirstName: bookings.guestFirstName,
      checkinAt: bookings.checkinAt,
    })
    .from(kits)
    .innerJoin(bookings, eq(kits.bookingId, bookings.id))
    .innerJoin(properties, eq(bookings.propertyId, properties.id))
    .innerJoin(hosts, eq(properties.hostId, hosts.id))
    .leftJoin(cleaners, eq(properties.cleanerId, cleaners.id))
    .where(
      and(
        gte(bookings.checkinAt, startOfDay),
        lte(bookings.checkinAt, endOfDay),
        isNull(kits.welcomeMessageSentAt),
        sql`${kits.status} NOT IN ('delivered_to_guest', 'rejected')`,
      ),
    );

  return rows
    .filter((r) => {
      // 08:00 tick: photo missing → alert.
      // 09:00 tick: status NOT set_up OR photo missing → alert escalation.
      const photoUploaded = !!r.cleanerPhotoUrl;
      if (thresholdHour <= 8) return !photoUploaded;
      return r.kitStatus !== 'set_up' || !photoUploaded;
    })
    .map((r) => ({
      kitId: r.kitId,
      bookingId: r.bookingId,
      hostId: r.hostId,
      propertyName: r.propertyName,
      propertyId: r.propertyId,
      cleanerName: r.cleanerName,
      cleanerPhone: r.cleanerPhone,
      guestFirstName: r.guestFirstName,
      checkinAt: r.checkinAt,
      kitStatus: r.kitStatus,
      photoUploaded: !!r.cleanerPhotoUrl,
    }));
}

/**
 * Marca il kit come consegnato all'ospite.
 *
 * providerMessageId e' OBBLIGATORIO e non nullo: e' la prova che il
 * messaggio e' partito davvero (Andrea, 05/08).
 *
 * PERCHE'. Prima la firma era (db, kitId) e bastava chiamarla per
 * dichiarare "consegnato". Col kill switch attivo il transport non
 * inviava nulla, il chiamante non se ne accorgeva, e questa funzione
 * scriveva welcome_message_sent_at + status 'delivered_to_guest':
 * il benvenuto risultava consegnato e non ripartiva piu'.
 *
 * Il contratto invertito di sendText/sendImage ferma il chiamante di
 * oggi, ma non chi scrivera' il prossimo fra sei mesi. Pretendere la
 * prova come parametro sposta il controllo dal comportamento al tipo:
 * marcare "consegnato" senza un id reale diventa un errore di
 * compilazione. In dry-run l'id e' null, quindi non si compila — ed e'
 * corretto, perche' "simulato" non e' "inviato".
 *
 * Stesso modello di setKitSetupComplete, che senza photoUrl non si
 * puo' chiamare.
 */
export async function markWelcomeMessageSent(
  db: Database,
  kitId: string,
  providerMessageId: string,
): Promise<{ ok: true } | { ok: false; reason: 'not_found' }> {
  if (!providerMessageId) {
    throw new Error(
      '[markWelcomeMessageSent] providerMessageId vuoto: non e una prova di invio. ' +
        'Se il messaggio non e partito, non marcare il kit come consegnato.',
    );
  }
  const now = new Date();
  const [row] = await db
    .update(kits)
    .set({
      welcomeMessageSentAt: now,
      status: 'delivered_to_guest',
      guestConfirmedAt: now,
      updatedAt: now,
    })
    .where(eq(kits.id, kitId))
    .returning({ id: kits.id });
  if (!row) return { ok: false, reason: 'not_found' };
  return { ok: true };
}
