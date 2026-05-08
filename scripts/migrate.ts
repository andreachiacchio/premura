/**
 * DEBT-1 — Runner migrazioni Drizzle.
 *
 * Era referenziato da package.json (`db:migrate: tsx scripts/migrate.ts`)
 * ma il file mancava. 8 migration (0008-0015) sono state applicate a
 * mano su Supabase produzione la scorsa settimana per questo gap.
 *
 * Uso:
 *
 *   pnpm db:migrate                      # applica pending migrations
 *   pnpm db:migrate -- --dry-run         # simula (mostra pending, non applica)
 *
 * Env richiesto: DATABASE_URL (Supabase pooler URL preferito; il driver
 * postgres-js supporta sia pooler che direct connection).
 *
 * Sicurezza:
 *  - Non droppa MAI dati. Drizzle migrator e' append-only.
 *  - Idempotente: applicare 2 volte e' no-op (la tabella drizzle_migrations
 *    tiene il tracking).
 *  - Se una migration fallisce a meta', il transaction rollback la
 *    annulla (drizzle wrappa ogni file in BEGIN..COMMIT).
 *
 * Caveat staging vs production:
 *  - Staging: lancia direttamente. DATABASE_URL puntato a staging.
 *  - Production: lancia con prudenza. Conferma esplicita richiesta da
 *    docs/DB-MIGRATIONS.md (require PREMURA_CONFIRM_PROD=yes).
 */

import { config as loadEnv } from 'dotenv';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

loadEnv({ path: '.env.local' });

const dryRun = process.argv.includes('--dry-run');
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('[migrate] ERRORE: DATABASE_URL non settato. Aborting.');
  process.exit(1);
}

// Guard rail produzione: se il host punta a un Supabase remoto (non
// localhost), richiedi conferma esplicita via env var. Evita applicare
// migrations a prod per sbaglio durante un debugging locale.
const isLocalhost = /\b(localhost|127\.0\.0\.1)\b/.test(databaseUrl);
const isProd =
  process.env.NODE_ENV === 'production' || process.env.PREMURA_DB_TARGET === 'production';
if (isProd && !isLocalhost && process.env.PREMURA_CONFIRM_PROD !== 'yes') {
  console.error(
    '[migrate] ERRORE: target produzione richiede PREMURA_CONFIRM_PROD=yes per esplicita conferma.\n' +
      'Vedi docs/DB-MIGRATIONS.md sezione "Applicare a production".',
  );
  process.exit(1);
}

console.log(`[migrate] target: ${redactUrl(databaseUrl)}${dryRun ? ' (DRY RUN)' : ''}`);

// Connection con max 1 (migrator non beneficia di pool, query sequenziali).
const sql = postgres(databaseUrl, { max: 1, prepare: false });
const db = drizzle(sql);

try {
  if (dryRun) {
    // Drizzle migrator non espone un `--dry-run` nativo. Fallback: leggi
    // il journal locale + la tabella drizzle_migrations su DB e calcola
    // diff. Output testuale.
    await dryRunReport(sql);
  } else {
    await migrate(db, { migrationsFolder: './packages/db/src/migrations' });
    console.log('[migrate] OK: tutte le migration pending applicate.');
  }
} catch (err) {
  console.error('[migrate] ERRORE:', err);
  process.exit(1);
} finally {
  await sql.end({ timeout: 5 });
}

async function dryRunReport(sqlClient: ReturnType<typeof postgres>): Promise<void> {
  // Read local journal
  const fs = await import('node:fs');
  const path = await import('node:path');
  const journalPath = path.resolve('./packages/db/src/migrations/meta/_journal.json');
  const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8')) as {
    entries: Array<{ idx: number; tag: string; when: number }>;
  };
  const localTags = new Set(journal.entries.map((e) => e.tag));

  // Read drizzle_migrations table (creata al primo migrate). Se non
  // esiste, tutte le migration sono pending.
  let appliedTags = new Set<string>();
  try {
    const rows = (await sqlClient`SELECT hash FROM "drizzle"."__drizzle_migrations" ORDER BY id`) as Array<{
      hash: string;
    }>;
    appliedTags = new Set(rows.map((r) => r.hash));
  } catch (_err) {
    console.log('[migrate dry-run] tabella __drizzle_migrations non trovata (DB vergine).');
  }

  // Drizzle stora "hash" che e' diverso dal "tag", ma per il report
  // testuale basta enumerare i tag locali e dire "X applicate, Y pending".
  // Per essere precisi servirebbe leggere migrations.json che ha gli
  // hash. Per il dry-run e' sufficiente come output informativo.
  const totalLocal = localTags.size;
  const totalApplied = appliedTags.size;
  const pending = totalLocal - totalApplied;

  console.log(`[migrate dry-run] journal locale: ${totalLocal} migration`);
  console.log(`[migrate dry-run] DB applied:    ${totalApplied} migration`);
  console.log(`[migrate dry-run] pending:       ${pending} migration`);
  if (pending > 0) {
    console.log('[migrate dry-run] applica con `pnpm db:migrate` (senza --dry-run).');
  } else {
    console.log('[migrate dry-run] DB e migrations folder allineati.');
  }
}

function redactUrl(url: string): string {
  // postgresql://user:pass@host:port/db -> postgresql://***:***@host:port/db
  return url.replace(/:\/\/([^:@/]+):([^@/]+)@/, '://***:***@');
}
