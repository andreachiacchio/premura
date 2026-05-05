import { type Database, bookings, properties } from '@premura/db';
import { and, eq } from 'drizzle-orm';
import {
  type AirbnbMessageClassification,
  classifyAirbnbMessage,
} from './airbnb-message-classifier';
import {
  type AirbnbMessageInput,
  type ParsedAirbnbMessage,
  parseAirbnbMessage,
} from './airbnb-message-parser';
import {
  type BookingMessageClassification,
  classifyBookingMessage,
  extractBookingMessagePreview,
} from './booking-message-classifier';
import { insertInboundMessage } from './repositories/messages';

// Ingestor degli eventi Gmail tipo "messaggio ospite" (slice 7a.2).
//
// Distinzione strategica fra Booking e Airbnb:
//   - Booking: trigger-only nel ~70-80% dei casi. Body extraction
//     deterministica (best-effort regex su HTML/text). Niente AI.
//     Persistito con metadata.signal_only=true se solo trigger,
//     metadata.truncated=true se preview parziale.
//   - Airbnb: content-rich. Parser AI Sonnet 4.6 estrae body completo +
//     lingua + thread_id per future bidirezionalita' (spike H 7b).
//
// Lookup booking: via booking_external_code (estratto dal subject Booking
// o dal parser AI Airbnb) JOIN-ato con properties.host_id. Se non match
// -> orphan inbound (booking_id null).
//
// Idempotenza: dedup su platform_message_id (Gmail messageId) nel
// repository messages.

export type GmailMessageEventResult = {
  status: 'inserted' | 'duplicate_skipped' | 'orphan_inserted' | 'skipped_not_message';
  bookingId: string | null;
  conversationId: string | null;
  messageId: string | null;
  reason: string | null;
};

export type IngestBookingMessageInput = {
  hostId: string;
  emailId: string; // Gmail Message-ID
  emailReceivedAt: Date;
  subject: string;
  htmlBody: string;
  textBody: string;
  snippet: string;
};

export async function ingestBookingMessage(
  db: Database,
  input: IngestBookingMessageInput,
): Promise<GmailMessageEventResult> {
  const classification = classifyBookingMessage(input.subject);
  if (classification.type !== 'message') {
    return {
      status: 'skipped_not_message',
      bookingId: null,
      conversationId: null,
      messageId: null,
      reason: 'subject did not match Booking message pattern',
    };
  }

  const preview = extractBookingMessagePreview(input.htmlBody, input.textBody, input.snippet);

  const bookingId = classification.bookingExternalCode
    ? await findBookingForHost(db, input.hostId, 'booking', classification.bookingExternalCode)
    : null;

  // Externalt thread id Booking: usiamo il booking_external_code se
  // presente, altrimenti null. Booking non espone un thread id stabile.
  const externalThreadId = classification.bookingExternalCode ?? null;

  const body = preview.signalOnly
    ? `[Booking message ricevuto da ${classification.senderName} — apri Extranet per leggere]`
    : (preview.preview ?? `[Booking message ricevuto da ${classification.senderName}]`);

  const result = await insertInboundMessage(db, {
    bookingId,
    channel: 'booking_inbox',
    externalThreadId,
    platformMessageId: input.emailId,
    body,
    language: null,
    sentAt: input.emailReceivedAt,
    metadata: {
      sender_name: classification.senderName,
      booking_code: classification.bookingExternalCode,
      signal_only: preview.signalOnly,
      truncated: preview.truncated,
      raw_subject: classification.rawSubject,
    },
  });

  return {
    status: result.status,
    bookingId,
    conversationId: result.conversationId,
    messageId: result.messageId,
    reason: null,
  };
}

export type IngestAirbnbMessageInput = {
  hostId: string;
  emailId: string;
  emailReceivedAt: Date;
  subject: string;
  htmlBody: string;
  textBody: string;
  // Parser injectabile per test (no Anthropic).
  parser?: (input: AirbnbMessageInput) => Promise<ParsedAirbnbMessage>;
};

export async function ingestAirbnbMessage(
  db: Database,
  input: IngestAirbnbMessageInput,
): Promise<GmailMessageEventResult> {
  const classification = classifyAirbnbMessage(input.subject);
  if (classification.type !== 'message') {
    return {
      status: 'skipped_not_message',
      bookingId: null,
      conversationId: null,
      messageId: null,
      reason: 'subject did not match Airbnb message pattern',
    };
  }

  // Step 2: parser AI (default Sonnet 4.6, override-able per test).
  const parser = input.parser ?? parseAirbnbMessage;
  let parsed: ParsedAirbnbMessage;
  try {
    parsed = await parser({
      htmlBody: input.htmlBody,
      textBody: input.textBody,
      date: input.emailReceivedAt,
      subject: input.subject,
    });
  } catch (err) {
    // Parser AI ha fallito: persistiamo comunque un placeholder con
    // metadata.parser_error. Niente perdita di segnale per la dashboard
    // host ("ti hanno scritto su Airbnb, vai a leggere").
    const reason = err instanceof Error ? err.message : String(err);
    const result = await insertInboundMessage(db, {
      bookingId: null,
      channel: 'airbnb_inbox',
      externalThreadId: null,
      platformMessageId: input.emailId,
      body: `[Airbnb message ricevuto da ${classification.senderName} — parser error]`,
      language: null,
      sentAt: input.emailReceivedAt,
      metadata: {
        sender_name: classification.senderName,
        parser_error: reason,
        raw_subject: classification.rawSubject,
      },
    });
    return {
      status: result.status,
      bookingId: null,
      conversationId: result.conversationId,
      messageId: result.messageId,
      reason,
    };
  }

  const bookingId = parsed.booking_external_code
    ? await findBookingForHost(db, input.hostId, 'airbnb', parsed.booking_external_code)
    : null;

  const body = parsed.guest_message_original
    ? parsed.guest_message_original
    : `[Airbnb message ricevuto da ${classification.senderName} — body non estratto]`;

  const externalThreadId = parsed.airbnb_thread_id ?? parsed.booking_external_code ?? null;

  const result = await insertInboundMessage(db, {
    bookingId,
    channel: 'airbnb_inbox',
    externalThreadId,
    platformMessageId: input.emailId,
    body,
    language: parsed.guest_message_lang,
    sentAt: input.emailReceivedAt,
    metadata: {
      sender_name: classification.senderName,
      airbnb_thread_id: parsed.airbnb_thread_id,
      booking_code: parsed.booking_external_code,
      property_name: parsed.property_name,
      raw_subject: classification.rawSubject,
    },
  });

  return {
    status: result.status,
    bookingId,
    conversationId: result.conversationId,
    messageId: result.messageId,
    reason: null,
  };
}

async function findBookingForHost(
  db: Database,
  hostId: string,
  platform: 'booking' | 'airbnb',
  code: string,
): Promise<string | null> {
  const rows = await db
    .select({ id: bookings.id })
    .from(bookings)
    .innerJoin(properties, eq(bookings.propertyId, properties.id))
    .where(
      and(
        eq(properties.hostId, hostId),
        eq(bookings.platform, platform),
        eq(bookings.bookingExternalCode, code),
      ),
    )
    .limit(1);
  return rows[0]?.id ?? null;
}

// Re-export per orchestrator + test.
export type { AirbnbMessageClassification, BookingMessageClassification };
