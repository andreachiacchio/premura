// Slice A — Seed deterministico booking "prossimi check-in" per dev.
//
// Crea 5 booking nei prossimi 14 giorni per DEV_HOST_ID Andrea su
// property La Goccia. 2 con guest_phone valorizzato (gia' attivi
// Premura), 3 senza (da configurare via dashboard).
//
// Idempotente: usa UUID deterministici per i 5 booking, fa DELETE
// preventivo prima di INSERT.
//
// Uso:
//   pnpm --filter @premura/db seed:upcoming-checkins
//
// Env richiesto: DATABASE_URL.

import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { bookings } from '../schema';

loadEnv({ path: resolve('.env.local') });

const HOST_ID = '2ad367f1-3433-4b42-b143-5ece3cd8bb5b';
const PROPERTY_ID = '404f35b3-2796-44a3-bffc-90c5eba36447';

// UUID deterministici (v5-style ma hardcoded) per idempotenza.
const SEED_BOOKING_IDS = [
  '00000000-7c7c-4001-a000-000000000001',
  '00000000-7c7c-4001-a000-000000000002',
  '00000000-7c7c-4001-a000-000000000003',
  '00000000-7c7c-4001-a000-000000000004',
  '00000000-7c7c-4001-a000-000000000005',
] as const;

type SeedBooking = {
  id: string;
  guestFullName: string;
  guestFirstName: string;
  guestPhone: string | null;
  daysOut: number;
  nights: number;
  numGuests: number;
  platform: 'booking' | 'airbnb' | 'direct';
};

const SEEDS: SeedBooking[] = [
  {
    id: SEED_BOOKING_IDS[0],
    guestFullName: 'Mario Rossi',
    guestFirstName: 'Mario',
    guestPhone: '+393331234567',
    daysOut: 2,
    nights: 3,
    numGuests: 2,
    platform: 'booking',
  },
  {
    id: SEED_BOOKING_IDS[1],
    guestFullName: 'Sara Bianchi',
    guestFirstName: 'Sara',
    guestPhone: null,
    daysOut: 4,
    nights: 4,
    numGuests: 4,
    platform: 'airbnb',
  },
  {
    id: SEED_BOOKING_IDS[2],
    guestFullName: 'Giulia Verdi',
    guestFirstName: 'Giulia',
    guestPhone: '+393387654321',
    daysOut: 7,
    nights: 2,
    numGuests: 3,
    platform: 'airbnb',
  },
  {
    id: SEED_BOOKING_IDS[3],
    guestFullName: 'Luca Romano',
    guestFirstName: 'Luca',
    guestPhone: null,
    daysOut: 9,
    nights: 5,
    numGuests: 2,
    platform: 'booking',
  },
  {
    id: SEED_BOOKING_IDS[4],
    guestFullName: 'Anna Conti',
    guestFirstName: 'Anna',
    guestPhone: null,
    daysOut: 13,
    nights: 3,
    numGuests: 1,
    platform: 'direct',
  },
];

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('[seed-upcoming-checkins] ERRORE: DATABASE_URL non settato.');
    process.exit(1);
  }

  const sql = postgres(url, { max: 1, prepare: false });
  const db = drizzle(sql);

  console.log(`[seed-upcoming-checkins] DELETE booking esistenti (${SEED_BOOKING_IDS.length})...`);
  await db.delete(bookings).where(inArray(bookings.id, [...SEED_BOOKING_IDS]));

  console.log(`[seed-upcoming-checkins] INSERT ${SEEDS.length} booking nuovi...`);
  const now = new Date();
  for (const s of SEEDS) {
    const checkinAt = new Date(now);
    checkinAt.setDate(checkinAt.getDate() + s.daysOut);
    checkinAt.setHours(15, 0, 0, 0); // standard check-in 15:00 locale

    const checkoutAt = new Date(checkinAt);
    checkoutAt.setDate(checkoutAt.getDate() + s.nights);
    checkoutAt.setHours(11, 0, 0, 0); // standard check-out 11:00

    await db.insert(bookings).values({
      id: s.id,
      propertyId: PROPERTY_ID,
      platform: s.platform,
      platformBookingRef: `seed-${s.id.slice(-4)}`,
      guestFullName: s.guestFullName,
      guestFirstName: s.guestFirstName,
      guestPhone: s.guestPhone,
      numGuests: s.numGuests,
      numAdults: s.numGuests,
      numChildren: 0,
      checkinAt,
      checkoutAt,
      nights: s.nights,
      status: 'confirmed',
      dataSource: s.guestPhone ? 'booking_manual_filled' : 'booking_ical_only',
      premuraActiveAt: s.guestPhone ? now : null,
      guestPhoneSource: s.guestPhone ? 'platform' : null,
    });
    console.log(
      `[seed-upcoming-checkins]   - ${s.guestFullName} | ${s.platform} | check-in T+${s.daysOut}gg | phone=${s.guestPhone ?? 'null'}`,
    );
  }

  console.log('[seed-upcoming-checkins] OK.');
  await sql.end({ timeout: 5 });
}

main().catch((err) => {
  console.error('[seed-upcoming-checkins] ERRORE:', err);
  process.exit(1);
});
