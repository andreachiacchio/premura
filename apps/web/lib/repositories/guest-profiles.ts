import { createHash } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { guestProfiles, type Database } from '@premura/db';
import type { ParsedAirbnbConfirmation } from '../airbnb-email-parser';

// Repository guest_profiles: directory ospiti host-scoped (M2a.3 Fase 2).
// La tabella legacy 1:1 con bookings è ora 1:N (un guest → N bookings).
//
// upsertGuestProfile cerca per (host_id, full_name). Se esiste, INCREMENTA
// total_stays_count e aggiorna last_seen_at. Se non esiste, INSERT.
//
// email_hash: SHA-256 hex dell'email se mai disponibile (mai plaintext).
// Le email Airbnb raramente espongono l'email reale dell'ospite (l'host
// vede solo nome + recensioni); quando in futuro emergerà, hash-at-rest.

export type UpsertGuestProfileResult = {
  profileId: string;
  created: boolean;
};

export async function upsertGuestProfile(
  db: Database,
  hostId: string,
  parsed: ParsedAirbnbConfirmation,
): Promise<UpsertGuestProfileResult> {
  const fullName = parsed.guest_full_name;
  if (!fullName) {
    throw new Error('upsertGuestProfile: guest_full_name è obbligatorio');
  }

  // 1. Cerca per (host_id, full_name).
  const existing = await db
    .select({ id: guestProfiles.id })
    .from(guestProfiles)
    .where(and(eq(guestProfiles.hostId, hostId), eq(guestProfiles.fullName, fullName)))
    .limit(1);

  const now = new Date();

  if (existing.length > 0) {
    const profileId = existing[0]!.id;
    // UPDATE: ricalcola last_seen_at + total_stays_count++ + aggiorna
    // campi denormalizzati nel caso il parser ne abbia trovati di nuovi.
    await db
      .update(guestProfiles)
      .set({
        firstName: parsed.guest_first_name ?? null,
        countryCode: parsed.guest_country_code ?? null,
        language: parsed.guest_language ?? null,
        lastSeenAt: now,
        // INCREMENTO atomico via SQL.
        totalStaysCount: sql`${guestProfiles.totalStaysCount} + 1`,
        updatedAt: now,
      })
      .where(eq(guestProfiles.id, profileId));
    return { profileId, created: false };
  }

  // 2. INSERT.
  const inserted = await db
    .insert(guestProfiles)
    .values({
      hostId,
      bookingId: null,
      fullName,
      firstName: parsed.guest_first_name ?? null,
      countryCode: parsed.guest_country_code ?? null,
      language: parsed.guest_language ?? null,
      // Email reale non è esposta dalle email Airbnb in chiaro; resta null.
      // hashEmail() conservato come helper per quando l'email arriverà.
      emailHash: null,
      totalStaysCount: 1,
      lastSeenAt: now,
    })
    .returning({ id: guestProfiles.id });

  if (inserted.length === 0) {
    throw new Error('upsertGuestProfile: INSERT ... RETURNING vuoto');
  }
  return { profileId: inserted[0]!.id, created: true };
}

// Helper esposto per quando un'email reale dovesse essere passata
// (es. Booking.com mostra le email; Airbnb no).
export function hashEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  return createHash('sha256').update(normalized).digest('hex');
}
