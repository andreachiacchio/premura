# Slice 6.5 — Debts cleanup

> Stato: 5 maggio 2026. Riferimento `docs/KNOWN-LIMITS.md` §22.

Questo slice chiude tre debiti tracciati da settimane, tutti piccoli, tutti utili.

## 6.5.1 — SMTP Resend per email magic link brandizzata

**Stato:** **codice ready-to-deploy, in attesa credenziali Andrea.**

Aggiornamento 5 mag 2026:
- Codice client Premura pronto e testato. File:
  `apps/web/lib/email-resend.ts` (REST API wrapper, no SDK npm
  dipendenza). 15 unit test verdi.
- Template magic link brandizzato HTML+plaintext pronto. File:
  `apps/web/lib/email-templates.ts`. Identita' visiva slice 10a
  (palette ivory/ink/terracotta, font Fraunces+Inter, copy italiano
  in tono Premura).
- Env var `RESEND_API_KEY` aggiunta a `.env.example`.
- Codice e' dormant: viene chiamato solo se `RESEND_API_KEY` e'
  popolato. Niente disruption nello stato attuale.

### Step 1 — Signup Resend (Andrea, 2 min)

1. Vai su https://resend.com/signup.
2. Login con email Andrea (usare la stessa email Premura).
3. Free tier: 100 email/giorno + 1 dominio verificato. Sufficiente
   per pilot e prime fasi early access.

### Step 2 — Aggiungi dominio premura.it a Resend (Andrea, 5 min)

1. Resend Dashboard > Domains > Add Domain.
2. Dominio: `premura.it` (root) oppure `mail.premura.it` (sottodominio
   dedicato — preferito per evitare conflitti SPF con altri servizi).
3. Region: `eu-west-1` (Frankfurt) per latenza Italia + GDPR.
4. Resend mostra 3 record DNS da configurare:
   - 1× **SPF**: TXT su `mail.premura.it` con valore tipo
     `v=spf1 include:amazonses.com ~all`.
   - 2× **DKIM**: 2 CNAME su `resend._domainkey.mail.premura.it` e
     `resend2._domainkey.mail.premura.it`.

### Step 3 — Configura DNS Vercel (Andrea, 10 min + propagation 1h)

1. Vercel Dashboard > premura.it project > Settings > Domains.
2. Click su `premura.it` > DNS tab.
3. Aggiungi i 3 record copiati da Resend Step 2 (TXT SPF + 2 CNAME
   DKIM).
4. Salva. Propagation ~1h (puo' essere 5 min se DNS Vercel veloce).
5. Torna su Resend Dashboard > Domains > premura.it > click
   "Verify". Aspetta finche' diventa verde.

### Step 4 — Genera API Key Resend (Andrea, 1 min)

1. Resend Dashboard > API Keys > Create API Key.
2. Name: `premura-prod`.
3. Permission: `Sending access` (write only, no full access).
4. Domain: `premura.it`.
5. Copia il valore `re_xxxxxxxxxxxx`. **Mostrato una sola volta.**

### Step 5 — Setta env var su Fly + Vercel (Andrea o Claude)

Su Fly (apps/api se mai serve email da li'):
```bash
flyctl secrets set RESEND_API_KEY="re_xxx..." -a premura-api-staging
```

Su Vercel (apps/web, dove sta il codice client):
```bash
vercel env add RESEND_API_KEY production
# incolla re_xxx...
vercel env add RESEND_API_KEY preview
# stesso valore
```

Niente push di codice necessario: il codice e' gia' deployato e
attiva il client appena la env var e' popolata.

### Step 6 — Configura Supabase Auth SMTP (Andrea, 5 min)

Per il flow magic link (gestito da Supabase Auth), la chiave Resend
viene esposta al SMTP server di Resend, non al SDK lato Premura.

1. Supabase Dashboard > Project > Authentication > Email Templates.
2. Click "Enable Custom SMTP" (icon ingranaggio).
3. Settings:
   - Host: `smtp.resend.com`
   - Port: `587`
   - User: `resend`
   - Password: `<RESEND_API_KEY>` (la stessa di Step 4)
   - Sender email: `noreply@mail.premura.it` (o `noreply@premura.it`
     a seconda del dominio configurato Step 2)
   - Sender name: `Premura`
4. Save.

### Step 7 — Template magic link in Supabase (Andrea, 5 min)

1. Supabase Dashboard > Authentication > Email Templates > Magic Link.
2. **Subject:** `Accedi a Premura` (export `MAGIC_LINK_SUBJECT` in
   `apps/web/lib/email-templates.ts`).
3. **Body (HTML):** copia-incolla output di
   `buildMagicLinkHtml({ confirmationUrl: '{{ .ConfirmationURL }}' })`.
   La variabile Supabase `{{ .ConfirmationURL }}` si interpola al
   momento dell'invio.
4. Save.

### Step 8 — Smoke test (Andrea + Claude)

1. Apri finestra incognito su `https://premura.it/login`.
2. Inserisci email Andrea, click "Manda link".
3. Verifica:
   - Email ricevuta entro 30s.
   - Sender = `noreply@mail.premura.it` (o `noreply@premura.it`).
   - Layout brandizzato (palette ivory + bottone terracotta).
   - Click sul bottone → redirect a `/auth/callback` → `/dashboard`.

Una volta fatto, il rate limit Supabase default (~4 email/h) sblocca:
si passa al rate limit Resend (10 email/secondo, 100/giorno).

### Cosa fa il codice ready-to-deploy

- `apps/web/lib/email-resend.ts`:
  - `createResendClient({ apiKey?, fetcher? })`: throw se `RESEND_API_KEY`
    mancante. Override `fetcher` per test con mock.
  - `sendEmailViaResend(input)`: convenience env-based.
  - `ResendClientError` con `statusCode` per error handling 4xx/5xx.
- `apps/web/lib/email-templates.ts`:
  - `buildMagicLinkHtml({ recipientName?, confirmationUrl, brandName? })`
  - `buildMagicLinkText(...)` plaintext fallback per client che non
    rendono HTML.
  - `MAGIC_LINK_SUBJECT` costante.
- `apps/web/tests/email-resend.test.ts`: 15 unit test verdi (mock
  fetch, copre happy path, error 4xx, network error, response senza
  id, template HTML/plaintext + branding).

Decisione: **non bloccante**, ma utile dopo che si fanno test multipli sul magic link. Andrea decide quando fare il setup esterno; il codice non cambia.

## 6.5.2 — JWT validation Fastify

**Stato:** **FATTO** in questo PR.

Componenti:
- `apps/api/src/plugins/jwt-auth.ts`:
  - `verifyHs256(token, secret)`: pura, valida HMAC SHA-256 + claim exp + reject malformed/unsupported alg.
  - `attachJwtAuth(app, opts)`: registra `onRequest` hook sul context Fastify root (NON encapsulated). Decora `req.user = { hostId, email }` da claim `sub`/`email`. Esclude `/health*`, `/webhooks/*` di default.
  - `requireUser(req)`: helper per route handler, throw 401 se `req.user` undefined.
- `apps/api/src/index.ts`: `attachJwtAuth(app, { excludePaths: ['/health', '/webhooks/'] })` registrato prima delle route protette.

Env nuovo: `SUPABASE_JWT_SECRET` (vedi `.env.example`). Da settare su Fly secrets pre-deploy:

```bash
flyctl secrets set SUPABASE_JWT_SECRET="<value>" -a premura-api-staging
```

Valore: Supabase Dashboard > Settings > API > JWT Secret.

**Compat con route esistenti.** Le route `/api/bookings/*` e `/api/properties/*` ora richiedono Bearer JWT. Il path Next.js → server action → API include sempre il Bearer (vedi `getCurrentAccessToken()` + `triggerIcalPollNow`). Per rendere `complete-manual` / `skip-completion` allineate, andrebbero aggiornate per inoltrare il Bearer; debito tracciato in slice 6.5.4.

Test: 16 unit + 6 integration via inject (`apps/api/tests/jwt-auth.test.ts`, `apps/api/tests/properties-routes.test.ts`).

## 6.5.3 — Trigger iCal automatico su nuova property

**Stato:** **FATTO** in questo PR.

Componenti:
- `apps/api/src/api/properties.ts`: endpoint `POST /api/properties/:id/ical-poll-now` (JWT-protected via slice 6.5.2). Lookup property con ownership check (`hostId == req.user.hostId`), iterazione `icalSources`, enqueue un job per source su `icalPollQueue` BullMQ con `jobId` univoco (`oneshot-{id}-{source}-{ts}`).
- `apps/web/lib/api.ts`: `triggerIcalPollNow(propertyId, accessToken)`. Best-effort: log warn se fallisce, niente throw (la property e' gia' creata, prossimo cron tick fa il poll comunque entro 15 min).
- `apps/web/app/dashboard/actions.ts`: `createPropertyAction` chiama `triggerIcalPollNow` dopo l'insert se `icalBookingUrl` e' presente.

**Decisione architetturale:** niente migration nuova ne' nuova tabella di scheduling per-property. Il cron globale ogni 15 min (`apps/api/src/jobs/ical-cron.ts`) gia' itera su tutte le properties attive con `icalSources` non vuoto. L'endpoint one-shot serve solo a ridurre la latenza percepita dall'host nuovo (15 min → ~2s). Update/delete property non richiedono hook: il cron al prossimo tick rispecchia automaticamente lo stato del DB.

Test: 6 integration via inject (`apps/api/tests/properties-routes.test.ts`): 401 senza JWT, 404 ownership mismatch, 202 happy path con N enqueue, 200 con icalSources vuoto, 400 UUID malformato.
