import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { sql, eq } from 'drizzle-orm';
import * as schema from '@premura/db';
import {
  bookings,
  bookingEmailEvents,
  hosts,
  properties,
  cleaners,
} from '@premura/db';
import type { Database, ServerClient } from '@premura/db';
import { ingestBookingEvent } from '../lib/booking-event-ingestor';
import type { ClassifiedBookingEmail } from '../lib/booking-email-classifier';

// Integration test del booking-event-ingestor (M2a.3 Fase 3).
// Postgres testcontainer + tutte le migrations applicate. Verifica che
// per ogni event_type:
//   - new_booking + booking esiste → updated, audit row con bookingId
//   - new_booking + booking NON esiste → unmatched, audit con bookingId=null
//   - cancellation + booking esiste → status='cancelled' aggiornato
//   - modification + booking esiste → lastEmailSyncedAt aggiornato (no status)
//   - noise → skipped immediato senza DB lookup
//   - email duplicata (stesso rawEmailId) → idempotenza, no double process
//
// Skipped automaticamente se Docker non disponibile.

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const MIGRATIONS_DIR = join(__dirname, '..', '..', '..', 'packages', 'db', 'src', 'migrations');

let container: StartedPostgreSqlContainer | undefined;
let queryClient: ReturnType<typeof postgres> | undefined;
let db: Database;
let serverClient: Pick<ServerClient, 'db'>;

const dockerAvailable = await checkDocker();

async function checkDocker(): Promise<boolean> {
  try {
    const { spawn } = await import('node:child_process');
    return await new Promise((resolve) => {
      const proc = spawn('docker', ['version', '--format', 'json'], { stdio: 'pipe' });
      proc.on('exit', (code) => resolve(code === 0));
      proc.on('error', () => resolve(false));
    });
  } catch {
    return false;
  }
}

beforeAll(async () => {
  if (!dockerAvailable) return;
  container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('premura_test')
    .withUsername('test')
    .withPassword('test')
    .start();

  queryClient = postgres(container.getConnectionUri(), { max: 5 });
  db = drizzle(queryClient, { schema });
  serverClient = { db };

  // Applica TUTTE le migrations in ordine.
  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const ddl = await readFile(join(MIGRATIONS_DIR, file), 'utf8');
    const statements = ddl
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter(Boolean);
    for (const stmt of statements) {
      // eslint-disable-next-line no-await-in-loop
      await db.execute(sql.raw(stmt));
    }
  }
}, 120_000);

afterAll(async () => {
  await queryClient?.end({ timeout: 5 });
  await container?.stop();
}, 60_000);

// ─────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────

const HOST_ID = '00000000-0000-0000-0000-0000000000a1';
const CLEANER_ID = '00000000-0000-0000-0000-0000000000c1';
const PROPERTY_ID = '00000000-0000-0000-0000-0000000000b1';
const BOOKING_CODE = '1234567890';

async function seedBaseFixtures(): Promise<void> {
  await db.insert(hosts).values({
    id: HOST_ID,
    email: 'host-fase3@example.com',
    fullName: 'Host Fase3',
    phone: '+390000000000',
  });
  await db.insert(cleaners).values({
    id: CLEANER_ID,
    hostId: HOST_ID,
    fullName: 'Karen Test',
    whatsappNumber: '+390000000001',
    deliveryAddress: 'Via Test 1',
  });
  await db.insert(properties).values({
    id: PROPERTY_ID,
    hostId: HOST_ID,
    name: 'La Goccia',
    addressLine: 'Napoli',
    city: 'Napoli',
    cleanerId: CLEANER_ID,
  });
}

async function seedBookingViaIcal(): Promise<string> {
  const [row] = await db
    .insert(bookings)
    .values({
      propertyId: PROPERTY_ID,
      platform: 'booking',
      // Tipico iCal: UID lungo come platformBookingRef.
      platformBookingRef: `BOOKING-ICAL-UID-${BOOKING_CODE}`,
      bookingExternalCode: BOOKING_CODE,
      guestFullName: 'Reserved', // mascherato da iCal
      checkinAt: new Date('2026-06-01T14:00:00Z'),
      checkoutAt: new Date('2026-06-03T11:00:00Z'),
      nights: 2,
      status: 'confirmed',
    })
    .returning({ id: bookings.id });
  if (!row) throw new Error('seedBookingViaIcal: insert returned empty');
  return row.id;
}

async function resetBetweenCases(): Promise<void> {
  // Pulizia totale (cascade: hosts → properties → bookings + booking_email_events).
  await db.execute(sql`TRUNCATE TABLE booking_email_events RESTART IDENTITY CASCADE`);
  await db.execute(sql`TRUNCATE TABLE bookings RESTART IDENTITY CASCADE`);
  await db.execute(sql`TRUNCATE TABLE properties RESTART IDENTITY CASCADE`);
  await db.execute(sql`TRUNCATE TABLE cleaners RESTART IDENTITY CASCADE`);
  await db.execute(sql`TRUNCATE TABLE hosts RESTART IDENTITY CASCADE`);
}

function classifiedFor(
  eventType: ClassifiedBookingEmail['eventType'],
  code: string | null = BOOKING_CODE,
): ClassifiedBookingEmail {
  if (eventType === 'noise') {
    return {
      eventType: 'noise',
      bookingExternalCode: null,
      rawSubject: 'Diventa Genius Partner: scopri i vantaggi',
    };
  }
  const subjects: Record<Exclude<ClassifiedBookingEmail['eventType'], 'noise'>, string> = {
    new_booking: `Booking.com - Hai una nuova prenotazione! (${code ?? 'X'}, La Goccia)`,
    cancellation: `Booking.com - Prenotazione cancellata! (${code ?? 'X'}, La Goccia)`,
    modification: `Booking.com - Prenotazione modificata! (${code ?? 'X'}, La Goccia)`,
  };
  return {
    eventType,
    bookingExternalCode: code,
    rawSubject: subjects[eventType],
  };
}

// ─────────────────────────────────────────────────────────────
// Test
// ─────────────────────────────────────────────────────────────

describe.skipIf(!dockerAvailable)('ingestBookingEvent — integration', () => {
  it('new_booking + booking esiste → updated + audit con bookingId', async () => {
    await resetBetweenCases();
    await seedBaseFixtures();
    const bookingId = await seedBookingViaIcal();

    const result = await ingestBookingEvent(serverClient, {
      classified: classifiedFor('new_booking'),
      hostId: HOST_ID,
      emailId: 'gmail-1',
      emailReceivedAt: new Date('2026-04-26T10:00:00Z'),
    });

    expect(result.status).toBe('updated');
    expect(result.bookingId).toBe(bookingId);

    const audits = await db.select().from(bookingEmailEvents);
    expect(audits).toHaveLength(1);
    expect(audits[0]?.eventType).toBe('new_booking');
    expect(audits[0]?.ingestionStatus).toBe('matched');
    expect(audits[0]?.bookingId).toBe(bookingId);
    expect(audits[0]?.bookingExternalCode).toBe(BOOKING_CODE);
    expect(audits[0]?.rawEmailId).toBe('gmail-1');

    // Verifica che il booking sia stato aggiornato con rawEmailId.
    const [refreshed] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
    expect(refreshed?.rawEmailId).toBe('gmail-1');
    expect(refreshed?.lastEmailSyncedAt).not.toBeNull();
  });

  it('new_booking + booking NON esiste → unmatched + audit con bookingId=null', async () => {
    await resetBetweenCases();
    await seedBaseFixtures();
    // NIENTE iCal seed.

    const result = await ingestBookingEvent(serverClient, {
      classified: classifiedFor('new_booking', '9999999'),
      hostId: HOST_ID,
      emailId: 'gmail-2',
      emailReceivedAt: new Date('2026-04-26T11:00:00Z'),
    });

    expect(result.status).toBe('unmatched');
    expect(result.bookingId).toBeNull();
    expect(result.reason).toBe('iCal not yet polled');

    const audits = await db.select().from(bookingEmailEvents);
    expect(audits).toHaveLength(1);
    expect(audits[0]?.bookingId).toBeNull();
    expect(audits[0]?.ingestionStatus).toBe('unmatched');
    expect(audits[0]?.bookingExternalCode).toBe('9999999');
  });

  it('cancellation + booking esiste → status=cancelled', async () => {
    await resetBetweenCases();
    await seedBaseFixtures();
    const bookingId = await seedBookingViaIcal();

    const result = await ingestBookingEvent(serverClient, {
      classified: classifiedFor('cancellation'),
      hostId: HOST_ID,
      emailId: 'gmail-3',
      emailReceivedAt: new Date('2026-04-26T12:00:00Z'),
    });

    expect(result.status).toBe('updated');
    expect(result.bookingId).toBe(bookingId);

    const [refreshed] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
    expect(refreshed?.status).toBe('cancelled');
    expect(refreshed?.rawEmailId).toBe('gmail-3');

    const audits = await db.select().from(bookingEmailEvents);
    expect(audits).toHaveLength(1);
    expect(audits[0]?.eventType).toBe('cancellation');
    expect(audits[0]?.ingestionStatus).toBe('matched');
  });

  it('modification + booking esiste → lastEmailSyncedAt aggiornato, status invariato', async () => {
    await resetBetweenCases();
    await seedBaseFixtures();
    const bookingId = await seedBookingViaIcal();

    const beforeRows = await db.select().from(bookings).where(eq(bookings.id, bookingId));
    const beforeStatus = beforeRows[0]?.status;
    expect(beforeStatus).toBe('confirmed');

    const result = await ingestBookingEvent(serverClient, {
      classified: classifiedFor('modification'),
      hostId: HOST_ID,
      emailId: 'gmail-4',
      emailReceivedAt: new Date('2026-04-26T13:00:00Z'),
    });

    expect(result.status).toBe('updated');
    expect(result.reason).toBe('marked_for_resync');

    const [refreshed] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
    expect(refreshed?.status).toBe('confirmed'); // invariato
    expect(refreshed?.rawEmailId).toBe('gmail-4');
    expect(refreshed?.lastEmailSyncedAt).not.toBeNull();

    const audits = await db.select().from(bookingEmailEvents);
    expect(audits).toHaveLength(1);
    expect(audits[0]?.ingestionReason).toBe('marked_for_resync');
  });

  it('noise → skipped immediato + audit row', async () => {
    await resetBetweenCases();
    await seedBaseFixtures();

    const result = await ingestBookingEvent(serverClient, {
      classified: classifiedFor('noise'),
      hostId: HOST_ID,
      emailId: 'gmail-5',
      emailReceivedAt: new Date('2026-04-26T14:00:00Z'),
    });

    expect(result.status).toBe('skipped');
    expect(result.bookingId).toBeNull();

    const audits = await db.select().from(bookingEmailEvents);
    expect(audits).toHaveLength(1);
    expect(audits[0]?.eventType).toBe('noise');
    expect(audits[0]?.ingestionStatus).toBe('skipped');
    expect(audits[0]?.bookingId).toBeNull();
  });

  it('email duplicata (stesso rawEmailId) → idempotenza, audit unico', async () => {
    await resetBetweenCases();
    await seedBaseFixtures();
    const bookingId = await seedBookingViaIcal();

    // Prima ingestion.
    await ingestBookingEvent(serverClient, {
      classified: classifiedFor('new_booking'),
      hostId: HOST_ID,
      emailId: 'gmail-dup',
      emailReceivedAt: new Date('2026-04-26T15:00:00Z'),
    });
    // Seconda chiamata con stesso rawEmailId — onConflictDoNothing previene
    // il dup. Il booking viene comunque toccato (idempotente sui marker)
    // ma l'audit row resta singola.
    await ingestBookingEvent(serverClient, {
      classified: classifiedFor('new_booking'),
      hostId: HOST_ID,
      emailId: 'gmail-dup',
      emailReceivedAt: new Date('2026-04-26T15:00:00Z'),
    });

    const audits = await db.select().from(bookingEmailEvents);
    expect(audits).toHaveLength(1);
    expect(audits[0]?.bookingId).toBe(bookingId);
  });
});

// Suite "vacua" se Docker non disponibile.
describe.skipIf(dockerAvailable)('ingestBookingEvent — integration (Docker mancante)', () => {
  it('skipped perché Docker daemon non raggiungibile', () => {
    expect(true).toBe(true);
  });
});
