# SLICE 7 — Research: fonte messaggi inbound (Pipeline 1, M3)

> **Stato:** documento decisionale, non implementativo.
> **Data:** 4 maggio 2026.
> **Scope:** decidere DA DOVE Premura ricevera' i messaggi degli ospiti per
> popolare le tabelle `conversations` + `messages` (schema gia' in DB,
> migration `0000`-`0008`).
> **Non scope:** scrittura del codice della pipeline. Quello arriva dopo che
> Andrea sceglie l'opzione vincente.
>
> Questo documento si appoggia su `docs/booking-strategy.md` (vincoli
> verificati 28 apr 2026) e `docs/KNOWN-LIMITS.md` §1 (buco Airbnb inbox).
> Le opzioni gia' dichiarate "fuori scope permanenti" in booking-strategy
> §4.4 sono qui ricapitolate per completezza ma non riaperte.

---

## 1. Riassunto esecutivo

Il traffico messaggi reale di Andrea (80%+ Booking inbox, resto Airbnb,
minoranza WhatsApp via numero nei template auto) rende impossibile
catturare il 100% inbound senza violare ToS o aspettare V2/V3.
Raccomandazione: **ibrido a 3 canali (WA Business webhook + Gmail
notification parser + deflection attiva)**, accettando in V1 che i
messaggi Booking arrivino con body troncato e che la piattaforma resti
canonica per chi non opta-in WhatsApp. Pipeline 1 si chiude in 5-8
giorni, copertura attesa 60-75% del traffico reale al lancio,
crescente con la deflection.

---

## 2. Tabella comparativa opzioni

Legenda colonne ToS / ban risk: 🟢 sicuro, 🟡 zona grigia, 🔴 violazione
esplicita o rischio catastrofico.

| # | Opzione | Copertura | ToS B/A | Ban host | Setup | Run/mese | Tempo (gg) | Fragilita' | GDPR | Scalabilita' |
|---|---------|-----------|---------|----------|-------|----------|------------|------------|------|--------------|
| A | Scraping Playwright headless | 95-100% | 🔴/🔴 | catastrofico | basso | basso | 5-8 | altissima | 🔴 | bassa |
| B | Gmail notification parser | 60-80% Booking, 80-90% Airbnb (testo troncato) | 🟢/🟢 | basso | basso (gia' in DB) | <€5/host | 3-5 | media | 🟡 (consenso Gmail) | alta |
| C | Deflection in-platform → WA | 30-60% post-deflection | 🟡/🟡 (no link diretti) | basso | medio | trascurabile | 4-7 | bassa | 🟢 (opt-in esplicito) | molto alta |
| D | WhatsApp Business API dedicata | 100% di chi e' su WA | 🟢/🟢 | n/a | medio | €0,003-0,08/conv | 5-8 (Meta-pending) | bassa | 🟢 | alta |
| E | Partnership API ufficiale (Booking Connectivity / Airbnb Connect) | 100% | 🟢/🟢 | n/a | altissimo | gratis API, costo audit | 90-180 | bassa | 🟢 | molto alta |
| F | **Ibrido B + C + D (raccomandato)** | **60-75% V1 → 80%+ a 6 mesi** | 🟢/🟢 | basso | medio | <€10/host | **5-8** | media | 🟢 | molto alta |
| G | Browser extension host-installed (V2 candidato) | 90% Booking + 70% Airbnb | 🟡/🟡 (host-side) | basso | alto (Chrome Web Store review) | trascurabile | 15-25 | alta (DOM drift) | 🟢 | media |
| H | Reply-to-notification email (verifica) | 40-60% Airbnb (da testare), 0% Booking | 🟡/n/a | basso | basso | incluso in B | 1-2 (test rapido) | alta | 🟢 | alta |

**Note chiave:**
- A: gia' in `booking-strategy.md` §4.4 come **NO definitivo**. Riportata
  qui per completezza, NON da riconsiderare.
- E: porta chiusa V1. Re-aprire solo a 50+ properties (vedi
  `booking-strategy.md` §2.1).
- G: rimandata a V2 in `booking-strategy.md` §2.4 (decisione esistente).
- H: spike di test, non opzione standalone — feed dell'ibrido F.

---

## 3. Approfondimento per opzione

### A. Scraping Booking + Airbnb dashboard (Playwright headless)

**Cosa:** worker headless con sessione loggata che apre extranet/inbox e
fa scrape DOM dei messaggi.

**Pro teorici:** copertura completa, body messaggi pieno, leggibile
quasi-realtime con polling ogni 1-5 minuti.

**Contro reali:**
- Booking ToS vietano esplicitamente automazione del partner panel
  (`developers.booking.com` + partner help center, citato
  `booking-strategy.md` §1.4-1.5).
- Airbnb ToS analoghi: il termine "Robots, scrapers, and other automated
  means" e' nella Terms of Service §22 (ottobre 2024).
- 2FA aggressivo Booking + IP detection (post breach 13 apr 2026, vedi
  `booking-strategy.md` §1.5): login da Fly.io/AWS = challenge SMS.
- Il rischio e' **on customer behalf**: se Booking detecta scraping,
  sospende l'**account Andrea**, lui perde la listing e il traffic
  Booking. Inaccettabile in B2B.
- Fragilita' tecnica: ogni redesign DOM (Booking ne fa ~ogni 6 mesi)
  rompe lo scraper. Premura passerebbe il 30% del tempo a riparare
  selettori invece di costruire.

**Status:** **NO definitivo** (`booking-strategy.md` §4.4). Documento
tracciato qui solo per non far riproporre l'idea fra 3 mesi.

---

### B. Gmail notification parser (Booking + Airbnb)

**Cosa:** Premura legge la mailbox Gmail dell'host gia' connessa via OAuth
(M2a.3 fase 1-2 fatta), parsa le email di notifica Booking
(`noreply@booking.com`) e Airbnb (`automated@airbnb.com`,
`express@airbnb.com`), estrae il body e lo persiste come `messages`
inbound con `channel = booking_inbox` o `airbnb_inbox`.

**Pro reali:**
- Infrastruttura **gia' esistente**: OAuth Gmail in produzione, token
  cifrati AES-256-GCM, parser email Airbnb Sonnet 4.6 attivo
  (`apps/web/lib/airbnb-email-parser.ts`).
- Zero rischio ban host: leggiamo la sua casella con consenso esplicito.
- Compliance ToS pulita: noi non tocchiamo le piattaforme, leggiamo
  email che le piattaforme stesse mandano all'host.
- Latency: ~1-3 minuti dal momento in cui Booking/Airbnb manda la
  notifica. Accettabile per Conversation Agent (target <10s e' sul
  trigger-to-reply, non sul receive-to-trigger).
- Costo run: gia' a budget (Gmail API gratis fino 1B quota units/giorno,
  parsing Claude Haiku 4.5 ~€0,001/email).

**Contro reali (importanti):**
- **Booking notifiche sono data-poor by design**
  (`booking-strategy.md` §1.3): subject parsabile via regex
  (`Booking.com - Hai un messaggio da [NomeOspite]`), body con
  spesso solo "Hai ricevuto un nuovo messaggio. Apri Extranet per
  leggerlo." Il testo del messaggio NON e' garantito nel body.
  Verifica empirica fatta su 44 email il 27 apr 2026: ~70% solo
  trigger, ~30% con preview troncato a 200-400 char.
- **Airbnb notifiche sono piu' ricche** (per-design Airbnb manda body
  parziale per evitare il bounce extranet), parser AI Sonnet 4.6
  estrae nome ospite + lingua + body fino al troncamento ~500 char.
- Latenza variabile: Gmail Push (Pub/Sub) sarebbe <30s ma costa setup;
  in V1 polling 1-5 min e' sufficiente.
- Privacy GDPR: scope OAuth e' `gmail.readonly`. Copy etico gia' in
  produzione su `/connect-gmail`. Da estendere all'inbox messaggi
  (oggi solo prenotazioni) — ricoperto dallo stesso consenso ma da
  esplicitare nella copy (slice 7a milestone 1).

**Status:** canale fondamentale dell'ibrido. Da estendere il parser
esistente per riconoscere email-message-event (oggi riconosce solo
booking-event).

---

### C. Deflection: spostare conversazione su canale Premura

**Cosa:** all'arrivo di una prenotazione Booking/Airbnb, Premura prepara
un primo messaggio in-platform (su Booking inbox / Airbnb inbox) che
invita l'ospite a continuare la conversazione su WhatsApp con motivazione
concreta ("ti mando la foto del kit la mattina del check-in"). L'invio
del messaggio e' fatto manualmente dall'host via il template auto gia'
configurato in extranet (cosi' come fa Andrea oggi: numero WA nei
template), oppure via host che fa copia-incolla del messaggio
proposto da Premura.

**Pro reali:**
- Sposta il problema: una volta che l'ospite e' su WhatsApp, abbiamo
  body pieno + delivery confirm + read receipts (canale D).
- Andrea **gia' lo fa** in modo grezzo (numero WA nei template auto).
  Premura industrializza la pratica con quiz pre-arrivo CTA + copy
  ottimizzato.
- Compliance: l'host e' lui stesso a inviare il messaggio (template
  proprio) o ad approvarlo. Booking/Airbnb non vietano la condivisione
  del numero WA dell'host all'ospite; vietano il `[link removed]` ai
  domini terzi (e' diverso).
- Conversion rate atteso: 30-60% degli ospiti accetta WA secondo dati
  Hospitable / Hostex (settembre 2024 industry benchmark public). Per
  Andrea su La Goccia il rate empirico e' in linea.

**Contro reali:**
- 40-70% degli ospiti **non** sposta la conversazione: continua su
  Booking/Airbnb. Per quelli, deflection non risolve nulla.
- Booking applica `[link removed]` automatico a URL terzi (verifica:
  `booking-strategy.md` §2.7). Numero WA in formato `+39 333 1234567`
  passa, link `wa.me/...` viene troncato. Da gestire nel copy (numero
  formattato, no link).
- Airbnb stessa cosa: rilevano numeri/link e li bloccano in fase
  pre-check-in (post-conferma e' piu' permissivo).
- Friction prodotto: messaggio inviato per ogni booking = +1 step host
  fino a quando il template auto extranet e' settato. Andrea ce l'ha
  gia', altri host nuovi no.

**Filosofia prodotto:** non e' la "whitelist domain" rifiutata in
`booking-strategy.md` §2.7 — quella era survey link verso domain
Premura, qui e' invito a WA con numero del telefono. Premura **agisce**
(invia da WA) anziche' chiedere all'ospite di compilare un form.

**Status:** canale strategico dell'ibrido. Da costruire come template
WA Business outbound + UI host con preview del messaggio di deflection
proposto (slice 7a milestone 3).

---

### D. WhatsApp Business API con numero dedicato Premura

**Cosa:** Meta Cloud API con numero dedicato (provisioned via Meta
Business Manager). Webhook su `apps/api/src/webhooks/whatsapp.ts`
riceve i messaggi inbound, li persiste su `conversations` +
`messages` con `channel = whatsapp`.

**Pro reali:**
- Stack richiesto da CONTEXT.md §5: WA Business e' canale primario
  con opt-in.
- Body completo, allegati supportati, read receipts, typing indicator.
- Latenza webhook <2s, risposta entro budget Conversation Agent
  (vedi KNOWN-LIMITS.md §3).
- Costi: tier conversazione Meta (luglio 2025): service conversation
  €0,0040, marketing €0,067, utility €0,016. Per Premura tipica
  conversazione = service (ospite ha iniziato), <€0,01/conversazione
  in media.

**Contro reali:**
- Richiesta WA Business approval Meta: 5-10 giorni (gia' in roadmap
  fase 1.1).
- Numero dedicato Premura, non numero personale Andrea — coerente con
  il branding "firmato col nome della struttura": il numero non
  visibile come "Premura", appare salvato come "La Goccia" se
  l'ospite tipo lo aggiunge ai contatti (sfruttando il nome sender
  configurato).
- Decisione aperta: numero per-host vs numero shared Premura. Numero
  per-host (LBA = Local Business Account) richiede onboarding piu'
  lento ma e' piu' fedele al posizionamento. Numero shared scala ma
  rompe l'illusione "parli con l'host umano" se l'ospite ti vede
  con altri host. **Discutere con Andrea (vedi §7).**

**Status:** canale rich-data dell'ibrido. Setup gia' tracciato in
roadmap fase 1.1 + 4.1, qui rivendichiamo solo l'ingestione inbound
(non il flusso outbound che e' fase 4).

---

### E. Partnership API ufficiale (Booking Connectivity Partner / Airbnb Connect)

**Cosa:** Premura diventa Connectivity Partner ufficiale, ottiene
accesso API guest data + messaging API.

**Pro reali:**
- Stessa esperienza Airbnb su entrambi i canali.
- Compliance perfetta, zero rischio ban.
- Audit trail.

**Contro reali:**
- Booking Connectivity API **chiuso a nuovi entranti** al 28 apr 2026
  (`booking-strategy.md` §1.1 + §2.1).
- Quando riapre: ~50+ properties gestite + audit tecnico + 90-180 gg
  onboarding.
- Airbnb Connect: cap analogo (15+ properties), API meno generosa di
  quella Booking ex.
- Costo audit + integrazione: 30-60K€ in tempo dev (stima offline
  Andrea + me, 28 apr 2026).

**Status:** **V2/V3, non V1.** Re-aprire quando Premura ha 50+
properties attive (probabile fine 2026 / 2027).

---

### F. **Ibrido (raccomandato): B + C + D**

**Composizione:**
1. **Canale rich D (WhatsApp Cloud API)** = primary inbound capture
   per ospiti opt-in.
2. **Canale fallback B (Gmail notification parser)** = best-effort
   inbound capture per ospiti che restano su Booking/Airbnb inbox.
   Body troncato accettato come trade-off.
3. **Strategia C (deflection in-platform → WA)** = nudge post-booking
   verso WA per crescere progressivamente la quota di canale rich.

**Distribuzione attesa traffico messaggi (post-slice 7a, La Goccia
baseline):**
- Booking inbox catturato via Gmail (B): 60-70% del traffico, body
  troncato.
- Airbnb inbox catturato via Gmail (B): 80-90% del traffico, body piu'
  ricco.
- WhatsApp catturato via Cloud API (D): 100% di chi opta-in.
- Quota WA cresce nel tempo grazie a deflection (C): da 10% (oggi
  Andrea) a 30-50% atteso a 6 mesi.

**Coverage totale stimato V1 (mese 1): 60-75% messaggi reali con dato
utilizzabile.**
**Coverage totale stimato post-deflection (mese 6): 80%+.**

**Perche' vince:**
- Compliance pulita su tutti e 3 i canali.
- Riusa infrastruttura esistente (Gmail OAuth, parser Airbnb).
- Coerente con CONTEXT.md §5 (WA primario, fallback piattaforme).
- Coerente con `booking-strategy.md` (no scraping, no bypass).
- Estendibile: G (browser extension) e E (Connectivity API) si
  innestano sopra senza rifare.

---

### G. Browser extension host-installed (V2 candidato)

**Cosa:** estensione Chrome installata da Andrea/altri host. Quando
loggati su extranet/airbnb, l'estensione legge il DOM e posta i
messaggi su `/api/extension/inbound` di Premura.

**Pro:** body pieno, no scraping server-side, sessione browser host
quindi compliance host-side ok.

**Contro:** friction onboarding (install + permessi), Chrome Web
Store review 7-14 gg, fragilita' DOM drift.

**Status:** **V2 candidato** (`booking-strategy.md` §2.4). Non
prioritario fino a 5+ host beta che lo richiedono esplicitamente.

---

### H. Reply-to-notification email (spike di verifica)

**Cosa:** verificare empiricamente se rispondere via email alla
notifica Airbnb (`reply-msg-...@airbnb.com`) inserisce davvero il
reply nel thread inbox lato ospite.

**Pro:** se funziona, abbiamo bidirezionalita' email → Airbnb thread
gratis (no API, no extension).

**Contro:** Booking lato non ha reply-to utilizzabile
(`booking-strategy.md` §1.4: alias scaduti, no off-platform).

**Status:** **spike rapido in slice 7a milestone 4** (1-2 gg). Test:
mandare reply via Gmail SMTP all'address reply-msg di una notifica
Airbnb del booking di test, verificare che arrivi nel thread Airbnb
ospite-side. Outcome boolean → se SI, integrato in B come
`messages.direction = outbound` extra channel.

---

## 4. Raccomandazione concreta

**Ibrido F (B + C + D).**

Motivazione condensata:
1. **Onesta'**: nessuna opzione singola copre il 100%. Riconosciamo
   l'asimmetria Booking/Airbnb/WhatsApp e la sfruttiamo invece di
   pretendere parita'.
2. **Compliance**: ogni canale e' pulito ToS-wise. Zero rischio ban
   per Andrea o per host futuri.
3. **Riuso**: ~50% del codice e' gia' scritto (OAuth Gmail, parser
   Airbnb, schema conversations + messages, enum
   `message_channel`).
4. **Crescita**: la deflection (C) sposta progressivamente quota da
   B a D, migliorando la qualita' del dato senza nuovo lavoro
   infrastrutturale.
5. **Nessun debito che blocca V2**: quando arrivera' Connectivity
   Partner (E) o browser extension (G), si aggiungono come canale
   N+1 senza rifare 1-N.

---

## 5. Piano implementativo — Slice 7a (operativo)

**Obiettivo slice 7a:** Pipeline 1 funzionante, messaggi entrano in DB
da WA + Gmail Booking + Gmail Airbnb. Deflection outbound preparata
ma trigger umano (host approva il primo invio).

**Stima totale:** 5-8 giorni dev, distribuiti su 4 milestone.

### Milestone 7a.1 — WhatsApp webhook (canale D inbound)

**Stima:** 2-3 giorni.

- Endpoint `apps/api/src/webhooks/whatsapp.ts` (Fastify) con verifica
  signature `X-Hub-Signature-256`.
- Idempotenza per `platformMessageId` (WA msg id) + dedup
  `conversations.externalThreadId` = WA conversation id.
- Lookup booking via numero WA ospite ↔ `bookings.guestPhone` (gia'
  in schema da M2a.3).
- Se nessun match booking: persisti come "orphan inbound" con
  `bookingId = null` e alert host.
- Persiste `messages` con `channel = whatsapp`, `direction = inbound`,
  `fromEntity = guest`, `toEntity = premura`.
- Test integration testcontainer: simula payload WA, verifica
  upsert + dedup.

**Deliverable:** PR draft "feat: whatsapp inbound webhook (slice 7a.1)".

### Milestone 7a.2 — Gmail message-event parser (canale B inbound)

**Stima:** 2 giorni.

- Estendere `apps/web/lib/booking-event-ingestor.ts` con classifier
  per email tipo "message" (subject regex
  `Booking\.com - Hai (un|ricevuto) (nuovo )?messaggio`).
- Nuovo classifier deterministico email Airbnb tipo "message"
  (`Nuovo messaggio da [Nome]` + variant inglese).
- Body extraction: per Booking accetta truncated text (placeholder
  marker `_truncated = true` in `messages.metadata`); per Airbnb usa
  parser AI Sonnet 4.6 esistente, esteso per estrarre body messaggio
  (non solo dati prenotazione).
- Persiste `conversations` (lookup or insert) + `messages`.
- Integration test su corpus email reali (Andrea ha 44+ esempi
  Booking dal sync M2a.3 fase 3).

**Deliverable:** PR draft "feat: gmail message-event parser (slice
7a.2)".

### Milestone 7a.3 — Deflection outbound preparation (strategia C)

**Stima:** 1-2 giorni.

- Tabella `pending_drafts` (gia' in schema slice 6) usata per draft
  deflection: agente prepara messaggio "Ciao [Nome], se vuoi ti mando
  qui le info pratiche su WhatsApp: +39 XXX XXX XXXX. Buona
  vacanza! — La Goccia".
- UI host: card "Manda saluto WA al nuovo ospite" con preview testo
  + bottone "Copia + apri Booking inbox" (host fa il paste
  manualmente nella sua app/extranet).
- NO automazione invio in-platform in V1. Host clicka 1 tap.
- Tracking: `messages` con `channel = booking_inbox`, `direction =
  outbound`, `fromEntity = host`, `metadata.deflection_attempt =
  true`. Cosi' misuriamo conversion rate WA in slice 8+.

**Deliverable:** PR draft "feat: deflection draft + tracking (slice
7a.3)".

### Milestone 7a.4 — Spike H: verifica reply-to-Airbnb

**Stima:** 1 giorno (timeboxed).

- Test manuale: prendi una notifica Airbnb su Gmail di Andrea, fai
  reply via Gmail web, verifica se l'ospite riceve il reply nel
  thread Airbnb (lato Andrea, non serve account ospite).
- Outcome: documenta in nuova sezione `KNOWN-LIMITS.md` §1.1
  (sostituisce il TODO esistente "verifica empirica reply Airbnb").
- Se SI: aggiungi a roadmap slice 7b come canale outbound Airbnb
  zero-cost.
- Se NO: chiude la verifica, opzione H archiviata.

**Deliverable:** sezione aggiornata `KNOWN-LIMITS.md` con risultato
test.

### Definition of Done slice 7a

- [ ] Webhook WA in produzione, riceve almeno 1 messaggio reale
  (test con numero personale Andrea).
- [ ] Parser Gmail message-event riconosce almeno 5 messaggi reali
  Booking + 5 Airbnb dal corpus storico La Goccia.
- [ ] Deflection draft generato per la prossima prenotazione di
  Andrea, lui clicca "copia" e incolla in Booking inbox.
- [ ] Spike H documentato con outcome SI/NO + screenshot test.
- [ ] Nessuna regressione su sync Gmail bookings esistente
  (167/167 test verdi).
- [ ] KNOWN-LIMITS.md aggiornato con quote di copertura misurate.

---

## 6. Rischi residui e debiti accettati

### Rischio 1: body Booking troncato
**Descrizione:** ~70% dei messaggi Booking arrivano con body solo
trigger, niente contenuto utile per Conversation Agent.
**Mitigazione V1:** flag `metadata._truncated = true` su `messages`,
agente mostra UI host "messaggio Booking ricevuto, apri extranet per
leggerlo + invita ospite su WA".
**Mitigazione V2:** browser extension (G) o Connectivity API (E).

### Rischio 2: latenza Gmail polling 1-5 min
**Descrizione:** ospite scrive su Booking, Premura legge dopo 1-5
minuti. Per ospite "in piedi davanti alla porta che chiede il
codice keybox" e' rotto.
**Mitigazione V1:** caso reale gia' deflectato su WA (numero
keybox e' la prima cosa che si chiede su WA, non Booking).
**Mitigazione V2:** Gmail Push (Cloud Pub/Sub), latenza <30s. Stima
1 giorno setup.

### Rischio 3: deflection non funziona per ospiti riluttanti
**Descrizione:** 40-70% degli ospiti non si sposta su WA, resta su
Booking inbox. Per loro Premura risponde via host (escalation
permanente).
**Mitigazione:** atteso, accettato. Voice profile host usato per
draft response che host approva con 1 tap.
**Debito:** non possiamo rispondere automaticamente a Booking
inbox. Per quegli ospiti, Premura e' "draft permanente".

### Rischio 4: Meta WA Business approval pending
**Descrizione:** Meta puo' rifiutare il numero o richiedere
documentazione (typically 2-7 gg).
**Mitigazione:** richiesta gia' nel piano fase 1.1, partita 1 mag.
Se rifiutata, fallback su Twilio WA programmable (piu' costoso ma
piu' veloce).

### Rischio 5: GDPR scope Gmail allargato
**Descrizione:** oggi consenso copre lettura email per estrarre
prenotazioni. Estenderlo a "leggere messaggi ospiti" allarga il
ambito dato personale processato.
**Mitigazione:** copy `/connect-gmail` aggiornato con sezione
esplicita "leggiamo notifiche di messaggi ospiti per
risponderti", screenshot before/after consenso, audit trail
in `agent_actions`.

### Debito accettato 1: dual write di Booking inbox
Quando Andrea risponde manualmente da Booking app (mobile), il suo
reply non arriva via Gmail (Booking non manda email all'host per
self-actions). Premura non sa che lui ha risposto. Risk: Premura
manda un secondo messaggio ridondante.
**Mitigazione:** dedup time window 30 min su same-thread outbound.

### Debito accettato 2: nessun read receipt Booking/Airbnb
Non sappiamo se l'ospite ha letto il messaggio inbound che gli
abbiamo mandato in-platform. Su WA invece sappiamo (read receipts
attivi). Asimmetria UX accettata.

---

## 7. Domande aperte per Andrea

Cose che servono solo a lui per decidere — non risolvibili da Claude
in una sessione di research.

1. **Numero WhatsApp: per-host o shared Premura?**
   Per-host = Premura provisiona un numero LBA Meta per ogni host
   (es. +39 XXX = "La Goccia di S.Gennaro"). Shared = un numero
   unico Premura (es. +39 YYY = "Premura"). Per-host e' piu'
   coerente col branding "firmato col nome della struttura" ma
   onboarding piu' lento (5-10 gg approvazione Meta per ogni
   numero). Shared e' scalabile ma rompe l'illusione.
   **Proposta default:** per-host. Costo Meta ~€0/mese per numero
   verified, costo provider ~€1/numero/mese se passiamo a 360dialog
   o simile per gestione MM-GLOBAL.

2. **Deflection automatica vs draft host-approved?**
   In slice 7a milestone 3 propongo "host clicka copia + apri
   Booking inbox + paste". Andrea preferirebbe Premura mandi
   automaticamente il messaggio in Booking inbox via Booking
   message templates (legato al suo template auto)? Trade-off:
   piu' automatizzato ma piu' fragile (se Booking blocca il
   numero/link, host non lo sa e ospite non riceve).

3. **Quale e' la conversion rate REALE Booking → WA su La Goccia?**
   Per stimare ROI deflection: di 21 prenotazioni La Goccia
   passate, quante sono passate effettivamente su WA dell'host?
   Andrea ha questo dato? Se SI, sostituisce la mia stima 30-60%
   con numero vero.

4. **Privacy ospite: ok mostrare body messaggio Booking in
   dashboard host?**
   Premura legge il body via Gmail. UI host puo' mostrarlo come
   "messaggio dell'ospite" con timestamp, oppure no per evitare
   espansione del perimetro dati personali. Decisione di Andrea
   (impatta T&C v2 + landing GDPR).

5. **Spike reply-to-Airbnb (milestone 7a.4): chi fa il test?**
   Serve un account Airbnb host attivo + un account ospite suo
   amico per testare. Andrea ha disponibilita' o chiediamo a
   Karen (cleaner) di simulare ospite?

6. **Browser extension (G): vale la pena un mini-spike di
   feasibility ora, anche se non priorita'?**
   2-3 ore per prototipo Chrome Extension che legge DOM
   booking.com inbox e posta su localhost. Solo per validare
   che il DOM e' parsabile (non per spedire). Puo' essere
   utile per V2 planning. Decidere se vale la pena anche
   solo come tech spike.

---

## 8. Riferimenti

- `CONTEXT.md` §5 — canale primario WA + fallback piattaforme.
- `docs/booking-strategy.md` §1.1-1.6 — vincoli verificati 28 apr.
- `docs/booking-strategy.md` §2.2-2.7 — opzioni gia' scartate.
- `docs/booking-strategy.md` §4.4 — fuori scope permanenti.
- `docs/KNOWN-LIMITS.md` §1 — buco Airbnb inbox.
- `docs/KNOWN-LIMITS.md` §3 — latenza Conversation Agent.
- `docs/ROADMAP.md` Fase 4.3 — Conversation Agent NUOVO v2.
- `docs/architecture.md` §1 + §3 — stack messaggistica + 5 agenti.
- `packages/db/src/schema/conversations.ts` — schema esistente.
- `packages/db/src/schema/messages.ts` — schema esistente.
- `packages/db/src/schema/enums.ts` §60-74 — enum
  `messageChannelEnum` + `conversationChannelEnum` gia' include
  whatsapp / booking_inbox / airbnb_inbox / email.

---

**Decisione attesa da Andrea:** scegliere F (raccomandato) o
contropropostare. Quando deciso, rientriamo in sessione Claude Code
e attacco slice 7a milestone 1.
