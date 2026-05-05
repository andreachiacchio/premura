# Slice 6.5 — Debts cleanup

> Stato: 5 maggio 2026. Riferimento `docs/KNOWN-LIMITS.md` §22.

Questo slice chiude tre debiti tracciati da settimane, tutti piccoli, tutti utili.

## 6.5.1 — SMTP Resend per email magic link brandizzata

**Stato:** **IN ATTESA CREDENZIALI ANDREA.**

Cosa serve:
1. Account Resend (https://resend.com): signup gratuito, free tier 100 email/giorno (sufficiente per pilot Andrea).
2. Domain `premura.it` verificato in Resend: setup record SPF + DKIM via Vercel/registrar (~10 min, propagation ~1h).
3. API key generata in Resend Dashboard.
4. Configurazione Supabase Auth: Settings > Auth > SMTP Settings:
   - Host: `smtp.resend.com`
   - Port: `587`
   - User: `resend`
   - Password: `<RESEND_API_KEY>`
   - Sender email: `noreply@premura.it`
   - Sender name: `Premura`
5. Template email magic link in Supabase: localizzato italiano + logo Premura.

Una volta fatto, il rate limit Supabase default (~4 email/h) sblocca: si passa al rate limit Resend (10 email/secondo, 100/giorno).

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
