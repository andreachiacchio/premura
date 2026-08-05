// Guardia CI: ogni .sql deve avere la sua voce nel journal Drizzle.
//
// Perche' esiste (Andrea, 05/08 — "e' la terza volta che una migration
// arriva in main senza essere applicata"):
//
// Il migrator di Drizzle NON legge la cartella: itera su
// meta/_journal.json e apre `${tag}.sql` per ogni voce. Un file .sql
// senza voce nel journal e' invisibile — non viene applicato, e nessuno
// se ne accorge finche' qualcosa non esplode in produzione. E' successo
// con 0024_waitlist_beta_access, ed e' quasi successo con
// 0037_prenotazione_diretta: il form era live e ogni salvataggio
// sarebbe fallito su una colonna inesistente.
//
// Scritto in .mjs puro, senza tsx e senza dipendenze, di proposito:
// questa guardia non deve poter fallire per lo stesso motivo per cui
// fallisce `pnpm db:migrate` sulla macchina di Andrea
// (ERR_MODULE_NOT_FOUND). Deve girare ovunque ci sia node.
//
// Controlla anche il verso opposto — voce nel journal senza file — che
// farebbe fallire il migrator a meta' con "No file ... found".
//
// NON verifica che le migration siano applicate al database: quello e'
// il lavoro del workflow db-migrate.yml. Qui si controlla solo la
// coerenza fra i due elenchi locali, che e' gratis e non richiede
// credenziali.

import fs from 'node:fs';
import path from 'node:path';

const DIR = 'packages/db/src/migrations';
const JOURNAL = path.join(DIR, 'meta/_journal.json');

function fallisci(messaggio, dettagli) {
  console.error(`::error::${messaggio}`);
  for (const d of dettagli) console.error(`  - ${d}`);
  process.exit(1);
}

if (!fs.existsSync(JOURNAL)) {
  fallisci(`Journal non trovato: ${JOURNAL}`, []);
}

const journal = JSON.parse(fs.readFileSync(JOURNAL, 'utf8'));
const voci = journal.entries ?? [];
const tagNelJournal = new Set(voci.map((e) => e.tag));

const fileSql = fs
  .readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  .map((f) => f.replace(/\.sql$/, ''));

// 1. File senza voce: il migrator non lo vedrebbe mai.
const orfani = fileSql.filter((tag) => !tagNelJournal.has(tag));
if (orfani.length > 0) {
  fallisci(`${orfani.length} migration non registrate nel journal: non verrebbero MAI applicate.`, [
    ...orfani.map((t) => `${t}.sql non ha una voce in meta/_journal.json`),
    'Aggiungi la voce: { "idx": <n>, "version": "7", "when": <millis>, "tag": "<tag>", "breakpoints": true }',
  ]);
}

// 2. Voce senza file: il migrator fallirebbe a meta' con "No file found".
const mancanti = voci.filter((e) => !fileSql.includes(e.tag)).map((e) => e.tag);
if (mancanti.length > 0) {
  fallisci(`${mancanti.length} voci del journal senza il file .sql corrispondente.`, [
    ...mancanti.map((t) => `il journal cita ${t} ma ${t}.sql non esiste`),
  ]);
}

// 3. idx duplicati o `when` non crescenti: il migrator applica in ordine
//    di journal e confronta col `created_at` piu' alto sul DB, quindi un
//    `when` fuori sequenza fa saltare silenziosamente delle migration.
const problemi = [];
const idxVisti = new Set();
let precedente = Number.NEGATIVE_INFINITY;
for (const e of voci) {
  if (idxVisti.has(e.idx)) problemi.push(`idx ${e.idx} duplicato (${e.tag})`);
  idxVisti.add(e.idx);
  if (e.when <= precedente) {
    problemi.push(`${e.tag} ha when=${e.when}, non maggiore del precedente (${precedente})`);
  }
  precedente = e.when;
}
if (problemi.length > 0) {
  fallisci('Journal incoerente: il migrator salterebbe delle migration.', problemi);
}

console.log(
  `[check-migrations] ok — ${fileSql.length} file .sql, ${voci.length} voci nel journal, tutte corrispondenti.`,
);
