import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';
import * as schema from '@premura/db';
import {
  bookings,
  guestProfiles,
  gmailSyncJobs,
  hosts,
  properties,
  cleaners,
} from '@premura/db';
import type { Database, ServerClient } from '@premura/db';
import type { GmailClient, EmailContent } from '../lib/gmail-client';
import type { ParsedAirbnbEmail } from '../lib/airbnb-email-parser';
import { syncGmailForHost } from '../lib/gmail-sync-orchestrator';
import { encryptToken } from '../lib/google-oauth';

// ─────────────────────────────────────────────────────────────
// Integration test orchestrator end-to-end:
//   - Postgres testcontainer
//   - Migrations applicate
//   - 1 host + 2 cleaner + 1 property seeded (La Goccia)
//   - Mock GmailClient con 3 email:
//     * email 1: confirmation Stephen, check-in futuro → enriched/created
//     * email 2: confirmation Maria, check-in futuro, ospite ricorrente
//     * email 3: confirmation John, check-in PASSATO → skipped_past
//   - Mock parser per ognuna (zero chiamate Claude reali)
//   - Verifica gmail_sync_jobs + bookings + guest_profiles populated
//
// Se Docker non disponibile, suite skipped con messaggio chiaro.
// ─────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const MIGRATIONS_DIR = join(__dirname, '..', '..', '..', 'packages', 'db', 'src', 'migrations');

let container: StartedPostgreSqlContainer | undefined;
let queryClient: ReturnType<typeof postgres> | undefined;
let db: Database;
let serverClient: ServerClient;

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
  serverClient = {
    db,
    admin: null,
    close: async () => queryClient?.end({ timeout: 5 }),
  };

  // Applica TUTTE le migrations in ordine.
  const files = (await readdir(MIGRATIONS_DIR))
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const file of files) {
    const ddl = await readFile(join(MIGRATIONS_DIR, file), 'utf8');
    // Drizzle separa con `--> statement-breakpoint` per applicare uno per uno.
    const statements = ddl.split('--> statement-breakpoint').map((s) => s.trim()).filter(Boolean);
    for (const stmt of statements) {
      // sql.raw è obbligatorio: gli statement contengono identificatori
      // non quotabili come template literals.
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

const ANDREA_HOST_ID = '00000000-0000-0000-0000-00000000a001';
const KAREN_CLEANER_ID = '00000000-0000-0000-0000-00000000c001';
const LA_GOCCIA_PROPERTY_ID = '00000000-0000-0000-0000-00000000b001';
const ANDREA_GMAIL = 'andrea-test@example.com';

async function seedDb(): Promise<void> {
  // Hosts.
  await db.insert(hosts).values({
    id: ANDREA_HOST_ID,
    email: 'andrea-test@example.com',
    fullName: 'Andrea Test',
    phone: '+390000000000',
  });

  // Cleaner (richiesto da properties.cleanerId, anche se nullable).
  await db.insert(cleaners).values({
    id: KAREN_CLEANER_ID,
    hostId: ANDREA_HOST_ID,
    fullName: 'Karen Test',
    whatsappNumber: '+390000000001',
    deliveryAddress: 'Via Test 1, Napoli',
  });

  // Property "La Goccia".
  await db.insert(properties).values({
    id: LA_GOCCIA_PROPERTY_ID,
    hostId: ANDREA_HOST_ID,
    name: 'La Goccia',
    addressLine: 'Napoli Centro Storico',
    city: 'Napoli',
    cleanerId: KAREN_CLEANER_ID,
  });

  // Encrypted Google token (hostId + email match).
  // L'orchestrator chiama getTokenByHostAndEmail per fail-fast prima di
  // chiamare il gmailClientFactory mock; deve esistere una riga.
  // TOKEN_ENCRYPTION_KEY deve essere settata nell'env del test.
  process.env.TOKEN_ENCRYPTION_KEY =
    process.env.TOKEN_ENCRYPTION_KEY ??
    Buffer.alloc(32, 1).toString('base64'); // 32 byte deterministici
  process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? 'fake-client-id';
  process.env.GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? 'fake-secret';

  await db.execute(sql`
    INSERT INTO google_tokens (host_id, google_email, access_token_encrypted, refresh_token_encrypted, expires_at, scope)
    VALUES (
      ${ANDREA_HOST_ID}::uuid,
      ${ANDREA_GMAIL},
      ${encryptToken('fake-access-token')},
      ${encryptToken('fake-refresh-token')},
      NOW() + INTERVAL '1 hour',
      'openid email https://www.googleapis.com/auth/gmail.readonly'
    )
  `);
}

// 3 email finte: 2 future, 1 passata.
function buildMockEmails(now: Date): {
  emails: Map<string, EmailContent>;
  parsed: Map<string, ParsedAirbnbEmail>;
} {
  const future1 = new Date(now);
  future1.setUTCDate(future1.getUTCDate() + 30);
  const future2 = new Date(now);
  future2.setUTCDate(future2.getUTCDate() + 60);
  const past1 = new Date(now);
  past1.setUTCDate(past1.getUTCDate() - 30);

  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  const emails = new Map<string, EmailContent>();
  const parsed = new Map<string, ParsedAirbnbEmail>();

  emails.set('m1', {
    messageId: 'm1',
    subject: 'Stephen Smith confermato',
    from: 'automated@airbnb.com',
    date: now,
    htmlBody: '',
    textBody: 'Stephen Smith stay at La Goccia',
    snippet: '',
  });
  parsed.set('m1', {
    email_type: 'confirmation',
    guest_full_name: 'Stephen Smith',
    guest_first_name: 'Stephen',
    guest_country_code: 'GB',
    guest_language: 'en',
    guest_count: 2,
    guest_message_original: 'Hi Andrea',
    guest_message_lang: 'en',
    host_payout_amount: 110.62,
    host_payout_currency: 'EUR',
    check_in_date: fmt(future1),
    check_out_date: fmt(new Date(future1.getTime() + 24 * 3600 * 1000)),
    nights: 1,
    booking_external_code: 'HM4XDFHECP',
    property_name: '[Centro Storico] La Goccia',
    airbnb_listing_url: null,
  });

  emails.set('m2', {
    messageId: 'm2',
    subject: 'Maria Rossi confermata',
    from: 'automated@airbnb.com',
    date: now,
    htmlBody: '',
    textBody: 'Maria Rossi La Goccia',
    snippet: '',
  });
  parsed.set('m2', {
    email_type: 'confirmation',
    guest_full_name: 'Maria Rossi',
    guest_first_name: 'Maria',
    guest_country_code: 'IT',
    guest_language: 'it',
    guest_count: 3,
    guest_message_original: 'Ciao!',
    guest_message_lang: 'it',
    host_payout_amount: 200,
    host_payout_currency: 'EUR',
    check_in_date: fmt(future2),
    check_out_date: fmt(new Date(future2.getTime() + 2 * 24 * 3600 * 1000)),
    nights: 2,
    booking_external_code: 'HMMARIA0001',
    property_name: 'La Goccia di S.Gennaro',
    airbnb_listing_url: null,
  });

  emails.set('m3', {
    messageId: 'm3',
    subject: 'John Doe (passato)',
    from: 'automated@airbnb.com',
    date: now,
    htmlBody: '',
    textBody: 'John Doe past stay',
    snippet: '',
  });
  parsed.set('m3', {
    email_type: 'confirmation',
    guest_full_name: 'John Doe',
    guest_first_name: 'John',
    guest_country_code: 'US',
    guest_language: 'en',
    guest_count: 1,
    guest_message_original: null,
    guest_message_lang: null,
    host_payout_amount: 60,
    host_payout_currency: 'EUR',
    check_in_date: fmt(past1),
    check_out_date: fmt(new Date(past1.getTime() + 24 * 3600 * 1000)),
    nights: 1,
    booking_external_code: 'HMJOHNPAST',
    property_name: 'La Goccia',
    airbnb_listing_url: null,
  });

  return { emails, parsed };
}

function buildMockGmailClient(emails: Map<string, EmailContent>): GmailClient {
  const ids = Array.from(emails.keys());
  return {
    hostId: ANDREA_HOST_ID,
    googleEmail: ANDREA_GMAIL,
    api: {
      users: {
        messages: {
          list: async () => ({ data: { messages: ids.map((id) => ({ id })) } }),
          get: async (args: { id: string }) => {
            const e = emails.get(args.id);
            if (!e) return { data: {} };
            return {
              data: {
                snippet: e.snippet,
                payload: {
                  headers: [
                    { name: 'Subject', value: e.subject },
                    { name: 'From', value: e.from },
                    { name: 'Date', value: e.date?.toUTCString() ?? '' },
                  ],
                  mimeType: 'text/plain',
                  body: { data: Buffer.from(e.textBody).toString('base64') },
                },
              },
            };
          },
        },
      },
    } as unknown as GmailClient['api'],
  };
}

// ─────────────────────────────────────────────────────────────
// Test
// ─────────────────────────────────────────────────────────────

describe.skipIf(!dockerAvailable)('syncGmailForHost — integration', () => {
  it('processa 3 email Airbnb (2 future, 1 passata) end-to-end', async () => {
    await seedDb();
    const now = new Date('2026-04-26T12:00:00Z');
    const { emails, parsed } = buildMockEmails(now);

    const result = await syncGmailForHost(serverClient, ANDREA_HOST_ID, ANDREA_GMAIL, {
      now,
      gmailClientFactory: async () => buildMockGmailClient(emails),
      emailParser: async (input) => {
        // Identifica il messaggio dal subject (i mock li hanno univoci).
        for (const [id, e] of emails) {
          if (e.subject === input.subject) {
            const p = parsed.get(id);
            if (!p) throw new Error(`No parsed for ${id}`);
            return p;
          }
        }
        throw new Error('Email non riconosciuta nel mock parser');
      },
    });

    // Stats finali attese.
    expect(result.status).toBe('completed');
    expect(result.totalEmails).toBe(3);
    expect(result.processedEmails).toBe(3);
    expect(result.skippedPast).toBe(1); // John (passato)
    expect(result.createdCount).toBe(2); // Stephen + Maria nuovi
    expect(result.guestProfilesCreated).toBe(2);
    expect(result.skippedNoMatch).toBe(0);

    // Verifica bookings nel DB.
    const allBookings = await db.select().from(bookings);
    expect(allBookings).toHaveLength(2);
    const stephen = allBookings.find((b) => b.bookingExternalCode === 'HM4XDFHECP');
    expect(stephen).toBeDefined();
    expect(stephen?.guestFullName).toBe('Stephen Smith');
    expect(stephen?.guestMessageOriginal).toBe('Hi Andrea');
    expect(stephen?.guestMessageLang).toBe('en');
    expect(stephen?.hostPayoutAmount).toBe('110.62');
    expect(stephen?.hostPayoutCurrency).toBe('EUR');
    expect(stephen?.numGuests).toBe(2);
    expect(stephen?.propertyId).toBe(LA_GOCCIA_PROPERTY_ID);
    expect(stephen?.guestProfileId).not.toBeNull();
    expect(stephen?.rawEmailId).toBe('m1');

    // Guest profiles.
    const allProfiles = await db.select().from(guestProfiles);
    expect(allProfiles).toHaveLength(2);
    const stephenProfile = allProfiles.find((p) => p.fullName === 'Stephen Smith');
    expect(stephenProfile).toBeDefined();
    expect(stephenProfile?.hostId).toBe(ANDREA_HOST_ID);
    expect(stephenProfile?.totalStaysCount).toBe(1);
    expect(stephenProfile?.lastSeenAt).not.toBeNull();

    // Sync job stato finale.
    const jobs = await db.select().from(gmailSyncJobs);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.status).toBe('completed');
    expect(jobs[0]?.totalEmails).toBe(3);
    expect(jobs[0]?.processedEmails).toBe(3);
    expect(jobs[0]?.createdCount).toBe(2);
    expect(jobs[0]?.skippedPast).toBe(1);
  }, 60_000);
});

// Suite "vacua" se Docker non disponibile, così la run non fallisce hard.
describe.skipIf(dockerAvailable)('syncGmailForHost — integration (Docker mancante)', () => {
  it('skipped perché Docker daemon non raggiungibile', () => {
    expect(true).toBe(true);
  });
});
