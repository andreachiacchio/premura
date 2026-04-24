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

_Ultimo aggiornamento: 24 aprile 2026 — Andrea Chiacchio, fondatore_
_v2.1: aggiunto §7 rate limit waitlist (milestone 1.3.c)_
