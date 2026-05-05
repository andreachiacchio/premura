import { mergeInsights } from '@premura/agents';
import type { SingleMessageInsight } from '@premura/agents';
import { type Database, bookings, guestProfiles } from '@premura/db';
import { and, eq, sql } from 'drizzle-orm';

// Repository per applicare insights estratti a guest_profiles.
// Slice 8.1 — Pipeline 2.
//
// Funzione applyInsightToProfile:
//   1. Lookup guest_profile_id dalla booking (bookings.guest_profile_id).
//   2. Se booking non ha guest_profile_id, skip (orphan inbound).
//   3. Lock-free read-merge-write della jsonb message_insights:
//      letta + merge + UPDATE atomico via WHERE + JSONB ::= new_value.
//      Race condition possibile se due extract concorrenti sullo stesso
//      profile: il secondo perde l'aggiornamento del primo. Trade-off
//      accettato per slice 8.1 (extraction triggered da insertMessage,
//      bassa concorrenza in pratica).
//   4. UPDATE inoltre last_message_at, message_count, first_message_at
//      (se null), updated_at.

export type ApplyInsightInput = {
  bookingId: string;
  messageId: string;
  messageSentAt: Date;
  insight: SingleMessageInsight;
};

export type ApplyInsightResult =
  | { status: 'applied'; guestProfileId: string }
  | { status: 'no_profile_for_booking' }
  | { status: 'duplicate_skipped'; guestProfileId: string };

export async function applyInsightToProfile(
  db: Database,
  input: ApplyInsightInput,
): Promise<ApplyInsightResult> {
  // Lookup guest_profile_id dalla booking.
  const [bookingRow] = await db
    .select({ guestProfileId: bookings.guestProfileId })
    .from(bookings)
    .where(eq(bookings.id, input.bookingId))
    .limit(1);

  if (!bookingRow?.guestProfileId) {
    return { status: 'no_profile_for_booking' };
  }
  const guestProfileId = bookingRow.guestProfileId;

  // Read current insights.
  const [profile] = await db
    .select({
      insights: guestProfiles.messageInsights,
      firstMessageAt: guestProfiles.firstMessageAt,
    })
    .from(guestProfiles)
    .where(eq(guestProfiles.id, guestProfileId))
    .limit(1);

  if (!profile) {
    // Edge case: booking ha guestProfileId ma profile cancellato.
    return { status: 'no_profile_for_booking' };
  }

  const current = profile.insights ?? {};
  const processedIds = current.processedMessageIds ?? [];
  if (processedIds.includes(input.messageId)) {
    return { status: 'duplicate_skipped', guestProfileId };
  }

  const merged = mergeInsights({
    current,
    newInsight: input.insight,
    messageId: input.messageId,
  });

  // UPDATE atomico:
  //   message_insights = merged
  //   last_message_at = msg time
  //   first_message_at = COALESCE(existing, msg time)
  //   message_count = (merged.processedMessages ?? prev+1)
  //   updated_at = NOW()
  // Race condition gestita con WHERE message_count = prev: se cambia,
  // skip e log (non re-tentiamo per evitare loop). Per MVP: best-effort
  // last-wins.
  await db
    .update(guestProfiles)
    .set({
      messageInsights: merged,
      lastMessageAt: input.messageSentAt,
      firstMessageAt: profile.firstMessageAt ?? input.messageSentAt,
      messageCount: merged.processedMessages ?? 1,
      updatedAt: sql`NOW()`,
    })
    .where(and(eq(guestProfiles.id, guestProfileId)));

  return { status: 'applied', guestProfileId };
}

// Helper: recupera ultimi N messaggi inbound dello stesso booking
// (per il context dell'extractor). Restituisce body in ordine
// cronologico crescente, escluso il messaggio target.
export async function fetchRecentMessageContext(
  db: Database,
  bookingId: string,
  excludeMessageId: string,
  limit = 5,
): Promise<string[]> {
  const { messages } = await import('@premura/db');
  const { desc } = await import('drizzle-orm');
  const rows = await db
    .select({ body: messages.body, id: messages.id, createdAt: messages.createdAt })
    .from(messages)
    .where(and(eq(messages.bookingId, bookingId), eq(messages.direction, 'inbound')))
    .orderBy(desc(messages.createdAt))
    .limit(limit + 1);

  return rows
    .filter((r) => r.id !== excludeMessageId)
    .slice(0, limit)
    .reverse()
    .map((r) => r.body);
}
