# @premura/web

App Next.js 15 (App Router) per la dashboard host di Premura.

## Stack

- **Next.js 15** + **React 19** (App Router, no pages router)
- **TypeScript strict** (estende `tsconfig.base.json` della root)
- **Tailwind CSS v4** — configurazione CSS-first via `@theme` in
  `app/globals.css`, nessun `tailwind.config.ts`
- Font: **Inter** (body) + **Fraunces** (display, variable axes
  `SOFT` e `opsz`) via `next/font/google`

I design token sono estratti 1:1 da `demo/premura-prototype.html`
(palette, tipografia, radius, shadow, easing).

## Comandi

```bash
pnpm --filter @premura/web dev        # dev server → localhost:3000
pnpm --filter @premura/web build      # build produzione
pnpm --filter @premura/web start      # start produzione
pnpm --filter @premura/web lint       # next lint
pnpm --filter @premura/web typecheck  # tsc --noEmit
pnpm test                              # vitest (include apps/web/tests)
```

## Route pubbliche attualmente live

| Route | Tipo | Descrizione |
|---|---|---|
| `/` | static | Landing marketing + waitlist (M1.3.c) |
| `/privacy` | static | Privacy policy minimale |
| `/design` | static | Living style guide componenti |
| `/connect-gmail` | dynamic | Consent screen OAuth Google (M2a.3) |
| `/connect-gmail/success` | dynamic | Post-OAuth success + dettagli collegamento |
| `/connect-gmail/error` | dynamic | Post-OAuth error con `?reason=` |
| `/api/waitlist` | dynamic | `POST` — INSERT in tabella waitlist |
| `/api/auth/google/start` | dynamic | `GET ?hostId=<uuid>` — redirect a Google consent |
| `/api/auth/google/callback` | dynamic | `GET ?code&state` — exchange + upsert + redirect |
| `/api/gmail/sync` | dynamic | `POST` — avvia sync background, ritorna `202 { jobId }` (M2a.3 Fase 2) |
| `/api/gmail/sync/status` | dynamic | `GET ?jobId=<uuid>` — stato job per progress bar |

## Google OAuth (M2a.3 Fase 1) — setup dev locale

### 1) Env vars richieste in `.env.local` (root del repo)

```bash
# URL pubblico dell'app — usato per il redirect_uri OAuth
APP_URL=http://localhost:3000

# DB — Session Pooler Supabase (IPv4, stesso di Fly)
DATABASE_URL=postgresql://postgres.<ref>:<pwd>@aws-<region>.pooler.supabase.com:5432/postgres

# Google OAuth client (web application)
GOOGLE_CLIENT_ID=<client_id>.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=<client_secret>

# Chiave simmetrica AES-256 + HMAC JWT state (32 byte base64)
# Genera con: openssl rand -base64 32
TOKEN_ENCRYPTION_KEY=<32-byte-base64>

# UUID dell'host di test (Andrea) — leggibile da seed.ts in packages/db
# Temporaneo finché non c'è auth reale (M2a.2).
DEV_HOST_ID=<uuid>
```

### 2) Apply migration

```bash
pnpm db:push
```

Crea la tabella `google_tokens` in Supabase dev. Idempotente.

### 3) Redirect URI già registrati su Google Cloud Console

Verifica su <https://console.cloud.google.com/auth/clients> che siano presenti:
- `http://localhost:3000/api/auth/google/callback`
- `https://premura.it/api/auth/google/callback`
- `https://premura-web.vercel.app/api/auth/google/callback`

Se aggiungi un nuovo ambiente (es. PR preview Vercel), registra anche quel redirect URI.

### 4) Test flow end-to-end

```bash
pnpm --filter @premura/web dev
# Poi in browser: http://localhost:3000/connect-gmail
```

Clic su "Ho capito, collega Gmail" → consent screen Google → autorizza →
redirect automatico a `/connect-gmail/success?email=...&connectedAt=...`.

Verifica la riga in Supabase → `google_tokens` → deve comparire un record con
`host_id = <DEV_HOST_ID>`, `google_email = <tua-gmail>`, token cifrati (base64),
`expires_at` ~1h nel futuro.

### 5) Test unit

```bash
pnpm test
```

24 test unit coprono la libreria `lib/google-oauth.ts` (encrypt/decrypt,
state JWT, buildAuthUrl, exchangeCodeForTokens con mock). Nessuna chiamata
reale a Google.

## Sicurezza — come sono cifrati i token

File: `apps/web/lib/google-oauth.ts`

- **Algoritmo**: AES-256-GCM (autenticato, no modalità legacy)
- **IV**: 12 byte random a ogni cifratura
- **Auth tag**: 16 byte (verificato al decrypt — tampering rilevato)
- **Storage layout**: `base64( iv[12] || authTag[16] || ciphertext )`
- **Chiave**: `TOKEN_ENCRYPTION_KEY`, 32 byte base64 in env (mai in DB, mai in log)
- **Riuso chiave**: la stessa chiave firma i JWT di state CSRF (HS256).
  Se leaked, ruotare tutti i token + forzare re-consent degli host.

Nota operativa: se ruoti `TOKEN_ENCRYPTION_KEY`, i token esistenti
diventano non-decryptabili. Piano di rotazione pre-launch: re-encryption
in batch oppure forzare re-OAuth agli host esistenti.

## Struttura

```
apps/web/
├── app/
│   ├── layout.tsx                       # root layout + font
│   ├── page.tsx                         # landing
│   ├── privacy/page.tsx
│   ├── design/page.tsx
│   ├── connect-gmail/
│   │   ├── page.tsx                     # consent screen Premura
│   │   ├── success/page.tsx
│   │   └── error/page.tsx
│   └── api/
│       ├── waitlist/route.ts
│       └── auth/google/
│           ├── start/route.ts
│           └── callback/route.ts
├── components/
│   ├── Button.tsx
│   ├── Card.tsx
│   ├── Container.tsx
│   ├── Eyebrow.tsx
│   ├── Heading.tsx
│   └── landing/…
├── lib/
│   ├── cn.ts
│   ├── rate-limit.ts
│   ├── waitlist-schema.ts
│   ├── google-oauth.ts                  # crypto + OAuth pure funcs
│   └── repositories/
│       └── google-tokens.ts             # upsert + decrypt
├── tests/
│   └── google-oauth.test.ts             # 24 unit test
└── package.json
```

## M2a.3 Fase 2 — Gmail backfill + parser email Airbnb

### Costi Claude (parser email)

Sonnet 4.6 a $3 input / $15 output per 1M token. Una email Airbnb è
~3000 token input + ~500 output → ~$0.016 per email = ~€0.015.

| Volume sync | Costo stimato |
|---|---|
| 50 email (sync iniziale tipico) | ~€0.75 |
| 200 email (host molto attivo) | ~€3 |

Prompt caching attivo sul system prompt (~70% saving sui token cached
read). Per ridurre ulteriormente, override
`CLAUDE_MODEL_EMAIL_PARSER=claude-haiku-4-5-20251001` (~4× più
economico, qualità accettabile per estrazione strutturata).

### Architettura sync (Opzione B)

`POST /api/gmail/sync`:
1. Crea `gmail_sync_jobs` row → ottiene `jobId`.
2. Lancia `syncGmailForHost(...)` in background (`void` promise +
   `reuseJobId`).
3. Risponde **202 `{ jobId }`** immediatamente.

Frontend `<GmailSyncProgress />` (montato in `/connect-gmail/success`):
- POST iniziale → riceve jobId.
- Polling `GET /api/gmail/sync/status?jobId=X` ogni 1.5s.
- Render: progress bar (`processedEmails / totalEmails`) → summary
  finale con "trovate N prenotazioni, M ospiti registrati", oppure
  errore + retry su `status='failed'`.

Limitazioni note documentate in `docs/KNOWN-LIMITS.md` §8 (Vercel
function timeout sul tier Hobby, no auto-refresh access_token).

### Test

```bash
pnpm test                  # 61 unit test (incluse 7 web tests sul parser)
pnpm test:integration       # 1 integration testcontainer Postgres
```

L'integration test (`gmail-sync-orchestrator.integration.test.ts`)
applica le migration 0000→0003 a un Postgres temporaneo, seed-a 1
host + 1 property "La Goccia", mocka GmailClient con 3 email finte
(2 future, 1 passata), e verifica che `bookings` + `guest_profiles`
+ `gmail_sync_jobs` siano popolati correttamente. Skipped graceful se
Docker non è attivo.

## Roadmap

- **M2a.3 Fase 1** ✅ OAuth flow + token persistiti cifrati
- **M2a.3 Fase 2** ✅ Gmail backfill 90gg + parser email Airbnb
  (Claude Sonnet 4.6) + UI progress bar + summary
- **M2a.3 Fase 3** — parser email Booking.com (analogo, prompt diverso)
- **M2a.3 Fase 4** — auto-refresh access_token + dashboard "email lette"
- **M2a.2** — Auth reale (Supabase Auth), rimuovere `DEV_HOST_ID`
- **M2a.1** — iCal ingestion (su branch separato)
