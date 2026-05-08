# DB Migrations workflow

Drizzle ORM + drizzle-kit. Schema TS in `packages/db/src/schema/`,
migration SQL versionate in `packages/db/src/migrations/`.

## Comandi

Tutti gli script hanno `db:` come prefisso a livello root e sono anche
disponibili come `migrate*` nel package `@premura/db`.

```bash
# Genera nuova migration SQL dalle modifiche allo schema TS.
# Apre prompt interattivi se la diff non e' decidibile in automatico
# (es. una colonna rinominata vs droppata + ricreata).
pnpm db:generate                # alias di db:migrate:generate

# Applica le migration pending al DB target (DATABASE_URL).
# Idempotente: drizzle tracking via tabella drizzle.__drizzle_migrations.
pnpm db:migrate

# Simula migrate: mostra count pending senza applicare.
pnpm db:migrate:dry             # alias del flag --dry-run

# Drift detection: schema TS vs migrations folder.
# Lancia drizzle-kit generate in dry mode + cattura output. Se
# rileva nuova SQL o prompt interattivi, exit 1.
pnpm db:migrate:check
```

## Creare una nuova migration

1. Modifica i file in `packages/db/src/schema/*.ts`.
2. `pnpm db:generate` (o `pnpm db:migrate:generate` da package).
3. Drizzle crea `packages/db/src/migrations/0NNN_<auto-name>.sql` +
   aggiorna `meta/_journal.json` e `meta/0NNN_snapshot.json`.
4. Se appare un prompt "Is X created or renamed from Y?", scegli
   l'opzione corretta (preferenza per `rename` se semantically corretto:
   preserva i dati invece di drop+create).
5. Verifica la SQL generata, eventualmente edita per casi edge
   (default values, CASCADE, indici aggiuntivi).
6. **Committa tutti i file**: la SQL nuova, `_journal.json` aggiornato,
   il `0NNN_snapshot.json` nuovo.

## Applicare a staging

Staging Supabase punta al pooler URL del progetto staging.

```bash
# Lancia da locale, con DATABASE_URL settato a staging:
DATABASE_URL='postgres://postgres.<staging-project>:<password>@aws-0-eu-central-1.pooler.supabase.com:5432/postgres' \
  pnpm db:migrate

# Verifica esito:
pnpm db:migrate:dry             # deve dire "0 pending"
```

Output atteso (esempio):

```
[migrate] target: postgresql://***:***@aws-0-eu-central-1.pooler.supabase.com:5432/postgres
[migrate] OK: tutte le migration pending applicate.
```

## Applicare a production

**Conferma esplicita richiesta**. Lo script rifiuta di applicare a un
DB non-localhost se non e' settata la env var `PREMURA_CONFIRM_PROD=yes`.

```bash
DATABASE_URL='postgres://postgres.<prod-project>:<password>@aws-0-eu-central-1.pooler.supabase.com:5432/postgres' \
PREMURA_DB_TARGET=production \
PREMURA_CONFIRM_PROD=yes \
  pnpm db:migrate
```

Pre-requisiti:
- Migration gia' applicata e verificata su staging.
- Backup recente del DB (Supabase ha backup point-in-time, verifica
  l'ultimo timestamp prima di lanciare).
- Comunicazione al team su Slack #premura-deploy.

Post-applicazione:
- `pnpm db:migrate:dry` con stesso DATABASE_URL: deve dire "0 pending".
- Smoke test produzione: `curl -I https://premura.it/dashboard`
  deve tornare 307 (NON 500).

## Rollback

Drizzle non genera migration di rollback automaticamente. Strategia:

1. **Rollback "soft"**: scrivi una nuova migration che annulla i
   cambiamenti della precedente. Esempio:
   ```sql
   -- 0017_rollback_pending_drafts_outbound.sql
   ALTER TABLE pending_drafts
     DROP COLUMN IF EXISTS sent_at,
     DROP COLUMN IF EXISTS rejection_reason,
     DROP COLUMN IF EXISTS meta_message_id,
     DROP COLUMN IF EXISTS error_log,
     DROP COLUMN IF EXISTS retry_count;
   -- Note: ALTER TYPE ... DROP VALUE non e' supportato in Postgres.
   -- I valori 'sent' e 'failed' aggiunti restano nell'enum (innocuo).
   ```
   Lancia con `pnpm db:migrate` come una migration normale.

2. **Rollback "hard"** (raro, solo se rollback soft non basta):
   - Backup + restore Supabase point-in-time recovery (ultima ora).
   - Rimuovi manualmente le row da `drizzle.__drizzle_migrations`
     corrispondenti alle migration "rollback".
   - Edita journal + meta/* per riportare alla stato precedente.
   - Coordinare con Andrea: serve downtime + restart applicazioni.

In entrambi i casi: dopo il rollback, fixare il bug nello schema
locale e generare una nuova migration corretta. Niente git revert
delle SQL gia' applicate (creerebbe drift permanente).

## Debt — snapshot gap pre-DEBT-2

Le migration `0009_*` ... `0015_*` sono state applicate manualmente a
produzione la scorsa settimana e i corrispondenti snapshot
(`meta/0009_snapshot.json` ... `0015_snapshot.json`) **non esistono**
nella repo. Solo i file SQL + le entry nel `_journal.json` sono presenti.

Conseguenza: `pnpm db:migrate:check` rileva un "drift" rumoroso ogni volta
perche' drizzle-kit confronta lo schema TS corrente contro l'ultimo
snapshot disponibile (`0008_snapshot.json`) e vede tutte le modifiche
di slice 8.x → 12 come pending.

**Workaround temporaneo**: `db:migrate:check` resta uno strumento locale
informativo, NON e' un required check in CI (vedi `.github/workflows/ci.yml`).

**DEBT-2**: rigenerare gli snapshot 0009-0015 + il futuro 0016 da
schema corrente. Approcci possibili:

- A) Squash-baseline: drop journal + snapshot, ri-genera una migration
  unica `0000_baseline_<date>.sql` con `CREATE TABLE` per tutte le
  tabelle correnti. Skip preventivo via `__drizzle_migrations` row
  manuale per i DB gia' allineati.
- B) Reverse-engineering snapshot: scrivere uno script che, dato lo
  schema TS finale, genera retroattivamente snapshot 0009-0015 by
  re-applicando ogni SQL su una virtual schema in memoria. Piu'
  rispettoso della history, piu' fragile.

Decidere A o B in DEBT-2 dedicato.

## Convenzioni

- **Nomi migration**: snake_case descrittivo (`0NNN_pending_drafts_outbound`).
  Drizzle auto-genera nomi tipo `0NNN_majestic_nextwave` quando lanciato
  senza `--name`; rinominali a mano prima del commit per chiarezza.
- **Mai droppare colonne con dati** senza un'ALTER COLUMN preliminare
  che migra i dati altrove. Drizzle non gestisce data migration:
  scrivi DML manuale prima del DDL.
- **Mai modificare una migration gia' mergiata in main**. Nuove
  modifiche = nuova migration.
- **Mai applicare a prod senza staging prima**. Eccezione: hotfix
  schema con downtime annunciato.
