import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type Database,
  bookings,
  cleaners,
  conversations,
  hosts,
  messages,
  properties,
} from '@premura/db';
import * as schema from '@premura/db';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FlatInboundMessage } from '../src/api/webhooks/whatsapp-payload';
import { persistInboundMessage } from '../src/api/webhooks/whatsapp-persist';

// Integration test della persistenza inbound WhatsApp (slice 7a.1 step 2).
// Postgres testcontainer + tutte le migrations applicate. Verifica:
//   - text message con guest_phone match -> message + conversation persisted
//   - text message senza match -> orphan inserted (booking_id null)
//   - duplicate platform_message_id -> skipped
//   - 2 messaggi consecutivi stesso booking -> stessa conversation, 2 messaggi
//   - guest_phone con e senza '+' -> match flessibile
//   - media message (image) -> body placeholder + metadata.media_type
//   - finestra checkin/checkout: troppo prima/dopo -> niente match
//
// Skipped automaticamente se Docker non disponibile.

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const MIGRATIONS_DIR = join(__dirname, '..', '..', '..', 'packages', 'db', 'src', 'migrations');

let container: StartedPostgreSqlContainer | undefined;
let queryClient: ReturnType<typeof postgres> | undefined;
let db: Database;

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

const HOST_ID = '00000000-0000-0000-0000-0000000000a1';
const PROPERTY_ID = '00000000-0000-0000-0000-0000000000b1';
const CLEANER_ID = '00000000-0000-0000-0000-0000000000c1';

async function seedBaseFixtures(): Promise<void> {
  await db.insert(hosts).values({
    id: HOST_ID,
    email: 'andrea@example.com',
    fullName: 'Andrea',
    phone: '+393514512070',
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

async function seedBookingForGuest(opts: {
  guestPhone: string;
  checkinAt: Date;
  checkoutAt: Date;
  bookingRef?: string;
}): Promise<string> {
  const [row] = await db
    .insert(bookings)
    .values({
      propertyId: PROPERTY_ID,
      platform: 'airbnb',
      platformBookingRef: opts.bookingRef ?? `WAREF-${Math.random().toString(36).slice(2)}`,
      guestFullName: 'Mario Rossi',
      guestPhone: opts.guestPhone,
      checkinAt: opts.checkinAt,
      checkoutAt: opts.checkoutAt,
      nights: 2,
      status: 'confirmed',
      dataSource: 'airbnb_email_parsed',
    })
    .returning({ id: bookings.id });
  if (!row) throw new Error('seedBookingForGuest: insert returned empty');
  return row.id;
}

async function resetBetweenCases(): Promise<void> {
  await db.execute(sql`TRUNCATE TABLE messages RESTART IDENTITY CASCADE`);
  await db.execute(sql`TRUNCATE TABLE conversations RESTART IDENTITY CASCADE`);
  await db.execute(sql`TRUNCATE TABLE bookings RESTART IDENTITY CASCADE`);
  await db.execute(sql`TRUNCATE TABLE properties RESTART IDENTITY CASCADE`);
  await db.execute(sql`TRUNCATE TABLE cleaners RESTART IDENTITY CASCADE`);
  await db.execute(sql`TRUNCATE TABLE hosts RESTART IDENTITY CASCADE`);
}

beforeEach(async () => {
  if (!dockerAvailable) return;
  await resetBetweenCases();
});

function flatTextMessage(opts: {
  from?: string;
  id?: string;
  body?: string;
  timestamp?: number;
  contactName?: string;
}): FlatInboundMessage {
  return {
    message: {
      from: opts.from ?? '393331234567',
      id: opts.id ?? 'wamid.HBgM_TEST_1',
      timestamp: String(opts.timestamp ?? Math.floor(Date.now() / 1000)),
      type: 'text',
      text: { body: opts.body ?? 'Ciao' },
    },
    contactName: opts.contactName ?? 'Mario Rossi',
    wabaId: 'WABA_TEST',
    phoneNumberId: 'PHONE_NUMBER_ID_TEST',
  };
}

describe.skipIf(!dockerAvailable)('persistInboundMessage - integration', () => {
  it('text message con guest_phone match (+39 prefix) -> inserted', async () => {
    await seedBaseFixtures();
    const now = new Date();
    const checkin = new Date(now);
    checkin.setHours(checkin.getHours() + 6);
    const checkout = new Date(now);
    checkout.setDate(checkout.getDate() + 2);
    const bookingId = await seedBookingForGuest({
      guestPhone: '+393331234567',
      checkinAt: checkin,
      checkoutAt: checkout,
    });

    const result = await persistInboundMessage(
      db,
      flatTextMessage({ from: '393331234567', id: 'wamid.A' }),
      now,
    );

    expect(result.status).toBe('inserted');
    expect(result.bookingId).toBe(bookingId);
    expect(result.conversationId).not.toBeNull();
    expect(result.messageId).not.toBeNull();

    const persisted = await db
      .select()
      .from(messages)
      .where(eq(messages.platformMessageId, 'wamid.A'));
    expect(persisted).toHaveLength(1);
    const [m] = persisted;
    expect(m?.body).toBe('Ciao');
    expect(m?.channel).toBe('whatsapp');
    expect(m?.direction).toBe('inbound');
    expect(m?.fromEntity).toBe('guest');
    expect(m?.toEntity).toBe('premura');
    expect(m?.bookingId).toBe(bookingId);
  });

  it('text message senza match guest_phone -> orphan inserted', async () => {
    await seedBaseFixtures();

    const result = await persistInboundMessage(
      db,
      flatTextMessage({ from: '393339999999', id: 'wamid.ORPHAN' }),
    );

    expect(result.status).toBe('orphan_inserted');
    expect(result.bookingId).toBeNull();
    expect(result.conversationId).toBeNull();
    expect(result.messageId).not.toBeNull();

    const [persisted] = await db
      .select()
      .from(messages)
      .where(eq(messages.platformMessageId, 'wamid.ORPHAN'));
    expect(persisted?.bookingId).toBeNull();
    expect(persisted?.metadata).toMatchObject({ orphan: true });
  });

  it('duplicate platform_message_id -> duplicate_skipped', async () => {
    await seedBaseFixtures();
    const now = new Date();
    const checkin = new Date(now);
    checkin.setHours(checkin.getHours() + 1);
    const checkout = new Date(now);
    checkout.setDate(checkout.getDate() + 2);
    await seedBookingForGuest({
      guestPhone: '+393331234567',
      checkinAt: checkin,
      checkoutAt: checkout,
    });

    const flat = flatTextMessage({ from: '393331234567', id: 'wamid.DUP' });
    const first = await persistInboundMessage(db, flat, now);
    expect(first.status).toBe('inserted');

    const second = await persistInboundMessage(db, flat, now);
    expect(second.status).toBe('duplicate_skipped');
    expect(second.messageId).toBe(first.messageId);

    const persisted = await db
      .select()
      .from(messages)
      .where(eq(messages.platformMessageId, 'wamid.DUP'));
    expect(persisted).toHaveLength(1);
  });

  it('2 messaggi consecutivi stesso booking -> stessa conversation', async () => {
    await seedBaseFixtures();
    const now = new Date();
    const checkin = new Date(now);
    checkin.setHours(checkin.getHours() + 1);
    const checkout = new Date(now);
    checkout.setDate(checkout.getDate() + 2);
    await seedBookingForGuest({
      guestPhone: '+393331234567',
      checkinAt: checkin,
      checkoutAt: checkout,
    });

    const r1 = await persistInboundMessage(
      db,
      flatTextMessage({ from: '393331234567', id: 'wamid.M1', body: 'uno' }),
      now,
    );
    const r2 = await persistInboundMessage(
      db,
      flatTextMessage({ from: '393331234567', id: 'wamid.M2', body: 'due' }),
      now,
    );

    expect(r1.conversationId).toBe(r2.conversationId);

    const allMsgs = await db.select().from(messages);
    expect(allMsgs).toHaveLength(2);
    const allConvs = await db.select().from(conversations);
    expect(allConvs).toHaveLength(1);
  });

  it('guest_phone in DB senza + -> match comunque', async () => {
    await seedBaseFixtures();
    const now = new Date();
    const checkin = new Date(now);
    checkin.setHours(checkin.getHours() + 1);
    const checkout = new Date(now);
    checkout.setDate(checkout.getDate() + 2);
    const bookingId = await seedBookingForGuest({
      guestPhone: '393331234567', // SENZA +
      checkinAt: checkin,
      checkoutAt: checkout,
    });

    const result = await persistInboundMessage(
      db,
      flatTextMessage({ from: '393331234567', id: 'wamid.NOPLUS' }),
      now,
    );

    expect(result.status).toBe('inserted');
    expect(result.bookingId).toBe(bookingId);
  });

  it('media message (image) -> placeholder etichettato + metadata.media_type', async () => {
    await seedBaseFixtures();
    const now = new Date();
    const checkin = new Date(now);
    checkin.setHours(checkin.getHours() + 1);
    const checkout = new Date(now);
    checkout.setDate(checkout.getDate() + 2);
    await seedBookingForGuest({
      guestPhone: '+393331234567',
      checkinAt: checkin,
      checkoutAt: checkout,
    });

    const result = await persistInboundMessage(
      db,
      {
        message: {
          from: '393331234567',
          id: 'wamid.IMG',
          timestamp: String(Math.floor(now.getTime() / 1000)),
          type: 'image',
        },
        contactName: 'Mario',
        wabaId: 'WABA',
        phoneNumberId: 'PHONE',
      },
      now,
    );

    expect(result.status).toBe('inserted');
    const [persisted] = await db
      .select()
      .from(messages)
      .where(eq(messages.platformMessageId, 'wamid.IMG'));
    expect(persisted?.body).toContain('image');
    expect(persisted?.metadata).toMatchObject({ media_type: 'image' });
  });

  it('booking checkout 5 giorni fa -> niente match (finestra fuori range)', async () => {
    await seedBaseFixtures();
    const now = new Date();
    const checkin = new Date(now);
    checkin.setDate(checkin.getDate() - 7);
    const checkout = new Date(now);
    checkout.setDate(checkout.getDate() - 5);
    await seedBookingForGuest({
      guestPhone: '+393331234567',
      checkinAt: checkin,
      checkoutAt: checkout,
    });

    const result = await persistInboundMessage(
      db,
      flatTextMessage({ from: '393331234567', id: 'wamid.LATE' }),
      now,
    );

    expect(result.status).toBe('orphan_inserted');
    expect(result.bookingId).toBeNull();
  });

  it('booking checkin 10 giorni in futuro -> niente match (troppo presto)', async () => {
    await seedBaseFixtures();
    const now = new Date();
    const checkin = new Date(now);
    checkin.setDate(checkin.getDate() + 10);
    const checkout = new Date(now);
    checkout.setDate(checkout.getDate() + 12);
    await seedBookingForGuest({
      guestPhone: '+393331234567',
      checkinAt: checkin,
      checkoutAt: checkout,
    });

    const result = await persistInboundMessage(
      db,
      flatTextMessage({ from: '393331234567', id: 'wamid.EARLY' }),
      now,
    );

    expect(result.status).toBe('orphan_inserted');
    expect(result.bookingId).toBeNull();
  });
});
