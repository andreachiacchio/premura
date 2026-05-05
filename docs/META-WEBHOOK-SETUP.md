# Meta WhatsApp Cloud API — Setup & Deploy slice 7a.1

> **Stato:** procedura operativa per Andrea + me.
> **Sostituisce:** `SLICE7A-WHATSAPP-SETUP.md` (consolidato qui).
> **Riferimenti:** `docs/SLICE7-RESEARCH-MESSAGE-SOURCES.md` §3.I (opzione I,
> bootstrap pilot Andrea su numero Business esistente).

Questo documento copre l'intero flusso da zero a smoke test produzione
verde su `+39 351 451 2070`. E' diviso in 7 step sequenziali.

| Step | Chi | Cosa | Tempo |
|------|-----|------|-------|
| 1. Crea app Meta | Andrea | Meta Developer Portal | 5 min |
| 2. Test number sandbox | Andrea | Aggiunge il proprio cell come destinatario verificato | 3 min |
| 3. Raccoglie i 6 valori | Andrea | App ID, App Secret, Phone Number ID, WABA ID, Access Token 24h, genera Verify Token | 10 min |
| 4. Fly secrets + deploy staging | Claude | `flyctl secrets set` + `flyctl deploy` | 5 min |
| 5. Webhook config Meta | Andrea | Incolla URL + Verify token, click Verify and Save | 2 min |
| 6. Smoke test test number | Andrea + Claude | Send test message + verifica DB | 5 min |
| 7. Migrazione +39 351 451 2070 | Andrea + Claude | Migra numero da WA Business app a Cloud API | 15 min |

---

## Step 1 — Crea app Meta

Link: https://developers.facebook.com/apps

1. **Create App** in alto a destra.
2. Tipo: **Business** (NON "Consumer").
3. Display name: `Premura WA Pilot`. Email: la tua. Click **Create app**.
4. Sei nella dashboard dell'app. **In alto a destra dell'header c'e'
   l'App ID numerico.** ← **valore META_APP_ID**

## Step 2 — Aggiungi prodotto WhatsApp + test number

1. Sulla dashboard, sezione "Add products to your app", trova
   **WhatsApp** > **Set up**.
2. Meta crea automaticamente:
   - una **WhatsApp Business Account (WABA) di test**
   - un **test phone number sandbox** (numero +1... USA, gratuito, max 5
     destinatari verificati)
3. Vieni reindirizzato a **WhatsApp > API Setup**.

Su questa pagina sono visibili:
- **From: Phone number ID** ← **valore META_PHONE_NUMBER_ID** (sandbox; lo
  cambieremo in step 7 con il numero reale)
- **WhatsApp Business Account ID** ← **valore META_WABA_ID**
- **Temporary access token** (stringa `EAAxxxxxx...`, scade in 24h) ←
  **valore META_ACCESS_TOKEN**

Aggiungi il tuo cellulare personale come destinatario verificato:
sezione **To**, click **Manage phone number list**, inserisci numero,
ricevi codice via SMS, conferma.

## Step 3 — Raccoglie i 2 valori restanti

### App Secret (per signature HMAC)

1. Sidebar sinistra: **App settings > Basic**.
2. Sezione "App Secret", click **Show**, inserisci password Facebook.
3. Copia. ← **valore META_APP_SECRET**

### Verify Token (random generato da te)

```bash
openssl rand -hex 32
```

Salva il valore. ← **valore META_VERIFY_TOKEN**.
Lo userai in step 4 (Fly) e step 5 (Meta Portal): deve combaciare.

### Riepilogo i 6 valori

```
META_APP_ID         = (Step 1, App ID numerico in header)
META_APP_SECRET     = (Step 3, App settings > Basic > App Secret)
META_PHONE_NUMBER_ID = (Step 2, "From: Phone number ID" sandbox)
META_WABA_ID        = (Step 2, "WhatsApp Business Account ID")
META_ACCESS_TOKEN   = (Step 2, Temporary access token EAA..., 24h)
META_VERIFY_TOKEN   = (Step 3, output di openssl rand -hex 32)
```

Quando li hai tutti, mandameli in messaggio. Io eseguo step 4 (Fly).

---

## Step 4 — Fly secrets + deploy staging (Claude)

### 4a. Resume staging machine se SUSPENDED

```bash
flyctl status -a premura-api-staging
# Se "suspended", riavvia:
flyctl machine start -a premura-api-staging
```

Verifica health:
```bash
curl -i https://premura-api-staging.fly.dev/health
# Atteso: 200 con { status: "ok", version, timestamp }
```

Verifica queue health (Redis connection):
```bash
curl -i https://premura-api-staging.fly.dev/health/jobs
# Atteso: 200 con { queue: "ical-poll", counts: {...} }
```

Se l'una o l'altra danno 5xx / timeout: investiga prima di settare i
secrets. Tipiche cause post-suspended:
- DB connection scaduta -> Supabase pool ha kickato la VM, restart
  risolve.
- Redis URL invalidato -> verifica `flyctl secrets list -a
  premura-api-staging` includa `REDIS_URL` valorizzato.

### 4b. Setta i 6 META_* secrets

Una sola riga, sostituisci i valori reali:

```bash
flyctl secrets set \
  META_APP_ID="VALUE" \
  META_APP_SECRET="VALUE" \
  META_PHONE_NUMBER_ID="VALUE" \
  META_WABA_ID="VALUE" \
  META_ACCESS_TOKEN="VALUE" \
  META_VERIFY_TOKEN="VALUE" \
  -a premura-api-staging
```

Fly fa rolling restart automatico. Attendi 30-60s che la VM riparta
con i nuovi env. Verifica dal log:

```bash
flyctl logs -a premura-api-staging
```

### 4c. Deploy l'ultima versione del codice

Se il branch slice-7a-1 e' gia' mergiato in main, Fly e' allineato.
Se ancora in PR draft, deploy esplicito:

```bash
flyctl deploy --config apps/api/fly.toml --dockerfile apps/api/Dockerfile -a premura-api-staging
```

Verifica health post-deploy:
```bash
curl -i https://premura-api-staging.fly.dev/health
```

### 4d. Smoke endpoint (no signature, atteso 401)

```bash
curl -i -X POST https://premura-api-staging.fly.dev/webhooks/whatsapp \
  -H "Content-Type: application/json" \
  -d '{"object":"whatsapp_business_account","entry":[]}'
# Atteso: 401 { error: "invalid_signature" } perche' niente X-Hub-Signature-256.
```

Se ricevi 404: il route non e' registrato, controlla deploy.
Se ricevi 500 `not_configured`: secret non popolato, ricontrolla 4b.
Se ricevi 401: route OK, signature verify funziona.

---

## Step 5 — Webhook config Meta (Andrea)

1. Meta Developer Portal -> WhatsApp -> **Configuration** -> Webhook ->
   **Edit**.
2. **Callback URL:**
   ```
   https://premura-api-staging.fly.dev/webhooks/whatsapp
   ```
3. **Verify token:** incolla il valore di `META_VERIFY_TOKEN` che hai
   generato in step 3 (deve combaciare con quello su Fly).
4. Click **Verify and Save**. Meta fa GET con
   `?hub.mode=subscribe&hub.verify_token=<token>&hub.challenge=<random>`.
   Se Premura e' deployata correttamente:
   - Risposta 200 + challenge in plain text.
   - Meta mostra checkmark verde "Webhook OK".
   Log atteso lato Premura (cerca con `flyctl logs -a premura-api-staging`):
   ```
   "event":"wa.challenge.ok","challengeLen":N
   ```
5. Sezione **Webhook fields** -> click **Subscribe** su
   **messages**. (Niente altri field per slice 7a.1.)

Se ricevi errore "The callback URL or verify token couldn't be
validated":
- Verifica `META_VERIFY_TOKEN` su Fly = valore Meta Portal (paste exact).
- Verifica `flyctl logs` per vedere se la GET arriva. Se non arriva, e'
  problema network (check status fly.io). Se arriva con
  `wa.challenge.mismatch`, e' problema token.

---

## Step 6 — Smoke test test number sandbox

### 6a. Send test message dal portale Meta

Meta Portal -> WhatsApp -> API Setup -> Sezione **Send and receive
messages**. Invia "Hello world" template al tuo numero verificato.

Apri WhatsApp sul telefono, ricevi il messaggio. Rispondi con un testo
qualsiasi (es. "ciao").

### 6b. Verifica row in DB Supabase staging

Premura logga (cerca con `flyctl logs -a premura-api-staging`):
```
"event":"wa.signature.ok","bodyBytes":N
"event":"wa.persist.orphan","messageId":"wamid...","fromMasked":"39******XX"
"event":"wa.batch.done","inserted":0,"orphans":1,"total":1
```

Orphan e' atteso: il numero non matcha nessun `bookings.guest_phone`
in DB (e' il numero personale di Andrea, non un ospite).

Verifica via Supabase Studio (staging project, SQL editor):
```sql
SELECT id, channel, direction, from_entity, body, sent_at, metadata
FROM messages
WHERE channel = 'whatsapp'
ORDER BY created_at DESC
LIMIT 5;
```

Atteso: 1 riga con `direction = 'inbound'`, `from_entity = 'guest'`,
`body = 'ciao'`, `metadata.orphan = true`.

### 6c. Smoke test idempotenza

Rispondi di nuovo con lo stesso testo. Atteso: nuova row (Meta genera
un wamid diverso ogni messaggio). Se invece Meta ritrasmette la stessa
notifica per qualche ragione (network glitch retry), atteso log:
```
"event":"wa.persist.duplicate","messageId":"wamid..."
```

---

## Step 7 — Migrazione +39 351 451 2070 (Andrea + Claude)

> Si esegue **dopo** che step 6 e' passato verde. Numero Business attuale
> di Andrea, non personale, fuori uso. Migrabile senza eSIM secondaria
> ne' export chat.

### 7a. Aggiungi il numero alla WABA

Meta Portal -> WhatsApp Manager (link "Manage WhatsApp accounts")
-> seleziona la WABA test creata in step 2 -> **Phone Numbers** -> **Add
phone number**.

1. Inserisci il numero in formato E.164: `+39 351 451 2070`.
2. **Display name:** `La Goccia di S.Gennaro` (questo appare
   nei contatti dell'ospite).
3. **Category:** Travel & Lodging.
4. **Verification method:** SMS (preferito).

Meta manda codice SMS a quel numero. **Andrea deve:**
- Avere accesso fisico al SIM/dispositivo del numero, oppure
- Avere accesso all'app WA Business loggata su quel numero (se SIM non
  attivo, l'SMS viene mostrato in-app).

Inserisci il codice. Numero "verified" = check verde.

### 7b. Display name approval (eventuale)

Meta puo' richiedere display name approval (1-72h) se il nome
"La Goccia di S.Gennaro" suona ambiguo. Status visibile in WA Manager
-> Phone numbers. Mentre e' "pending review" il numero funziona ma
il display name appare al pubblico come "La Goccia... (Pending)".

### 7c. Swap secret su Fly al nuovo Phone Number ID

Il nuovo phone number ha un nuovo `Phone Number ID`. Andrea me lo
comunica, io eseguo:

```bash
flyctl secrets set META_PHONE_NUMBER_ID="NEW_VALUE" -a premura-api-staging
```

Fly restart automatico. Verifica health.

### 7d. Smoke test produzione

Andrea, dal suo personale, manda un messaggio WA al numero
+39 351 451 2070.

Atteso lato Premura (`flyctl logs`):
```
"event":"wa.signature.ok"
"event":"wa.persist.inserted" o "wa.persist.orphan" (a seconda se c'e'
                                                     un booking matchato
                                                     in finestra)
"event":"wa.batch.done","inserted":1
```

Atteso lato Supabase Studio:
```sql
SELECT m.id, m.body, m.from_entity, m.metadata, c.id AS conv_id, b.id AS booking_id
FROM messages m
LEFT JOIN conversations c ON c.id = m.conversation_id
LEFT JOIN bookings b ON b.id = m.booking_id
WHERE m.channel = 'whatsapp'
ORDER BY m.created_at DESC
LIMIT 5;
```

Se Andrea ha una prenotazione attiva sul SIM/account dei numero che
manda il messaggio, atteso: `booking_id` valorizzato + `conv_id`
valorizzato. Altrimenti orphan.

### 7e. Chiusura 7a.1

Quando step 7d e' verde:
- Aggiorna `docs/KNOWN-LIMITS.md` §1 con quote effettive misurate.
- Merge PR #25 su main.
- Apri 7a.2 (Gmail message-event parser).

---

## Troubleshooting

### Webhook GET 403 dal browser/curl manuali

Atteso. Il challenge handshake Meta richiede esattamente
`?hub.mode=subscribe&hub.verify_token=<EXACT>&hub.challenge=<X>` con
token combaciante. Browser/curl con altri parametri torna 403.

### Webhook POST 401 a smoke test sintetico

Atteso se non firmi il body con HMAC. Per smoke sintetico vero, calcola
HMAC localmente:

```bash
APP_SECRET="il-tuo-app-secret"
BODY='{"object":"whatsapp_business_account","entry":[]}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$APP_SECRET" -binary | xxd -p -c 256)
curl -i -X POST https://premura-api-staging.fly.dev/webhooks/whatsapp \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature-256: sha256=$SIG" \
  -d "$BODY"
# Atteso: 200 { received: true, persisted: 0 }
```

### Meta logs lato dashboard

Meta Developer Portal -> WhatsApp -> Configuration -> Webhook ->
**Recent activity**. Mostra ultime 10 chiamate, status code, body
(redacted lato Meta). Utile per vedere se il problema e' lato Meta o
lato Premura.

### `flyctl logs` filtri utili

```bash
# Solo eventi WhatsApp
flyctl logs -a premura-api-staging | grep '"event":"wa.'

# Solo errori
flyctl logs -a premura-api-staging | grep '"level":50'

# Solo persistenza
flyctl logs -a premura-api-staging | grep wa.persist
```

---

## Riferimenti

- Meta Cloud API docs:
  https://developers.facebook.com/docs/whatsapp/cloud-api
- Meta webhook security:
  https://developers.facebook.com/docs/graph-api/webhooks/getting-started#event-notifications
- `apps/api/src/api/webhooks/whatsapp.ts` — plugin Fastify.
- `apps/api/src/api/webhooks/whatsapp-signature.ts` — HMAC verify puro.
- `apps/api/src/api/webhooks/whatsapp-payload.ts` — Zod schema +
  extract.
- `apps/api/src/api/webhooks/whatsapp-persist.ts` — lookup booking +
  conversation + insert message.
- `docs/SLICE7-RESEARCH-MESSAGE-SOURCES.md` §3.I — strategia opzione I.
- `docs/KNOWN-LIMITS.md` §1 — buco Airbnb inbox + WA opt-in.
