import { and, eq } from 'drizzle-orm';
import {
  bookings,
  properties,
  type Database,
  type ServerClient,
} from '@premura/db';
import type { ClassifiedBookingEmail } from './booking-email-classifier';
import { insertBookingEmailEvent } from './repositories/booking-email-events';

// Ingestor degli eventi Booking.com (M2a.3 Fase 3).
//
// Le email Booking sono usate solo come EVENT TRIGGERS, mai come fonte
// dati primaria: il classifier (regex deterministico) ne estrae il tipo
// di evento + il booking_external_code, e l'ingestor cross-referenzia
// con la riga `bookings` creata via iCal (M2a.1).
//
// Logica per event type:
//   - new_booking:    se booking esiste → status='updated' (no-op nel DB
//                     a parte aggiornamento rawEmailId/lastEmailSyncedAt).
//                     Se non esiste → 'unmatched' con reason 'iCal not yet
//                     polled'. NON creiamo booking nuovi: l'email non
//                     espone i dati strutturati necessari.
//   - cancellation:   se booking esiste → UPDATE status='cancelled',
//                     lastEmailSyncedAt=now, rawEmailId. 'updated'.
//                     Altrimenti 'unmatched'.
//   - modification:   se booking esiste → UPDATE solo lastEmailSyncedAt,
//                     rawEmailId (status non cambia, è solo segnale per
//                     re-sync iCal in futuro). 'updated' con reason
//                     'marked_for_resync'. Altrimenti 'unmatched'.
//   - noise:          status='skipped' immediato senza DB lookup.
//
// Indipendentemente dal risultato, viene scritta una riga in
// `booking_email_events` come audit trail (idempotente via uniqueIndex
// su raw_email_id).
//
// IMPORTANTE: questo modulo NON usa Anthropic SDK. È regex pura → costo
// zero in chiamate API.

export type BookingEventStatus =
  | 'created'
  | 'updated'
  | 'unmatched'
  | 'skipped'
  | 'error';

export type BookingEventResult = {
  status: BookingEventStatus;
  bookingId: string | null;
  reason: string | null;
};

export type IngestBookingEventInput = {
  classified: ClassifiedBookingEmail;
  hostId: string;
  emailId: string;
  emailReceivedAt: Date;
};

export async function ingestBookingEvent(
  serverClient: Pick<ServerClient, 'db'>,
  input: IngestBookingEventInput,
): Promise<BookingEventResult> {
  const { classified, hostId, emailId, emailReceivedAt } = input;
  const { db } = serverClient;

  // ─── Noise: skip immediato + audit row, niente DB lookup. ───
  if (classified.eventType === 'noise') {
    await insertBookingEmailEvent(db, {
      hostId,
      bookingId: null,
      eventType: 'noise',
      bookingExternalCode: null,
      rawSubject: classified.rawSubject,
      rawEmailId: emailId,
      emailReceivedAt,
      ingestionStatus: 'skipped',
      ingestionReason: 'subject did not match any Booking event pattern',
    });
    return { status: 'skipped', bookingId: null, reason: null };
  }

  // ─── Eventi riconosciuti: serve il code per cross-ref. ───
  // Se manca il code (regex matcha l'evento ma non il numero) trattiamo
  // come unmatched: niente booking lookup possibile.
  if (!classified.bookingExternalCode) {
    await insertBookingEmailEvent(db, {
      hostId,
      bookingId: null,
      eventType: classified.eventType,
      bookingExternalCode: null,
      rawSubject: classified.rawSubject,
      rawEmailId: emailId,
      emailReceivedAt,
      ingestionStatus: 'unmatched',
      ingestionReason: 'subject riconosciuto ma booking_external_code assente',
    });
    return {
      status: 'unmatched',
      bookingId: null,
      reason: 'missing booking_external_code',
    };
  }

  const code = classified.bookingExternalCode;

  // ─── Cross-ref: cerca booking per host + platform=booking + code. ───
  const matched = await findBookingForHost(db, hostId, code);

  if (!matched) {
    await insertBookingEmailEvent(db, {
      hostId,
      bookingId: null,
      eventType: classified.eventType,
      bookingExternalCode: code,
      rawSubject: classified.rawSubject,
      rawEmailId: emailId,
      emailReceivedAt,
      ingestionStatus: 'unmatched',
      ingestionReason: 'iCal not yet polled',
    });
    return {
      status: 'unmatched',
      bookingId: null,
      reason: 'iCal not yet polled',
    };
  }

  const now = new Date();

  // ─── Branch per event type. ───
  if (classified.eventType === 'new_booking') {
    // Booking esiste già (creato da iCal o sync precedente). Aggiorniamo
    // solo i marker email-side.
    await db
      .update(bookings)
      .set({
        rawEmailId: emailId,
        lastEmailSyncedAt: now,
        updatedAt: now,
      })
      .where(eq(bookings.id, matched.bookingId));
    await insertBookingEmailEvent(db, {
      hostId,
      bookingId: matched.bookingId,
      eventType: 'new_booking',
      bookingExternalCode: code,
      rawSubject: classified.rawSubject,
      rawEmailId: emailId,
      emailReceivedAt,
      ingestionStatus: 'matched',
      ingestionReason: null,
    });
    return { status: 'updated', bookingId: matched.bookingId, reason: null };
  }

  if (classified.eventType === 'cancellation') {
    await db
      .update(bookings)
      .set({
        status: 'cancelled',
        rawEmailId: emailId,
        lastEmailSyncedAt: now,
        updatedAt: now,
      })
      .where(eq(bookings.id, matched.bookingId));
    await insertBookingEmailEvent(db, {
      hostId,
      bookingId: matched.bookingId,
      eventType: 'cancellation',
      bookingExternalCode: code,
      rawSubject: classified.rawSubject,
      rawEmailId: emailId,
      emailReceivedAt,
      ingestionStatus: 'matched',
      ingestionReason: 'booking cancelled by Booking.com',
    });
    return { status: 'updated', bookingId: matched.bookingId, reason: null };
  }

  // modification: aggiorna solo i marker (lo stato resta invariato).
  // Il dato vero arriva al prossimo iCal poll che riallinea date/guest.
  await db
    .update(bookings)
    .set({
      rawEmailId: emailId,
      lastEmailSyncedAt: now,
      updatedAt: now,
    })
    .where(eq(bookings.id, matched.bookingId));
  await insertBookingEmailEvent(db, {
    hostId,
    bookingId: matched.bookingId,
    eventType: 'modification',
    bookingExternalCode: code,
    rawSubject: classified.rawSubject,
    rawEmailId: emailId,
    emailReceivedAt,
    ingestionStatus: 'matched',
    ingestionReason: 'marked_for_resync',
  });
  return {
    status: 'updated',
    bookingId: matched.bookingId,
    reason: 'marked_for_resync',
  };
}

// Lookup booking via JOIN bookings ↔ properties con vincoli:
//   properties.host_id = hostId
//   bookings.platform = 'booking'
//   bookings.booking_external_code = code
async function findBookingForHost(
  db: Database,
  hostId: string,
  code: string,
): Promise<{ bookingId: string } | null> {
  const rows = await db
    .select({ id: bookings.id })
    .from(bookings)
    .innerJoin(properties, eq(bookings.propertyId, properties.id))
    .where(
      and(
        eq(properties.hostId, hostId),
        eq(bookings.platform, 'booking'),
        eq(bookings.bookingExternalCode, code),
      ),
    )
    .limit(1);
  if (rows.length === 0) return null;
  return { bookingId: rows[0]!.id };
}
