import { eq } from 'drizzle-orm';
import { bookingEmailEvents, type Database } from '@premura/db';

// Repository booking_email_events: audit trail delle email Booking.com
// processate (M2a.3 Fase 3). Idempotenza job-level via uniqueIndex su
// raw_email_id + onConflictDoNothing.

export type BookingEmailEventStatus =
  | 'matched'
  | 'unmatched'
  | 'skipped'
  | 'error';

export type BookingEmailEventInsert = {
  hostId: string;
  bookingId: string | null;
  eventType: 'new_booking' | 'cancellation' | 'modification' | 'noise';
  bookingExternalCode: string | null;
  rawSubject: string;
  rawEmailId: string;
  emailReceivedAt: Date;
  ingestionStatus: BookingEmailEventStatus;
  ingestionReason: string | null;
};

// Insert idempotente: se rawEmailId esiste già, no-op (onConflictDoNothing).
// Ritorna true se la riga è stata effettivamente creata, false se skipped
// dal conflict.
export async function insertBookingEmailEvent(
  db: Database,
  input: BookingEmailEventInsert,
): Promise<{ inserted: boolean }> {
  const result = await db
    .insert(bookingEmailEvents)
    .values({
      hostId: input.hostId,
      bookingId: input.bookingId ?? null,
      eventType: input.eventType,
      bookingExternalCode: input.bookingExternalCode ?? null,
      rawSubject: input.rawSubject,
      rawEmailId: input.rawEmailId,
      emailReceivedAt: input.emailReceivedAt,
      ingestionStatus: input.ingestionStatus,
      ingestionReason: input.ingestionReason ?? null,
    })
    .onConflictDoNothing({ target: bookingEmailEvents.rawEmailId })
    .returning({ id: bookingEmailEvents.id });
  return { inserted: result.length > 0 };
}

// Verifica se una specifica email è già stata processata in passato (per
// idempotenza in early-skip lato orchestrator).
export async function existsBookingEmailEvent(
  db: Database,
  rawEmailId: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: bookingEmailEvents.id })
    .from(bookingEmailEvents)
    .where(eq(bookingEmailEvents.rawEmailId, rawEmailId))
    .limit(1);
  return rows.length > 0;
}
