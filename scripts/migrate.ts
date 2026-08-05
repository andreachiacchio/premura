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

  // ATTENZIONE — questo report NON e' affidabile, e lo dice.
  //
  // Confronta due cose diverse: i TAG del journal locale contro gli
  // HASH della tabella sul DB, e ne sottrae i conteggi. Quindi:
  //  - una migration presente su un lato ma non sull'altro sparisce
  //    dal calcolo se i numeri per caso tornano;
  //  - un .sql non registrato nel journal e' invisibile a entrambi.
  //
  // E' esattamente cosi' che il 05/08 ha risposto "0 pending" mentre
  // 0036 e 0037 non erano tracciate sul database.
  //
  // Decisione Andrea: NON correggerlo, perche' il percorso buono e' il
  // workflow db-migrate.yml. Ma deve dichiararsi inaffidabile invece di
  // dire "allineati" — un numero di cui non ci si puo' fidare, se
  // presentato come certo, e' peggio di nessun numero.
  const totalLocal = localTags.size;
  const totalApplied = appliedTags.size;
  const differenza = totalLocal - totalApplied;

  console.log(`[migrate dry-run] journal locale: ${totalLocal} migration`);
  console.log(`[migrate dry-run] righe sul DB:   ${totalApplied}`);
  console.log(`[migrate dry-run] differenza:     ${differenza}`);
  console.log('');
  console.log('[migrate dry-run] STIMA NON AFFIDABILE: confronta tag locali con hash del');
  console.log('[migrate dry-run] DB e ne sottrae i conteggi, quindi puo tacere una');
  console.log('[migrate dry-run] migration mancante. Per sapere davvero cosa e pendente usa');
  console.log('[migrate dry-run] il workflow "Applica migration database" su GitHub Actions.');
  if (differenza > 0) {
    console.log(`[migrate dry-run] almeno ${differenza} migration NON risultano applicate.`);
  }
}

function redactUrl(url: string): string {
  // postgresql://user:pass@host:port/db -> postgresql://***:***@host:port/db
  return url.replace(/:\/\/([^:@/]+):([^@/]+)@/, '://***:***@');
}
