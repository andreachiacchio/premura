# Slice 7a.1 — Setup WhatsApp Cloud API

> **Stato:** procedura operativa.
> **Data:** 4 maggio 2026.
> **Riferimento strategia:** `docs/SLICE7-RESEARCH-MESSAGE-SOURCES.md` §3.I
> (opzione I, bootstrap su numero Business esistente Andrea).
> **Riferimento codice:** `apps/api/src/api/webhooks/whatsapp.ts` +
> `apps/api/src/api/webhooks/whatsapp-signature.ts`.

Questo documento descrive cosa Andrea deve configurare su Meta Developer
Portal perche' il webhook Premura riceva eventi WA reali. Il codice
backend gira gia' contro test number (sandbox Meta gratuito) durante
sviluppo. La migrazione del numero Business esistente avviene a fine
milestone 7a.1, quando il webhook ha passato i test di signature verify
+ challenge handshake.

## Step 1 — Crea l'app Meta

1. Vai su https://developers.facebook.com/apps.
2. Crea app tipo **Business** (non "Consumer").
3. Nome app: `Premura WA Pilot` (placeholder, rinominabile).
4. Aggiungi prodotto: **WhatsApp** > Set up. Meta crea automaticamente
   una WABA (WhatsApp Business Account) di test con un test number
   sandbox associato.

## Step 2 — Test number sandbox (sviluppo)

Il test number Meta:
- E' gratuito, non costa per messaggio.
- Puo' inviare messaggi solo a 5 numeri verificati (Andrea aggiunge il
  suo personale + Karen + 1-2 amici per QA).
- Non richiede approvazione Meta, attivo immediatamente.
- Phone Number ID = stringa numerica visibile in dashboard, da copiare
  in `WHATSAPP_PHONE_NUMBER_ID`.

Premura sviluppa contro questo test number per slice 7a.1. Il switch al
numero reale e' env var swap, no code change.

## Step 3 — Webhook configuration (sandbox)

1. WhatsApp > Configuration > Webhook > Edit.
2. **Callback URL:** `https://premura-api-staging.fly.dev/webhooks/whatsapp`
   (per dev locale: ngrok / cloudflare tunnel verso `localhost:3000`).
3. **Verify token:** stringa random 32+ char generata con
   `openssl rand -hex 32`. Salvala in `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
   su Fly secrets + `.env.local`.
4. Subscribe a campo `messages`. Niente altri campi per ora (slice 7a.1
   gestisce solo inbound).
5. Click **Verify and Save**. Meta fa GET con
   `?hub.mode=subscribe&hub.verify_token=<token>&hub.challenge=<random>`.
   Il nostro endpoint risponde 200 + challenge in plain text.

## Step 4 — Permanent access token

Token temporanei Meta scadono in 24h (utili solo per test manuali curl).
Per produzione serve **System User access token** permanente:

1. Business Settings > System Users > Add.
2. Crea system user `premura-webhook-bot`, ruolo Admin.
3. Assign Asset > WhatsApp accounts > seleziona la WABA + permessi
   `whatsapp_business_messaging` + `whatsapp_business_management`.
4. Generate Token > 60-day o never expire (preferisci never expire,
   rotabile manualmente).
5. Copia il token in `WHATSAPP_ACCESS_TOKEN` su Fly secrets.

## Step 5 — App secret (per signature verify)

1. App > Settings > Basic > **App Secret** > Show.
2. Copia il valore in `WHATSAPP_APP_SECRET` su Fly secrets +
   `.env.local`.

L'App Secret e' la chiave HMAC con cui Meta firma il body dei webhook.
Premura verifica HMAC SHA-256 su ogni POST. Se Meta cambia App Secret
(rotazione manuale dal portal), va aggiornato anche su Fly.

## Step 6 — Migrazione numero Business reale (a fine milestone 7a.1)

Quando webhook + signature verify sono verdi su staging con test
number, switch al numero Business esistente di Andrea:

1. WABA > Phone Numbers > Add Phone Number.
2. Inserisci il numero esistente di Andrea (E.164: `+39 ...`).
3. Verifica ownership: Meta manda codice via SMS o voice call.
   Andrea inserisce il codice.
4. Imposta display name (es. "La Goccia di S.Gennaro") — questo e'
   cio' che vede l'ospite nei propri contatti WA.
5. Una volta migrato, copia il nuovo Phone Number ID in
   `WHATSAPP_PHONE_NUMBER_ID` su Fly secrets (sostituisce quello del
   test number). Riavvio app non necessario se Fly fa rolling restart
   automatico al cambio secret.

**Importante:** Andrea perde l'uso WA Business app (non personale)
sul numero migrato. Le chat history pre-migrazione si perdono lato
Meta — non e' un problema perche' il numero e' stato confermato
"fuori uso" e non serve preservare history.

## Env vars riassuntivi

```bash
# Da .env.example, valori reali su Fly secrets / .env.local.
# NON committare i valori.
WHATSAPP_PHONE_NUMBER_ID=          # Step 2 (sandbox) o Step 6 (reale)
WHATSAPP_ACCESS_TOKEN=             # Step 4 (system user, never expire)
WHATSAPP_WEBHOOK_VERIFY_TOKEN=     # Step 3 (random 32+ char)
WHATSAPP_APP_SECRET=               # Step 5 (App Settings > Basic)
```

## Smoke test post-setup

1. Da Meta dashboard > WhatsApp > API Setup, click "Send test message"
   verso il numero verificato di Andrea.
2. Verifica che `apps/api` logghi `whatsapp webhook event received
   (signature OK, persistence pending)`.
3. Se signature fallisce, Premura risponde 401 e logga
   `whatsapp signature mismatch`. Probabile causa: APP_SECRET sbagliato
   in env.
4. Andrea risponde dal suo telefono al test number. Stesso log atteso.

## Quote e costi (riferimento)

- Test number: 0 EUR / mese, max 5 destinatari verificati.
- Numero migrato Business + service conversation tier (luglio 2025):
  ~0,004 EUR / conversazione service (24h dall'ultimo messaggio
  ospite). Premura usa principalmente service tier (ospite scrive per
  primo). Stima pilot 30 ospiti/mese * 1-2 conversazioni: <0,30 EUR/mese.
- Marketing tier (template proattivo prima del primo contatto ospite):
  ~0,067 EUR. Non usato in slice 7a.

## Riferimenti

- `docs/SLICE7-RESEARCH-MESSAGE-SOURCES.md` §3.I — strategia opzione I.
- `apps/api/src/api/webhooks/whatsapp.ts` — implementazione plugin.
- `apps/api/src/api/webhooks/whatsapp-signature.ts` — HMAC verify puro.
- `apps/api/tests/whatsapp-signature.test.ts` + `whatsapp-webhook.test.ts`
  — coverage signature + challenge + happy/sad path.
- Meta Cloud API docs: https://developers.facebook.com/docs/whatsapp/cloud-api
- Meta webhook security: https://developers.facebook.com/docs/graph-api/webhooks/getting-started#event-notifications
