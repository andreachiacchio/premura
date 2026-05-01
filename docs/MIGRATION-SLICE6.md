# Slice 6 - Procedura di deploy

Slice 6 attiva Supabase Auth con RLS multi-tenancy. Il deploy richiede una sequenza precisa di migration DB + creazione user. Va eseguito una sola volta per ambiente (staging, poi production).

## Prerequisiti

Variabili ambiente necessarie nell'ambiente target:

- `SUPABASE_URL`: URL progetto Supabase (es. `https://xxx.supabase.co`)
- `SUPABASE_SERVICE_ROLE_KEY`: chiave service role del progetto. CREDENZIALE SUPER-PRIVILEGIATA, bypassa RLS, mai in commit ne log. In Vercel impostare come "Sensitive".
- `DATABASE_URL`: gia' esistente, invariato.

## Sequenza di esecuzione

1. Migration RLS

   ```bash
   pnpm --filter @premura/db migrate
   ```

   Esegue `0007_enable_rls.sql` sul `DATABASE_URL` configurato. Abilita RLS su 21 tabelle e crea 79 policy scoped a `auth.uid()`.

2. Script seed user La Goccia

   ```bash
   pnpm tsx packages/db/src/scripts/seed-goccia-user.ts
   ```

   Crea il user Supabase con UUID = `2ad367f1-3433-4b42-b143-5ece3cd8bb5b`, email `c.farmabeauty@gmail.com`. Idempotente: se gia' eseguito, esce senza errore.

3. Verifica RLS attivo

   Apri Supabase Studio dell'ambiente, naviga su Database -> Tables, verifica che le 21 tabelle abbiano "RLS enabled" (lucchetto verde). Spot check: prova `SELECT` da SQL editor con `role=anon`, deve tornare zero righe per le tabelle per-host (`waitlist` puo' ricevere INSERT ma non SELECT).

4. Deploy applicazione

   Sequenza in 4 sotto-passi. Settare env PRIMA del merge garantisce che il primo deploy con codice slice 6 abbia gia' tutto cio' che serve. Rimuovere `DEV_HOST_ID` e `ALLOW_DEV_HOST` DOPO smoke test garantisce fallback rapido in caso di problemi: basta riaccendere le env vars e revertire il merge.

   **4a. Setta env vars su Vercel PRIMA del merge:**

   - `NEXT_PUBLIC_SUPABASE_URL` (Production + Preview)
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Production + Preview)
   - `SUPABASE_SERVICE_ROLE_KEY` (Production + Preview, marca come "Sensitive")
   - `SUPABASE_URL` (per script seed se mai eseguito da Vercel function in futuro - opzionale ora)

   **NON RIMUOVERE ANCORA** `DEV_HOST_ID` e `ALLOW_DEV_HOST`.

   **4b. Merge PR #22 su main.**

   Vercel deploya con env gia' pronte, middleware login attivo, dashboard protetta. `premura.it` resta funzionante (landing waitlist invariata).

   **4c. Verifica deploy Vercel verde.**

   Aspetta che il build Vercel completi con success, poi esegui lo smoke test del passo 5.

   **4d. Solo dopo smoke test ok:** rimuovi `DEV_HOST_ID` e `ALLOW_DEV_HOST` dalle env Vercel. Forza redeploy (Settings -> Deployments -> Redeploy) per pulire la build con env aggiornate.

5. Smoke test

   Apri `https://premura.it/login`, inserisci `c.farmabeauty@gmail.com`, ricevi magic link via email, click, atterri su `/dashboard`, vedi le prenotazioni di La Goccia.

## Rollback

Se qualcosa va storto, in ordine:

- Reverti il merge PR #22 su main, deploy auto Vercel.
- Sull'ambiente DB esegui in SQL editor:
  - Per ogni tabella della migration 0007: `DROP POLICY IF EXISTS <nome> ON <tabella>;` (lista dei nomi nel file `packages/db/src/migrations/0007_enable_rls.sql`).
  - `ALTER TABLE <tabella> DISABLE ROW LEVEL SECURITY;`
- Il user Supabase di La Goccia puo' restare, non da' fastidio se l'app non la usa.

## Note ambiente

- Staging: prima esecuzione, scopo e' validare l'intera sequenza.
- Production: identica sequenza, fatta in finestra controllata. `premura.it` e' accessibile pubblicamente, durante la sequenza `/dashboard` puo' essere instabile per ~5 minuti tra step 1 e 4.
