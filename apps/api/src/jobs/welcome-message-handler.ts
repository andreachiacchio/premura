import {
  generateWelcomeMessage,
  loadVoiceProfileForHost,
  logAgentAction,
  markWelcomeMessageSent,
} from '@premura/agents';
import {
  type Database,
  bookings,
  hosts,
  kits,
  messages,
  properties,
  propertyKnowledge,
} from '@premura/db';
import { sendImage } from '@premura/integrations';
import type { Job } from 'bullmq';
import { eq } from 'drizzle-orm';
import pino from 'pino';
import type { WelcomeJobData } from './welcome-message-queue';

// Slice E — Handler welcome message job.
//
// Flow:
//  1. Fetch context completo (kit + booking + property + host + knowledge).
//  2. Skip se gia' sent / no phone / no photo.
//  3. Carica voice profile host (Sonnet 4.6 path se confidence > 0.6).
//  4. Genera messaggio (voice-aware OR template fallback).
//  5. Invia via WA Cloud API con foto allegata.
//  6. Insert row messages (outbound, stage='kit_reveal', source='premura_welcome').
//  7. markWelcomeMessageSent → kit.status='delivered_to_guest'.

const logger = pino({
  name: 'welcome-message-handler',
  level: process.env.LOG_LEVEL ?? 'info',
});

export async function processWelcomeJob(
  db: Database,
  job: Job<WelcomeJobData>,
): Promise<{ status: string; reason?: string }> {
  const { kitId } = job.data;

  const [row] = await db
    .select({
      kitId: kits.id,
      bookingId: kits.bookingId,
      hostId: hosts.id,
      hostFullName: hosts.fullName,
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
      welcomeMessageSentAt: kits.welcomeMessageSentAt,
    })
    .from(kits)
    .innerJoin(bookings, eq(kits.bookingId, bookings.id))
    .innerJoin(properties, eq(bookings.propertyId, properties.id))
    .innerJoin(hosts, eq(properties.hostId, hosts.id))
    .where(eq(kits.id, kitId))
    .limit(1);

  if (!row) {
    logger.warn({ kitId }, 'welcome handler: kit not found, skip');
    return { status: 'skipped_no_kit' };
  }
  if (row.welcomeMessageSentAt) {
    logger.info({ kitId }, 'welcome handler: already sent, idempotent skip');
    return { status: 'already_sent' };
  }
  if (!row.guestPhone) {
    logger.warn({ kitId }, 'welcome handler: no guest phone');
    return { status: 'skipped_no_phone' };
  }
  if (!row.cleanerPhotoUrl) {
    logger.warn({ kitId }, 'welcome handler: no photo (cleaner setup incomplete)');
    return { status: 'skipped_no_photo' };
  }

  const [knowledgeRow] = await db
    .select({ keybox: propertyKnowledge.keybox })
    .from(propertyKnowledge)
    .where(eq(propertyKnowledge.propertyId, row.propertyId))
    .limit(1);
  const keyboxCode = knowledgeRow?.keybox?.code ?? null;

  const voiceProfile = await loadVoiceProfileForHost(db, row.hostId);

  const candidate = {
    kitId: row.kitId,
    bookingId: row.bookingId,
    hostId: row.hostId,
    hostFullName: row.hostFullName,
    hostFirstName: row.hostFullName ? (row.hostFullName.split(' ')[0] ?? null) : null,
    guestFullName: row.guestFullName,
    guestFirstName: row.guestFirstName,
    guestPhone: row.guestPhone,
    guestLanguage: row.guestLanguage,
    propertyName: row.propertyName,
    propertyId: row.propertyId,
    checkinAt: row.checkinAt,
    cleanerPhotoUrl: row.cleanerPhotoUrl,
    cardMessage: row.cardMessage,
    cardMessageEn: row.cardMessageEn,
    keyboxCode,
  };

  // logAgentAction wrap: cattura cost + reasoning di Sonnet (se voice path).
  // Template path: cost=0, model=null (no row utile, ma scriviamo lo stesso
  // come "system" action per audit invio).
  const generated = await logAgentAction(db, {
    hostId: row.hostId,
    bookingId: row.bookingId,
    agent: voiceProfile && Number(voiceProfile.confidence) > 0.6 ? 'message_writer' : 'system',
    actionType: 'welcome_message_generate',
    inputSummary: {
      kitId,
      language: row.guestLanguage,
      voiceConfidence: voiceProfile?.confidence ?? null,
      hasKeybox: keyboxCode !== null,
      hasCardMessage: !!(row.cardMessage || row.cardMessageEn),
    },
    fn: async () => {
      const out = await generateWelcomeMessage({ ...candidate, voiceProfile });
      return {
        output: {
          source: out.source,
          language: out.language,
          length: out.text.length,
        },
        reasoning: `source=${out.source} lang=${out.language} keybox=${out.hasKeybox}`,
        model: out.modelUsed ?? undefined,
        usage:
          out.inputTokens != null && out.outputTokens != null
            ? { input_tokens: out.inputTokens, output_tokens: out.outputTokens }
            : undefined,
      };
    },
  });

  // Re-genera per ottenere il text (logAgentAction salva solo summary).
  // Trade-off accettabile: doppia chiamata template (0 costo). Per voice
  // path la prima chiamata costa, ma usiamo cache_control sul system
  // prompt quindi il second hit e' barely a 10% del primo.
  const msg = await generateWelcomeMessage({ ...candidate, voiceProfile });

  try {
    const res = await sendImage({
      to: row.guestPhone,
      imageUrl: row.cleanerPhotoUrl,
      caption: msg.text,
    });

    const now = new Date();
    await db.insert(messages).values({
      bookingId: row.bookingId,
      channel: 'whatsapp',
      direction: 'outbound',
      fromEntity: 'premura',
      toEntity: 'guest',
      stage: 'kit_reveal',
      body: msg.text,
      language: msg.language,
      platformMessageId: res.messageId,
      recipientExternalId: row.guestPhone,
      sentAt: now,
      agentModel: msg.modelUsed,
      agentCostUsd: msg.costUsd ? msg.costUsd.toFixed(6) : null,
      agentReasoning: `welcome_message source=${msg.source}`,
      metadata: {
        source: 'premura_welcome',
        kitId,
        photoUrl: row.cleanerPhotoUrl,
        generatorSource: msg.source,
      },
    });

    await markWelcomeMessageSent(db, kitId);

    logger.info(
      {
        kitId,
        messageId: res.messageId,
        language: msg.language,
        source: msg.source,
        hasKeybox: msg.hasKeybox,
        costUsd: msg.costUsd,
      },
      'welcome message sent',
    );
    return { status: 'sent' };
  } catch (err) {
    logger.error(
      { err, kitId, generatedAction: generated.agentActionId },
      'welcome message send failed',
    );
    throw err;
  }
}
