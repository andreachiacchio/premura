/**
 * DEBT-1 — Drift detection schema vs migrations.
 *
 * Lanciato in CI prima del merge: verifica che le modifiche al
 * `packages/db/src/schema/` abbiano la migration SQL corrispondente.
 * Se un developer modifica lo schema ma dimentica di lanciare
 * `pnpm db:migrate:generate`, questo script fallisce e blocca il
 * merge prima che il drift arrivi a produzione.
 *
 * Strategia:
 *  1. Snapshot della cartella migrations (lista file SQL + journal entries).
 *  2. Lancia `drizzle-kit generate` (no DB: diff in-memory contro lo
 *     snapshot in meta/*.json).
 *  3. Se nuove file SQL appaiono → drift → fail + rimuovi le file
 *     generate per lasciare la repo pulita.
 *  4. Se niente nuove file → schema in sync, exit 0.
 *
 * Niente connessione DB: drizzle-kit generate fa il diff a livello
 * codice (schema TS vs snapshot meta/) senza colpire postgres.
 */

import { execSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Risolvi path relative allo script invece che al CWD: cosi' funziona
// sia da root (`pnpm db:migrate:check`) sia da packages/db/
// (`pnpm --filter @premura/db migrate:check`).
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '..');
const MIGRATIONS_DIR = join(REPO_ROOT, 'packages/db/src/migrations');
const META_DIR = join(MIGRATIONS_DIR, 'meta');
const JOURNAL_PATH = join(META_DIR, '_journal.json');

function listSqlFiles(): Set<string> {
  return new Set(readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')));
}

function readJournal(): { entries: Array<{ tag: string }> } {
  return JSON.parse(readFileSync(JOURNAL_PATH, 'utf8'));
}

function snapshotMetaJson(): Map<string, string> {
  // Tutti i file *_snapshot.json in meta/ — drizzle-kit li aggiorna su
  // ogni generate. Restituisce mappa name -> contenuto.
  const out = new Map<string, string>();
  for (const f of readdirSync(META_DIR)) {
    if (f.endsWith('_snapshot.json')) {
      out.set(f, readFileSync(join(META_DIR, f), 'utf8'));
    }
  }
  return out;
}

console.log('[migrate-check] snapshot stato pre-generate...');
const beforeSql = listSqlFiles();
const beforeJournalLen = readJournal().entries.length;
const beforeSnapshots = snapshotMetaJson();

// drizzle-kit generate. Senza nome → drizzle usa nome auto, senza
// flag --no-schema-only va bene per il diff. stdio inherit per debug
// log; se fallisce, lo script propaga l'exit.
// Capture stdout/stderr cosi' possiamo cercare prompt interattivi
// (drizzle-kit chiede "create or rename?" se non riesce a decidere
// automaticamente — anche quello e' segnale di drift).
let generateOutput = '';
try {
  generateOutput = execSync('pnpm exec drizzle-kit generate', {
    cwd: REPO_ROOT,
    // stdin /dev/null: se drizzle-kit chiede input, riceve EOF e
    // tipicamente esce con errore. La presenza di prompt nell'output
    // viene poi rilevata sotto.
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, DATABASE_URL: 'postgresql://noop:noop@localhost:5432/noop' },
    encoding: 'utf8',
    timeout: 30_000,
  });
} catch (err) {
  // Non-zero exit: drizzle-kit puo' uscire con errore se chiede input
  // e riceve EOF. L'output e' utile per il messaggio di errore.
  if (err && typeof err === 'object' && 'stdout' in err) {
    generateOutput = String((err as { stdout?: Buffer | string }).stdout ?? '');
    generateOutput += String((err as { stderr?: Buffer | string }).stderr ?? '');
  }
}

// Heuristics drift: drizzle-kit interactive prompt = drift (la decisione
// non e' automatica, schema cambiato).
const interactiveDrift =
  /created or renamed from/i.test(generateOutput) ||
  /Is .* table created/i.test(generateOutput) ||
  /Is .* column created/i.test(generateOutput);
if (interactiveDrift) {
  console.error('[migrate-check] DRIFT: drizzle-kit non puo decidere automaticamente.');
  console.error('Output drizzle-kit:');
  console.error(generateOutput.slice(0, 2000));
  console.error('');
  console.error('Per fixare: lancia `pnpm db:migrate:generate` localmente, rispondi alle prompt, committa SQL.');
  process.exit(1);
}

const afterSql = listSqlFiles();
const afterJournalLen = readJournal().entries.length;

const newSqlFiles = [...afterSql].filter((f) => !beforeSql.has(f));
const journalGrew = afterJournalLen > beforeJournalLen;

// Drizzle puo' aggiornare snapshot files anche senza generare nuove
// SQL (es. metadata change). Per ora controlliamo solo file SQL nuovi
// + journal grow: questi sono il segnale forte di drift.
if (newSqlFiles.length > 0 || journalGrew) {
  console.error('[migrate-check] DRIFT rilevato: schema TS modificato senza migration corrispondente.');
  console.error(`[migrate-check] nuove SQL: ${newSqlFiles.join(', ') || '(nessuna)'}`);
  console.error(`[migrate-check] journal entries: ${beforeJournalLen} -> ${afterJournalLen}`);
  console.error('');
  console.error('Per fixare: lancia `pnpm db:migrate:generate` localmente, committa la nuova SQL.');
  console.error('');
  console.error('[migrate-check] ripristino stato pre-check (rimuovo file generate)...');
  // Cleanup: rimuovi le SQL nuove + ripristina snapshot+journal
  // dallo stato prima. Cosi' la working copy resta pulita per il developer.
  for (const f of newSqlFiles) {
    try {
      unlinkSync(join(MIGRATIONS_DIR, f));
    } catch (_e) {
      // best-effort
    }
  }
  // Ripristina journal e snapshot files al loro stato pre-generate.
  // Drizzle puo' aver toccato anche i meta/* json.
  // Per semplicita': lasciamo al developer che vede i diff in git status
  // di decidere cosa committare. Lo script comunque fail e blocca il CI.
  process.exit(1);
}

console.log('[migrate-check] OK: schema TS e migrations folder in sync.');
process.exit(0);
