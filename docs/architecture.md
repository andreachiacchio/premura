# ARCHITECTURE — Premura

> Documento tecnico di riferimento per il progetto.
> Versione 2 — 22 aprile 2026 (include Conversation Agent, profilo
> struttura, voice profile host, matrice delega).
>
> Subordinato a `CONTEXT.md` (prodotto).
> Questo file dice "come lo facciamo".

---

## 1. Stack tecnologico

| Layer | Tecnologia | Perché |
|-------|------------|--------|
| Database + Auth + Storage | **Supabase** | Postgres puro, auth integrata, storage foto, realtime. Un servizio per 4 ruoli. |
| Backend | **Node.js + Fastify** su **Fly.io** | Macchine persistenti per webhook in tempo reale, region Milano. |
| Job scheduler | **BullMQ + Redis** (Upstash) | Pre-empt, mid-stay, recovery sono job schedulati. |
| Modello AI | **Claude Sonnet 4.6** via Anthropic API | Qualità multilingua + tool use + conversazioni contestuali lunghe. |
| Frontend | **Next.js 15** (App Router) su **Vercel** | PWA mobile-first, TypeScript end-to-end. |
| Pagamenti | **Stripe** Subscriptions + Connect + Customer Portal | Trial 30gg, 3 tier, payout cleaner. |
| Messaggistica outbound | **WhatsApp Business Cloud API** (Meta) + Twilio SMS fallback | Canale primario. |
| Messaggistica inbound | **WhatsApp webhook** + **Booking Partner API** + **Airbnb email parsing** | Conversation capability. |
| Calendario ingestione | **iCal polling** + **email forwarding** opzionale | Onboarding 30s. |
| Osservabilità | **Sentry** + **Axiom** | Errori + log strutturati. |

---

## 2. Architettura ad alto livello

```
┌─────────────────────────────────────────────────────────────────┐
│                         HOST (browser/PWA)                       │
│                     Next.js dashboard Premura                    │
│                  "STA LAVORANDO PER TE" + 3 stati                │
│              + Approva Draft + Pannello Autopilot                │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                ┌─────────────▼──────────────────────────────────┐
                │         SUPABASE                                │
                │  - hosts, properties, bookings                  │
                │  - guest_profiles (Guest DNA)                   │
                │  - property_knowledge_base (profilo struttura)  │
                │  - host_voice_profiles (tono host)              │
                │  - autopilot_rules (matrice delega)             │
                │  - kits, deliveries                             │
                │  - conversations, messages (inbound + outbound) │
                │  - agent_actions (audit log)                    │
                │  - cleaners, payouts                            │
                │  - storage: foto kit, foto voice samples        │
                └─────────────┬──────────────────────────────────┘
                              │
              ┌───────────────┴────────────────┐
              │                                │
      ┌───────▼────────┐             ┌─────────▼──────────┐
      │  PREMURA API   │             │ NEXT.JS FRONTEND   │
      │  (Fastify, Fly)│             │  (Vercel)          │
      │                │             └────────────────────┘
      │  - webhooks IN │
      │  - orchestrator│
      │  - scheduler   │
      │  - conversation│
      │    agent       │
      └──┬──┬──┬──┬────┘
         │  │  │  │
         │  │  │  └───────────────────────┐
         │  │  └──────────────────┐       │
         │  └────────────────┐    │       │
         │                   │    │       │
   ┌─────▼──────┐    ┌───────▼──┐ │  ┌────▼─────┐
   │ CLAUDE API │    │WhatsApp  │ │  │ STRIPE   │
   │ Sonnet 4.6 │    │Cloud API │ │  │ subs +   │
   │            │    │          │ │  │ connect  │
   │ 5 agents:  │    │- ospite  │ │  └──────────┘
   │ - dna      │    │- cleaner │ │
   │ - kit      │    │- host    │ │  ┌──────────────┐
   │ - message  │    │  alert   │ │  │ Booking API  │
   │ - convo    │    └──────────┘ │  │ + Airbnb via │
   │ - onboard  │                 │  │ email parser │
   └────────────┘                 │  └──────────────┘
                                  │
                  ┌───────────────▼────────────────┐
                  │ Fornitori kit:                 │
                  │ Amazon 1-click / Glovo / WA    │
                  │ partner locali Napoli          │
                  └────────────────────────────────┘
```

---

## 3. Moduli agente (5 in totale)

### Agent 1 — Guest DNA
Genera profilo ospite da OSINT + pattern + quiz.
Input: prenotazione. Output: JSON strutturato in `guest_profiles`.
Tempo medio: 8s. Costo medio: €0.03.

### Agent 2 — Kit Composer
Compone kit fisico in base a Guest DNA + budget host + profilo struttura.
Tempo medio: 5s. Costo medio: €0.02.

### Agent 3 — Message Writer (outbound programmato)
Scrive messaggi per le 5 fasi programmate (pre-arrivo, quiz, kit reveal,
mid-stay, recovery).
Tempo medio: 3s. Costo medio: €0.01 a messaggio.

### Agent 4 — Conversation Agent (inbound reattivo) NUOVO v2
Il cuore della capacità conversazionale. Ogni messaggio che l'ospite
invia su qualsiasi canale viene processato da questo agente.

**Input context (composto runtime):**
- Il messaggio appena ricevuto
- Storico ultimi 20 messaggi della conversazione
- Guest DNA dell'ospite
- Profilo struttura completo (`property_knowledge_base`)
- Voice profile dell'host (`host_voice_profiles`)
- Matrice delega dell'host (`autopilot_rules`)
- Ora del giorno, stato prenotazione (pre-arrivo/in-stay/post-checkout)

**Processo:**
1. **Classifica** il tipo di messaggio (info-request / service-request /
   complaint / small-talk / emergency / altro)
2. **Cerca risposta** nel profilo struttura o ragiona
3. **Controlla matrice delega** per quel tipo
4. **Decide azione**:
   - Auto → scrive e invia risposta via canale di ricezione
   - Draft → scrive risposta, la salva come pending, notifica host
   - Escalate → manda alert a host con contesto + suggerimento
5. **Logga tutto** in `agent_actions` + `messages`

**Tempo medio:** 4-6s. **Costo medio:** €0.04 a messaggio inbound.

**Throughput stimato:** 3-8 messaggi inbound per ospite per soggiorno medio.

### Agent 5 — Onboarding Guide NUOVO v2
Guida l'host alla compilazione del profilo struttura via chat conversazionale.
Non un form, una conversazione di 15-20 minuti.

**Processo:**
1. Host appena registrato viene accolto da Premura nella prima sessione
2. Agent chiede domande su: arrivo, check-in, wifi, elettrodomestici,
   quartiere, emergenze, regole casa
3. Dopo ogni risposta, struttura l'informazione in formato JSON
4. Finita la conversazione, genera `property_knowledge_base` completo
5. Chiede voice profile (3-4 domande su tono)
6. Propone autopilot defaults (matrice delega)

**Tempo medio:** 15-20 min di host (non di agent). Costo: ~€0.20 per
onboarding completo.

---

## 4. Schema database (nuove tabelle v2)

```sql
-- ============ NUOVO IN V2 ============

-- Il manuale della struttura
property_knowledge_base (
  id uuid PK,
  property_id uuid FK properties UNIQUE,

  arrival_instructions text,
  parking jsonb,
  check_in jsonb,
  check_out jsonb,

  wifi jsonb,                       -- SSID, password (cifrata)
  heating_ac jsonb,
  appliances jsonb,
  entertainment jsonb,

  waste_disposal jsonb,
  emergencies jsonb,

  neighborhood jsonb,               -- restaurants, cafes, supermarket, ...

  house_rules jsonb,
  extras jsonb,

  completeness_score integer,
  last_updated_at timestamp,
  updated_by_host boolean
)

-- Voice profile dell'host
host_voice_profiles (
  id uuid PK,
  host_id uuid FK hosts UNIQUE,

  formality enum(tu, lei, misto),
  emoji_usage enum(never, sparse, frequent),
  emoji_examples text[],
  signature_style text,
  avg_message_length enum(short, medium, long),
  tone_keywords text[],

  sample_messages_analyzed integer,
  extracted_patterns jsonb,
  example_greetings text[],
  example_closings text[],

  last_updated_at timestamp
)

-- Matrice delega (autopilot)
autopilot_rules (
  id uuid PK,
  host_id uuid FK hosts,

  request_type enum(
    info_wifi, info_parking, info_checkin, info_neighborhood,
    early_checkin_short, early_checkin_long,
    late_checkout_short, late_checkout_long,
    discount_request, extra_services,
    complaint_item_broken, complaint_serious,
    emergency, small_talk, tourist_info
  ),

  mode enum(auto, draft, escalate),

  limit_minutes integer,
  limit_amount_eur numeric,
  custom_response_template text,

  UNIQUE (host_id, request_type)
)

-- Conversazioni
conversations (
  id uuid PK,
  booking_id uuid FK bookings,
  channel enum(whatsapp, booking_inbox, airbnb_inbox, email),
  external_thread_id text,
  status enum(active, closed),
  last_message_at timestamp,
  created_at timestamp
)

-- ============ MODIFICATO IN V2 ============

messages (
  id uuid PK,
  booking_id uuid FK bookings,
  conversation_id uuid FK conversations,
  channel enum(whatsapp, booking_inbox, airbnb_inbox, email, sms),
  direction enum(inbound, outbound),
  from_entity enum(premura, host, cleaner, guest),
  to_entity enum(premura, host, cleaner, guest),
  body text,
  language text,
  sent_at timestamp,

  intent_classification text,
  decision_mode enum(auto, draft, escalate, n/a),
  draft_approved_by_host boolean,
  response_latency_ms integer,

  metadata jsonb
)

-- Draft in attesa di approvazione
pending_drafts (
  id uuid PK,
  message_id uuid FK messages,
  booking_id uuid FK bookings,
  host_id uuid FK hosts,

  draft_response text,
  reasoning text,
  suggested_action text,

  status enum(pending, approved, rejected, modified, expired),
  expires_at timestamp,
  approved_at timestamp,
  final_response_sent text
)
```

---

## 5. Flusso Conversation Agent nel dettaglio

```
1. Ospite scrive "Where can we park?" su WhatsApp
         ↓
2. Webhook WhatsApp Cloud API riceve messaggio
         ↓
3. Premura API salva inbound in messages (direction=inbound)
         ↓
4. Dispatch job "process_inbound_message" a BullMQ
         ↓
5. Worker carica context:
   - messaggio + 20 msg prima
   - guest_profiles per questa booking
   - property_knowledge_base per questa property
   - host_voice_profiles per questo host
   - autopilot_rules per questo host
         ↓
6. Chiamata Claude Conversation Agent con prompt:
   "Sei Premura, concierge virtuale che risponde come l'host.
    Contesto: [...]. Classifica, decidi, rispondi."
         ↓
7. Claude restituisce JSON:
   {
     intent: "info_parking",
     response: "Ciao, per il parcheggio ti consiglio il garage
                convenzionato in Via X, 10 euro al giorno...",
     language: "en",
     action: "auto"
   }
         ↓
8. Sistema decide sulla base di autopilot_rules:
   - Se mode=auto → invia direttamente via WhatsApp Cloud API
   - Se mode=draft → crea pending_draft + push notification a host
   - Se mode=escalate → alert a host con context, no invio auto
         ↓
9. Salva outbound in messages se inviato
         ↓
10. Logga in agent_actions tutto il ragionamento
```

**Latenza target:** risposta in <10 secondi da quando ospite scrive, per i
casi auto. Draft pronti in <5 secondi.

---

## 6. Costi operativi rivisti (v2)

### Volumi attesi per ospite

- Agent 1 DNA (1 chiamata): €0.03
- Agent 2 Kit (1 chiamata): €0.02
- Agent 3 Message (5 messaggi programmati): €0.05
- Agent 4 Conversation (8 messaggi inbound medio): €0.32
- Agent 5 Onboarding: solo una volta per host, ammortizzato (€0.20/anno)

**Totale per ospite: ~€0.42** (vs €0.05 stima v1 — 8x più realistico).

### Costi mensili stimati

**Fase MVP (50 host attivi, 10 ospiti/host/mese = 500 ospiti)**

| Servizio | Costo mensile |
|----------|--------------|
| Supabase Free | €0 |
| Fly.io (1 macchina) | €5 |
| Upstash Redis Free | €0 |
| Vercel Hobby | €0 |
| Claude API (500 × €0.42) | €210 |
| WhatsApp Cloud (~4000 conv/mese) | €40 |
| Stripe fees | ~€8 |
| Sentry Free | €0 |
| Dominio + email | €2 |
| **TOTALE** | **~€265/mese** |

**Fase growth (500 host, 5000 ospiti/mese)**

| Servizio | Costo mensile |
|----------|--------------|
| Supabase Pro | €25 |
| Fly.io (2 macchine) | €20 |
| Upstash Redis | €15 |
| Vercel Pro | €20 |
| Claude API (5000 × €0.42) | €2100 |
| WhatsApp Cloud (~40k conv/mese) | €400 |
| Stripe fees | ~€90 |
| Monitoring | €30 |
| **TOTALE** | **~€2700/mese** |

Revenue 500 host × media €8/host = €4000/mese → margine ~30% a regime.

**Nota economica importante**: a 500 host il margine resta positivo ma
stretto. La leva per alzarlo è:
- Ottimizzazione prompt per ridurre token (realistico -30% costi Claude)
- Caching risposte su richieste ripetute stesso property (realistico -20%)
- Meta scontistica volume su WhatsApp (realistico -40% a volumi alti)

Target dopo ottimizzazioni: margine 55-60% a 500 host. Sostenibile.

### Costi primo anno realistici (stima)

Mese 1-3 (MVP, 5-20 host): €50-100/mese
Mese 4-6 (early access, 20-100 host): €200-400/mese
Mese 7-12 (launch, 100-500 host): €500-2700/mese

Break-even realistico: **mese 10-12** con 400+ host paganti.

---

## 7. Onboarding conversazionale (flow Agent 5)

```
1. Host completa signup (email + pwd o Google OAuth)
         ↓
2. Pagina "Benvenuto, iniziamo insieme"
         ↓
3. Chat interface si apre. Premura scrive:
   "Ciao Andrea! Sono Premura. Ti faccio qualche domanda per conoscere
    te e le tue strutture. 15-20 minuti, poi inizio a lavorare.
    Quante strutture gestisci?"
         ↓
4. Host risponde nella chat. Premura aggiorna state in background.
         ↓
5. Per ogni struttura, sequenza di domande strutturate:
   - Nome, indirizzo, link iCal
   - Arrivo
   - Check-in/out
   - Wifi e casa
   - Quartiere (top 5 posti personali)
   - Regole casa
   - Extra
         ↓
6. Dopo primo struttura, Premura chiede voice profile:
   "Ora parliamo di te. Con gli ospiti dai del tu o del lei?"
   "Usi emoji o preferisci messaggi puliti?"
         ↓
7. Premura mostra matrice delega:
   "Queste sono le cose che posso decidere da solo, quelle che ti chiederò,
    e quelle in cui ti avviso e basta. Ti va così?"
         ↓
8. Fine. Premura dice:
   "Perfetto, ora sono pronto. Appena arriva la prima prenotazione, parto."
```

---

## 8. Integrazione canali inbound

### WhatsApp
- Webhook Meta Cloud API (standard setup)
- Template messaggi approvati per outbound proattivo
- Conversational messages (entro 24h da ultimo msg ospite) = free-form

### Booking inbox
- **Booking Partner API** (richiede partnership manageability)
- In assenza di approvazione partnership (tempi 4-8 settimane), fallback
  via email parsing: Booking inoltra ogni messaggio via email, parsiamo

### Airbnb inbox
- **API Airbnb ufficiale** è molto chiusa, probabilmente non disponibile
- **Strategia**: email parsing primario, risposta via canale alternativo
  (WhatsApp se opt-in, oppure alert host che risponde direttamente)

### Priority di implementazione

1. WhatsApp inbound (settimana 4 roadmap) — copre 60-70% conversazioni
2. Booking email parsing (settimana 5) — copre altro 20%
3. Airbnb email parsing (settimana 6) — copre residuo 10-15%
4. Booking Partner API reale (mese 3+) — quando arriva partnership

---

## 9. Schema DB completo

Le tabelle da v1 restano invariate:
- `auth.users`, `hosts`, `properties`, `cleaners`, `bookings`
- `guest_profiles`, `guest_quizzes`, `kits`
- `agent_actions`, `pending_payouts`, `reviews`, `local_partners`

Le tabelle nuove v2:
- `property_knowledge_base`
- `host_voice_profiles`
- `autopilot_rules`
- `conversations`
- `pending_drafts`

`messages` modificata con campi aggiuntivi (vedi § 4).

---

## 10. Sicurezza, privacy, GDPR

Tutto quello di v1 resta valido. Aggiunte v2:

- **Credenziali struttura** (wifi password, codici keybox) cifrate at rest
  con chiave di sistema. Decifrate solo al momento della query nel
  contesto di una conversation agent call.
- **Voice profile dell'host**: non condiviso con altri host, mai usato per
  training model di Anthropic (opt-out abilitato su API).
- **Messaggi inbound ospite**: cifratura a riposo, cancellazione completa
  a richiesta ospite (GDPR right to erasure).

---

## 11. Roadmap tecnica (aggiornamento v2)

Vedi `ROADMAP.md` per dettaglio settimanale. Cambiamenti principali:

- **Fase 4 espansa**: WhatsApp outbound + inbound + Conversation Agent
- **Nuova Fase 4.5**: Profilo struttura + Voice profile + Matrice delega
- **MVP slitta** da 6 → 8 settimane
- **Email parsing Booking/Airbnb** integrato in Fase 5

---

_Ultimo aggiornamento: 22 aprile 2026 — Andrea Chiacchio, fondatore_
_v2: aggiunta Conversation Agent + Onboarding Agent + tabelle nuove + costi rivisti_
