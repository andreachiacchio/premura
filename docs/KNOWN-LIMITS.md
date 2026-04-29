# KNOWN-LIMITS — Premura

> Limiti architetturali noti al 22 aprile 2026. Da rivedere ad ogni fase
> della ROADMAP e aggiornare quando cambia l'evidenza.

---

## 1. Buco Airbnb inbox

**Problema.** L'API ufficiale di Airbnb è chiusa a chi non è channel manager
certificato. Messaggi inbound arrivano solo via email forwarding (parser
lato nostro). Risposta bidirezionale diretta sul thread Airbnb non è
garantita: o reply via email (da verificare se finisce davvero nel thread)
o via WhatsApp, che richiede opt-in ospite.

**Impatto stimato.** 20-30% delle conversazioni potenziali (ospiti che
arrivano da Airbnb senza opt-in WhatsApp). Per questo slice, Conversation
Agent può solo leggere e classificare, non rispondere in autonomia.
Fallback automatico: escalation all'host, che risponde dal proprio account
Airbnb sul Mac/telefono. Nei fatti, per questi ospiti l'agente lavora in
modalità "draft permanente" invece che auto.

**Mitigazione futura.**
- Verifica empirica se la reply alla notifica email Airbnb finisce nel
  thread (test rapido in Fase 5).
- Rinforzare opt-in WhatsApp dal quiz pre-arrivo ("per ricevere la foto del
  kit la mattina del check-in").
- Partnership Booking Partner API come precedente (se/quando approvata),
  e monitorare se Airbnb apre API inbox in futuro.

---

## 2. Voice profile fragile nei primi ospiti

**Problema.** Modo 2 (analisi 20-30 messaggi passati dell'host) dà voice
profile ricco ma richiede accesso alla history Booking/Airbnb, oggi
limitato dalle stesse API chiuse. Modo 1 (3-4 domande onboarding) dà solo
segnali grossolani: formality, emoji, lunghezza media, firma.

**Impatto stimato.** Per i primi 5-10 ospiti di ogni host nuovo, i
messaggi generati da Premura potrebbero suonare "non esattamente te".
Rischio: host percepisce scollamento e forza tutto a Draft o disattiva
l'autopilot per paranoia. Questo neutralizza il valore percepito del
prodotto nelle prime settimane di utilizzo.

**Mitigazione futura.**
- Feedback loop implicito: ogni volta che l'host riscrive manualmente un
  draft, memorizzare il delta (before/after) e usarlo come segnale
  d'aggiornamento del voice profile.
- UI "incolla 5-10 tuoi messaggi passati" in onboarding per chi non ha
  accesso API.
- Prompt engineering con default "tono neutro caldo italiano" + esempi
  quando il voice profile ha poche features estratte.

---

## 3. Latenza Conversation Agent target <10s

**Problema.** Pipeline attuale pianificata: webhook WhatsApp → BullMQ
queue → worker → 5 query context (DNA + property_kb + voice_profile +
autopilot_rules + history) → Claude Sonnet 4.6 (4-8s tipici su prompt
grossi) → WhatsApp send (1-2s). Budget stretto per stare sotto 10s in
modo consistente.

**Impatto stimato.** In ~20% dei casi il target salta: Claude rallenta,
context si ingrossa con conversazioni lunghe, rete fa fatica. L'ospite
percepisce il ritardo e l'illusione "rispondi come l'host stesso" si
rompe. Per i casi in cui il ritardo supera i 30s, il problema è più grave
(l'ospite nel frattempo ha mandato altri messaggi, o ha chiuso la chat).

**Mitigazione futura.**
- Prompt caching Anthropic sui system prompt + property_knowledge_base
  (riduzione TTFB ~30-50% secondo Anthropic docs).
- Context minimization: ultimi 5-10 messaggi + riassunto generato una
  tantum sui precedenti, invece di 20 messaggi raw ogni volta.
- "Typing indicator" via WhatsApp Cloud API per mascherare attese fino a
  20s senza perdere percezione di reattività.
- Router preliminare con Claude Haiku 4.5 per classificare intent (1-2s),
  poi Sonnet solo per il draft della risposta.
- Budget di latenza per componente misurato in Axiom, alert se p95 > 8s.

---

## 4. Password DB Supabase dev debole

**Problema.** La password del superuser `postgres` del progetto Supabase
dev è stata scelta corta e con pattern comune (data di nascita + simbolo).
Entropia bassa, vulnerabile a dizionari mirati se il connection string
trapelasse da un log / screenshot / Slack.

**Impatto stimato.** Basso oggi (ambiente dev, nessun dato reale, nessuna
esposizione pubblica), alto al lancio (dati ospiti reali, credenziali
fornitori nel property_knowledge_base, GDPR).

**Mitigazione.**
- **Rotazione obbligatoria pre-launch**: generare password 32+ char random
  via password manager, aggiornare `DATABASE_URL` in tutti gli ambienti
  (`.env.local`, Fly.io secrets, Vercel secrets).
- Nel frattempo: DATABASE_URL mai loggata, `.env.local` gitignored,
  service role key usata solo server-side.
- A regime: considerare IAM auth (Supabase supporta JWT-based connection)
  al posto di password statica.

---

## 5. Fly.io → Supabase: Session Pooler obbligato

**Problema.** Fly.io espone egress IPv4 solo con Dedicated IPv4 add-on
($4/mese). In default gratuito, le VM Fly raggiungono Internet IPv4 solo
via shared egress limitato e nativamente via IPv6. Supabase su free/Pro
tier espone la Direct Connection (`db.<project>.supabase.co:5432`) come
**IPv6-only** — vedi il problema analogo incontrato in milestone 1.2.d
dalla sandbox.

**Impatto stimato.** Applicato alle VM Fly di produzione: `pnpm db:push`
runtime + query applicative non raggiungerebbero il DB via Direct URL.
Non bloccante oggi (siamo in staging), ma bloccherà il deploy prod se
non indirizzato prima.

**Mitigazione scelta.**
- **L'app Fly userà il Session Pooler** Supabase
  (`aws-<region>.pooler.supabase.com:5432`, IPv4 disponibile), stessa
  scelta di `.env.local` in dev.
- `DATABASE_URL` in Fly secrets punterà al pooler, non al direct.
- Direct URL resta disponibile per migrations runtime se mai servisse
  lanciarle dalla workstation Mac (IPv6 nativo a casa).

**Migrazione futura.**
- Quando passiamo a Supabase Pro con Dedicated IPv4 add-on (~$4/mese),
  valutare uso del Direct URL per query applicative (niente overhead
  pooler). Il Session Pooler resta adatto per lambda/serverless.

---

## 6. Runtime TypeScript via `tsx` (vs bundler)

**Problema.** I workspace `@premura/*` esportano TS sorgente
(`main: "./src/index.ts"`): Node nativo non può eseguirli senza transpile.
Abbiamo 3 strategie possibili:
- **A.** `tsx` a runtime in produzione (scelta attuale)
- **B.** bundler (tsup/esbuild) che inlina i workspace in un singolo JS
- **C.** ogni package compila a `dist/`, con project references

Scelta A = minima modifica, coerenza dev↔prod. Costo: ~200-400ms cold
start per il transpile iniziale di tsx.

**Impatto stimato.** In staging/pilot Fase 7 con traffico basso e
`auto_stop_machines=true`, l'overhead è mascherato dal cold boot Fly
(~3-5s totali). A scala (post-launch Fase 9) diventa percepibile se le
machines restano idle-stop.

**Migrazione futura a tsup.**
- Giustificata **post-pilot Fase 7** quando avremo metriche reali di
  cold start e volume di richieste.
- Aggiunta devDep `tsup`, config `tsup.config.ts` in `apps/api/`, build
  script che produce `dist/index.js` con workspace deps inlinate.
- Dockerfile perde lo stage runtime+tsx, CMD diventa
  `["node", "dist/index.js"]`.

---

## 7. Rate limit waitlist best-effort (in-memory)

**Problema.** L'endpoint pubblico `POST /api/waitlist` (apps/web) è esposto
senza autenticazione e può essere bersagliato da bot / script. Il rate
limiter corrente è una `Map` in-memory per IP (`apps/web/lib/rate-limit.ts`),
finestra 5 min / max 3 req. Su Vercel serverless ogni istanza ha la propria
Map, quindi un attaccante distribuito o Vercel che autoscale crea istanze
nuove bypassa il limite.

**Impatto stimato.** Basso finché la landing è pre-lancio e non indicizzata
aggressivamente. Il vero limite di abuso è il UNIQUE su `waitlist.email`:
un bot può comunque saturare la tabella con email disposable generate al
volo. Non abbiamo captcha né verifica email, quindi il DB potrebbe
riempirsi di entry rumore che andranno filtrate manualmente prima del
lancio.

**Mitigazione futura.**
- **Upstash Ratelimit** (Redis serverless) come rate limiter condiviso
  cross-istanza. Aggiungerebbe `@upstash/ratelimit` + `@upstash/redis`
  e una env var. Trigger per introdurlo: prima firma di abuso o primo
  picco di traffico virale sulla landing (>500 req/h).
- **Turnstile / hCaptcha** invisibile sul form waitlist, attivato solo
  se il tasso IP supera una soglia sospetta.
- **Email double-opt-in** al primo invio: niente conferma → niente entry
  persistita. Richiede Resend/Postmark setup (rimandato dopo milestone
  Billing 6.1).
- **Cleanup periodico** delle entry "source=direct" senza property_count
  e con email disposable (lista pubblica nota) se accumuliamo rumore.

---

## 8. Sync Gmail sincrono (no worker, no auto-rotate token)

**Problema.** L'endpoint `POST /api/gmail/sync` (M2a.3 Fase 2)
processa email in BACKGROUND nello stesso processo Next.js (fire-and-
forget via `void` promise + `reuseJobId` nell'orchestrator). Niente
BullMQ, niente Fly worker. Tre limitazioni note:

1. **Vercel function timeout**. Su tier Hobby le function hanno
   un timeout duro di 60s. Un sync iniziale tipico è ~50 email × 3-5s
   Claude = 3 minuti, quindi su Vercel Hobby l'orchestrator viene
   killato a metà. Il job resta `status='running'` con
   `processedEmails < totalEmails` e nessun `completedAt`. Su Vercel
   Pro il limite è 300s (settato `maxDuration=300` nella route).
2. **Refresh token Google non auto-ruotato**. `google-auth-library`
   refresha l'access_token in memoria via refresh_token, ma non lo
   persistiamo: se il refresh_token venisse invalidato (revoca utente
   o pulizia Google), il sync fallisce con messaggio chiaro
   ("Ricollegare Gmail") senza retry. L'host deve rifare il flow
   `/connect-gmail`.
3. **Costo Claude non ottimizzato**. Sonnet 4.6 ~$0.016/email,
   ~€3/200 email. Prompt caching attivo sul system prompt (~70%
   saving sui token cached read). Non c'è batching: ogni email è una
   chiamata API distinta. Vedi sopra "Costi attesi" in
   `apps/web/README.md`.

**Impatto stimato.** Pilot Andrea: testa localmente con
`pnpm --filter @premura/web dev` (no timeout). Per i prossimi 5-10
host early access, lo stesso pattern regge in dev locale o Vercel Pro.
A scala (>50 host, >1000 sync/giorno) servirà worker dedicato.

**Mitigazione futura.**
- **M3 worker BullMQ**: orchestrator gira in `apps/api`, route
  `/api/gmail/sync` enqueue + ritorna jobId, frontend polla
  invariato. Migrazione progressiva: schema `gmail_sync_jobs` resta
  identico, cambia solo il "chi" esegue il loop.
- **Refresh token rotation**: persistere il nuovo access_token al
  refresh, e ritentare 1 volta su 401 prima di abortire.
- **Batching Claude**: usare Anthropic Batches API (50% costo) per
  sync ≥50 email. Trade-off: latenza +~1h, ma accettabile per backfill
  iniziale (l'host clicca → Premura promette "ti aggiorniamo entro
  un'ora", invece di progress bar live).

### 8.1 — Hard cap 200 email per sync

`MAX_EMAILS_PER_SYNC=200` in
`apps/web/lib/gmail-sync-orchestrator.ts`. Se `searchAirbnbEmails`
trova più email, processiamo solo le 200 più recenti (Gmail API
ritorna in ordine cronologico inverso) e marchiamo
`gmail_sync_jobs.truncated=true` + nota in `error_log`. L'host può
rilanciare `POST /api/gmail/sync` per processare le rimanenti.

**Perché 200**: ~3-5s per email × 200 = 10-17 min di sync, ~€3 di
costo Claude. Soglia ragionevole per pilot con 1-5 strutture. Per
host >5 strutture (post-M3) il limite andrà alzato o reso
configurabile per-host.

### 8.2 — No retry sul parsing Claude

Ogni chiamata `client.messages.create` ha un timeout 30s
(`REQUEST_TIMEOUT_MS` in `airbnb-email-parser.ts`) via
`AbortController`. Se Claude non risponde in tempo o l'API ritorna
un errore, il parser solleva `AirbnbParserError` → l'orchestrator
appenda al `error_log` con stage='parse' e CONTINUA con la prossima
email. **Nessun retry automatico**: bilancio costi (un retry su
errore Anthropic 5xx duplicherebbe il costo per email problematiche)
+ semplicità. L'host rilancia il sync per ritentare le email
fallite — sono identificate via `raw_email_id` nell'error_log.

### 8.3 — Migration 0003 non idempotente su `guest_profiles` non vuota

`ALTER TABLE guest_profiles ADD COLUMN host_id uuid NOT NULL` (in
migration `0003_early_edwin_jarvis.sql`) **fallisce se la tabella
contiene righe senza `host_id`**. Sul Supabase dev attuale di Andrea
la tabella è vuota (nessun agent ha ancora popolato Guest DNA),
quindi la migration applica clean.

**Pre-requisito per ambienti con dati**: prima di applicare 0003,
`TRUNCATE guest_profiles RESTART IDENTITY CASCADE;` se ci sono
righe legacy. La M2a.4 (Guest DNA agent) sarà responsabile di
ri-popolare la tabella con il nuovo schema host-scoped.

---

---

## 9. Booking email content limitation

**Problema.** Le email da `noreply@booking.com` sono intenzionalmente
data-poor: contengono solo subject + link extranet, nessun dato
strutturato (no nome ospite, no date, no importo, no telefono). È una
scelta progettuale di Booking per forzare l'host a usare l'extranet
proprietario (e quindi non disintermediare).

**Impatto stimato.** Premura usa queste email solo come EVENT TRIGGERS
(new_booking / cancellation / modification), cross-referenziandole con
bookings creati via iCal — la fonte primaria di dati per Booking resta
iCal polling (M2a.1). Il classifier (`apps/web/lib/booking-email-classifier.ts`)
è regex-puro: zero chiamate Anthropic, costo zero per email Booking.

**Mitigazione.** Phone number capture & altri dati ospite Booking sono
fuori scope di Fase 3 — verranno raccolti via survey opt-in post-booking
in **M2a.4** (Survey post-booking opt-in).

---

## 10. Cascade DELETE su `hosts`

**Problema.** Cancellare manualmente una riga in `hosts` triggera CASCADE
su `properties` (FK `properties.host_id` con `onDelete: 'cascade'`) e di
conseguenza su `bookings` (FK `bookings.property_id` con
`onDelete: 'cascade'`). La stessa cascade vale ora per
`booking_email_events` (FK `host_id` con `onDelete: 'cascade'`,
introdotta in M2a.3 Fase 3).

**Impatto.** Per il fix dello stato (es. testing) usare invece
UPDATE/SOFT DELETE. È successo durante M2a.3 Fase 2 (27 apr 2026) e ha
richiesto re-pop iCal completo.

**Mitigazione.** Niente fix di codice: documentare. Per ambienti shared
(staging) considerare in futuro `is_active=false` come "soft delete" al
posto di `DELETE FROM hosts WHERE …`.

---

## 11. Mistero env var Vercel premura-web

`premura-web` su Vercel (account andreachiacchios-projects, plan Hobby)
mostra in UI Settings → Environment Variables solo `DATABASE_URL` come
variabile configurata. Tuttavia, in produzione il deploy funziona
correttamente con accesso a:

- `ANTHROPIC_API_KEY` (parser AI Airbnb chiama Claude API senza errori)
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (OAuth Gmail completa con
  successo)
- `CLAUDE_MODEL_EMAIL_PARSER` (default model selection funziona)
- `SUPABASE_URL` / `SUPABASE_SECRET_KEY` (anche se `DATABASE_URL` è la
  connessione primary)

Ipotesi non verificate:

1. Vercel team-level "Shared Environment Variables" linkate al progetto
   (UI Shared tab era vuoto al check del 27 apr 2026)
2. Build cache fantasma da deploy passati
3. Env var settate via Vercel CLI con scope diversi che non appaiono in
   UI Web

Stato: funziona, non investigare per ora. Da chiarire prima di scalare
il prodotto a più progetti Vercel o se mai migrerà a Pro plan con team
multipli.

---

_Ultimo aggiornamento: 27 aprile 2026 — Andrea Chiacchio, fondatore_
_v2.4: aggiunto §11 mistero env var Vercel premura-web_
_v2.3: aggiunti §9 Booking email data-poor + §10 cascade DELETE su hosts (M2a.3 Fase 3)_
_v2.2: aggiunto §8 sync Gmail sincrono / no auto-rotate (M2a.3 Fase 2)_

---

## §12 — Booking Connectivity API chiusa a nuovi entranti

**Status:** porta chiusa per V1, riconsiderare in V2.

**Verifica:** 28 aprile 2026 lettura developers.booking.com + blog Elfsight 2025. Citazione testuale Booking docs: *"At the moment the platform is not accepting new registrations on the partner portal."*

**Implicazione:** Premura V1 non può ricevere dati guest Booking via API ufficiale. Workaround: vedi docs/booking-strategy.md strategia 4 livelli.

**Riapertura possibile quando:**
- Booking annuncia nuove registrazioni partner
- Premura ha host base sufficiente per applicare (~50+ properties + audit + mesi onboarding)

---

## §13 — iCal Booking espone solo date occupate anonimizzate

**Status:** limite strutturale Booking, non aggirabile.

**Verifica:** 28 aprile 2026 ore 16:35, test reale curl URL iCal La Goccia. Output: BEGIN:VEVENT / SUMMARY: CLOSED - Not available. Niente nome guest, niente codice prenotazione, niente telefono.

**Implicazione:** iCal Booking serve solo per overbooking detection. Non basta per workflow agente AI completo.

**Workaround:** form manuale dashboard host (M2a.4). Vedi docs/m2a4-spec.md.

---

## §14 — Worker iCal Premura (RISOLTO il 29 aprile 2026)

**Status:** RISOLTO il 29 aprile 2026.

**Nota:** Worker iCal implementato in slice 2 (scaffolding) + 3.1 (upsert reale) + 3.2 (cron scheduler). Pipeline E2E verificata su staging Fly: 24 prenotazioni Booking di La Goccia importate da iCal, idempotenza confermata. Vedi PR #14, #15, #16, #17, #18.

**Cosa funziona oggi (al posto di iCal):** parser email Airbnb (M2a.3 Fase 2) + parser email Booking event ingestor (M2a.3 Fase 3). Le 16 prenotazioni La Goccia in DB sono entrate via email parser, non via iCal.

**Cabling target:** apps/api/ deploy premura-api-staging (Fly.io Frankfurt 2 macchine). Worker BullMQ + cron */15 attivo in staging.

---

## §15 — Booking Reply-To noreply, alias guest non utilizzabile off-platform

**Status:** vincolo strutturale Booking, non aggirabile.

**Verifica:** Booking partner help center, articolo "Contacting guests": *"Both you and your guests will only see an anonymous alias ending in @guest.booking.com or @partner.booking.com. Only use Booking.com platforms, the Extranet, and Pulse app to communicate with guests securely."*

**Implicazione:** anche se ottenessimo l'email guest, è alias temporaneo + monitoring Booking + ToS violation se mandiamo email da fuori piattaforma.

**Workaround:** WhatsApp diretto (canale Premura primario), via numero raccolto da form M2a.4.

---

## §16 — Pulse iOS senza API pubblica + senza Shortcuts/Share endpoints

**Status:** porta chiusa, più chiusa dell'extranet web.

**Verifica:** Andrea, 28 aprile 2026, offline (metodologia da documentare in sessione successiva).

**Cosa è stato controllato (sintesi offline):** nessuna API pubblica documentata su developers.booking.com per Pulse, niente Apple Shortcuts esposti da Booking app installata, Daily Activity Widget legge dati ma non accessibili programmaticamente da app terze, 2FA aggressivo blocca emulatori e bot.

**Implicazione:** non c'è scappatoia mobile per dati Booking. Pulse OCR / iOS Shortcuts / reverse-engineering Pulse API sono in docs/booking-strategy.md § 4.4 FUORI SCOPE PERMANENTI.

**TODO:** documentare metodologia verifica Pulse in sessione successiva (cosa è stato testato, cosa è stato trovato sui forum, output di tentativi URL scheme booking://...).

---

## §17 — Endpoint skip-completion: body vuoto richiede curl senza Content-Type

**Status:** edge case scoperto 29 aprile 2026 durante test E2E manuale slice 4.

**Verifica:** chiamata `POST /api/bookings/:id/skip-completion` con `Content-Type: application/json` e body vuoto. Fastify ritorna 400 `FST_ERR_CTP_EMPTY_JSON_BODY`.

**Implicazione:** l'endpoint non vuole body, ma il body parser JSON di Fastify rifiuta richieste con header `Content-Type: application/json` senza payload.

**Mitigazione:** UI dashboard host (slice 5) chiamera l'endpoint senza header `Content-Type` oppure con body `{}`. Per test manuali via curl, omettere `-H "Content-Type: application/json"`.

**Alternative future:** rendere il body opzionale lato schema zod (`.optional()`), oppure cambiare il content-type-parser per accettare body vuoto come `{}`.

---

## §18 — Fly Free tier auto-stop machine

**Status:** vincolo del piano Fly Free, non aggirabile senza upgrade.

**Verifica:** 29 aprile 2026 durante test E2E. Le machine `premura-api-staging` si fermano dopo qualche minuto di inattivita.

**Implicazione:** per test e sviluppo serve `fly machine start <id> -a premura-api-staging` a mano prima di chiamare endpoint o aprire `fly ssh console`.

**Mitigazione:** in produzione vera con traffico continuo non sara un problema (le macchine restano sveglie). In alternativa, passare a piano paid Fly per disabilitare auto-stop.

