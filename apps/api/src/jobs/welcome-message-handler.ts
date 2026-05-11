import { generateWelcomeMessage, markWelcomeMessageSent } from '@premura/agents';
import { type Database, bookings, hosts, kits, properties, propertyKnowledge } from '@premura/db';
import { sendImage } from '@premura/integrations';
import type { Job } from 'bullmq';
import { eq } from 'drizzle-orm';
import pino from 'pino';
import type { WelcomeJobData } from './welcome-message-queue';

// Slice E — Handler welcome message job.

const logger = pino({
  name: 'welcome-message-handler',
  level: process.env.LOG_LEVEL ?? 'info',
});

export async function processWelcomeJob(
  db: Database,
  job: Job<WelcomeJobData>,
): Promise<{ status: string; reason?: string }> {
  const { kitId } = job.data;

  // Fetch context completo.
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

  // Keybox code da property_knowledge (opzionale).
  const [knowledgeRow] = await db
    .select({ keybox: propertyKnowledge.keybox })
    .from(propertyKnowledge)
    .where(eq(propertyKnowledge.propertyId, row.propertyId))
    .limit(1);
  const keyboxCode = knowledgeRow?.keybox?.code ?? null;

  const msg = generateWelcomeMessage({
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
  });

  try {
    const res = await sendImage({
      to: row.guestPhone,
      imageUrl: row.cleanerPhotoUrl,
      caption: msg.text,
    });
    await markWelcomeMessageSent(db, kitId);
    logger.info(
      { kitId, messageId: res.messageId, language: msg.language, hasKeybox: msg.hasKeybox },
      'welcome message sent',
    );
    return { status: 'sent' };
  } catch (err) {
    logger.error({ err, kitId }, 'welcome message send failed');
    throw err;
  }
}
