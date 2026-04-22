# ARCHITECTURE — Premura

> Documento tecnico di riferimento per il progetto.
> Stack definitivo, flussi operativi, motivazioni delle scelte.
>
> Questo file è subordinato a `CONTEXT.md` (posizionamento + decisioni di prodotto).
> In caso di conflitto sui "cosa fa Premura", vince CONTEXT.md.
> Questo file dice "come lo fa".

---

## 1. Stack tecnologico

| Layer | Tecnologia | Perché |
|-------|------------|--------|
| Database + Auth + Storage | **Supabase** | Postgres puro, auth integrata, storage per foto cleaner, realtime. Un solo servizio copre 4 ruoli. |
| Backend | **Node.js + Fastify** su **Fly.io** | Macchine persistenti per scheduler/webhook, region Milano (latenza bassa IT), stessa piattaforma che Andrea usa già. |
| Job scheduler | **BullMQ + Redis** (Upstash managed) | Pre-empt, mid-stay, recovery sono job schedulati a orari precisi. |
| Modello AI | **Claude Sonnet 4.6** via Anthropic API | Qualità multilingua (NL, DE, EN, IT), tool use affidabile, costo ~€0.05/ospite processato. |
| Frontend | **Next.js 15** (App Router) su **Vercel** | PWA mobile-first, TypeScript end-to-end, condivisione types con backend. |
| Pagamenti | **Stripe** Subscriptions + Connect + Customer Portal | Trial 30gg senza carta, 3 tier pricing, payout cleaner. |
| Messaggistica | **WhatsApp Business Cloud API** (Meta) + fallback **Twilio SMS** | Canale primario per ospite e cleaner. |
| Calendario ingestione | **iCal polling** + **email forwarding** opzionale | Onboarding 30s, no partnership OTA. |
| Osservabilità | **Sentry** (errori) + **Axiom** o **Better Stack** (log) | Alert su fallimenti agent + costi Claude fuori soglia. |

---

## 2. Architettura ad alto livello

```
┌─────────────────────────────────────────────────────────────────┐
│                         HOST (browser/PWA)                       │
│                     Next.js dashboard Premura                    │
│                   "STA LAVORANDO PER TE" + 3 stati               │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              │ Supabase Auth (magic link / Google)
                              │
                ┌─────────────▼──────────────┐
                │   SUPABASE (Postgres + Auth + Storage + Realtime)  │
                │   - hosts, properties, bookings                    │
                │   - guest_profiles (Guest DNA)                     │
                │   - kits, kit_items, deliveries                    │
                │   - messages, agent_actions (audit log)            │
                │   - cleaners, payouts                              │
                │   - storage: foto kit cleaner                      │
                └─────────────┬──────────────┘
                              │
              ┌───────────────┴────────────────┐
              │                                │
      ┌───────▼────────┐             ┌─────────▼──────────┐
      │  PREMURA API   │             │ NEXT.JS FRONTEND   │
      │  (Fastify, Fly)│             │  (Vercel)          │
      │                │             │                    │
      │  - webhooks    │             │  Server Components │
      │  - orchestrator│             │  legge da Supabase │
      │  - worker jobs │             │  chiama API per    │
      └───┬─────┬──────┘             │  azioni mutanti    │
          │     │                    └────────────────────┘
          │     │
          │     └─────────────┬──────────────┬──────────────┬──────────────┐
          │                   │              │              │              │
   ┌──────▼──────┐    ┌───────▼────────┐ ┌───▼────┐  ┌──────▼──────┐  ┌────▼────┐
   │ CLAUDE API  │    │ WhatsApp Cloud │ │ STRIPE │  │ AMAZON +    │  │ iCal    │
   │ Sonnet 4.6  │    │ API (Meta)     │ │        │  │ Glovo +     │  │ feed    │
   │             │    │                │ │ subs + │  │ partner     │  │ (B+A)   │
   │ Guest DNA   │    │ - ospite       │ │ connect│  │ locali WA   │  │         │
   │ Kit compose │    │ - cleaner      │ │        │  │             │  │         │
   │ Messaging   │    │ - host alert   │ │        │  │             │  │         │
   │ Recovery    │    │                │ │        │  │             │  │         │
   └─────────────┘    └────────────────┘ └────────┘  └─────────────┘  └─────────┘
```

---

## 3. Ingestione prenotazioni — iCal + email forwarding

### Canale primario: iCal polling

**Come funziona:**
1. Host in onboarding incolla 2 link (uno Booking, uno Airbnb) nelle settings della struttura
2. Premura salva i link in `properties.ical_booking_url` e `properties.ical_airbnb_url`
3. Job schedulato ogni 15 minuti legge ogni feed iCal attivo
4. Parse `VEVENT` → estrae: UID, DTSTART (check-in), DTEND (check-out), SUMMARY (nome ospite), DESCRIPTION (party size se presente)
5. Upsert in tabella `bookings` con `external_id = UID`, `platform = 'booking' | 'airbnb'`
6. Se prenotazione nuova: trigger job `enrich_booking` → Guest DNA

**Cosa NON dà iCal (limiti noti):**
- Email ospite
- Telefono ospite
- Country code esplicito (a volte nel nome, non sempre)
- Note ospite lasciate in fase booking

**Mitigazione:**
- Nome ospite → Claude OSINT per dedurre nazionalità (accuracy ~80%)
- Email/telefono → raccolti al primo contatto via piattaforma Booking/Airbnb
- Note → email forwarding opzionale per chi le vuole

### Canale secondario opzionale: email forwarding

**Quando attivarlo:** host avanzati che vogliono il 100% dei dati.

**Come funziona:**
1. Premura genera indirizzo unico per host: `inbox+<host_id>@premura.app`
2. Host imposta regola Gmail "forward email da booking.com + airbnb.com a inbox+..."
3. Premura riceve email, parser estrae: email ospite, telefono, country code, note
4. Abbina prenotazione iCal (già in DB) con dati email → enrichment

### Onboarding UI target (30 secondi dichiarati)

```
Schermata "Collega le tue strutture"

1. Nome struttura: [_______]
2. Città: [_______]
3. Collega Booking
   [▶ Guarda come trovare il link 30s]
   Incolla link calendario: [_______]
   ✓ Trovate 12 prenotazioni
4. Collega Airbnb
   [▶ Guarda come trovare il link 30s]
   Incolla link calendario: [_______]
   ✓ Trovate 8 prenotazioni
5. [Salva e continua]
```

---

## 4. Il motore Guest DNA — cuore di Premura

Il Guest DNA è il primo output dell'agente, generato dopo la Fase STUDIO.

### Input disponibili per ogni ospite

1. Da iCal: nome, date, party size (parziale)
2. Da email forwarding (se attivo): email, telefono, country, note
3. Da OSINT pubblico (Claude con tool use):
   - Ricerca LinkedIn pubblica su nome + eventuale tag geografico
   - Recensioni pubbliche su altri Airbnb/Booking (deducibile se profile pubblico)
   - Pattern di prenotazione (lead time booking, durata, party composition)

### Output strutturato (JSON salvato in `guest_profiles`)

```typescript
{
  archetype: string,               // "Coppia olandese prima Italia, turismo lento"
  nationality: string,              // "NL"
  preferred_language: string,       // "nl" (con fallback "en")
  trip_purpose: enum,               // leisure / business / family / romantic
  party_composition: {
    adults: number,
    children_ages: number[],        // [1, 4] = bimba 1 + bimbo 4
    special_needs: string[]
  },
  suggested_tone: enum,             // warm / formal / casual / professional
  predicted_risks: [
    {
      risk: string,                 // "rumore serale in centro storico"
      severity: enum,               // low / medium / high
      mitigation: string            // azione concreta che Premura farà
    }
  ],
  kit_hints: {
    themes: string[],               // "bambini", "local_food", "wine_lover"
    avoid: string[],                // "alcol" (bambini), "glutine" (allergia nota)
    budget_recommendation: number   // se diverso dal default
  },
  recovery_sensitivity: enum        // low / medium / high (quanto probabile che
                                    // lasci recensione negativa per piccolezze)
}
```

### Come si genera (prompt in `src/agents/guest-dna.ts`)

Claude riceve:
- Tutti i dati strutturati disponibili
- Istruzione: "sei analista esperto di ospiti affitti brevi italiani"
- Catalogo di rischi tipici (knowledge base)
- Vincoli: nazionalità note → pattern culturali da considerare (es. olandesi severi su rumore, tedeschi su pulizia, americani su comfort)
- Tool use: Claude può chiamare `web_search_guest_public_data(name, city)` per OSINT

Output: JSON validato con Zod, salvato in `guest_profiles.data` (JSONB).

### Quando si aggiorna

- Prima generazione: appena arriva prenotazione (Fase STUDIO)
- Update dopo quiz: se ospite risponde al micro-quiz in Fase CONTATTO, riesegue generazione con nuovi dati
- Update durante soggiorno: se emerge problema (Fase PRESENZA), il profilo si aggiorna con `actual_behavior` observed

---

## 5. Orchestrazione agente — le 5 fasi automatiche

Premura è un sistema asincrono a eventi. Non c'è un "main loop": ci sono trigger che avviano job.

### Macchina a stati di una prenotazione

```
           nuova prenotazione ricevuta (da iCal o email)
                           │
                           ▼
               [STUDIO] enrich + Guest DNA
                           │
                           ▼
                     T-72h prima check-in
                           │
                           ▼
             [CONTATTO] messaggio WhatsApp + quiz opt-in
                           │
                           ▼
                 ospite risponde al quiz? ───No──→ continua senza quiz
                           │ Sì
                           ▼
               update Guest DNA con risposte
                           │
                           ▼
                     T-48h prima check-in
                           │
                           ▼
           [CURA] compose kit + ordini fornitori
                           │
                           ▼
                 kit assemblato + foto cleaner ricevuta
                           │
                           ▼
                     T-3h prima check-in
                           │
                           ▼
       [CURA part 2] invio foto + msg personalizzato a ospite
                           │
                           ▼
                   ospite check-in fatto
                           │
                           ▼
                T+36h dal check-in (solo se ≥3 notti)
                           │
                           ▼
           [PRESENZA] messaggio "come va?" a ospite
                           │
                           ▼
                 problema rilevato? ───No──→ silenzio
                           │ Sì
                           ▼
              classificazione severità (Claude)
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
           piccolo      medio         grosso
              │            │            │
              ▼            ▼            ▼
         risolve      risolve +      ESCALATION
           solo       notifica te    a te con alert
                                     e suggerimento
                                     azione
                           │
                           ▼
                     T+24h check-out
                           │
                           ▼
              [CHIUSURA] sondaggio privato ospite
                           │
                           ▼
                 feedback ricevuto?
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
         negativo       neutro       positivo
              │            │            │
              ▼            ▼            ▼
        recovery       archivia       nudge
        (sconto +       senza         recensione
         scuse)         rumore         pubblica
```

### Implementazione

- Ogni transizione di stato scrive una riga in `agent_actions` (audit log immutabile)
- BullMQ gestisce i delay T-72h, T-48h, T-3h, T+36h, T+24h
- Se un job fallisce (Claude API down, WhatsApp rate limit) → retry exponential backoff 3 volte, poi alert Sentry

---

## 6. Composizione kit + logistica fulfillment

### Algoritmo composizione

Input:
- Guest DNA (archetipo, lingua, età bambini, preferenze)
- Budget kit host (settato in account, range €3-€20)
- Città struttura
- Data check-in → calcola `lead_time_hours`
- Stagione

Claude riceve prompt "kit composer" + catalogo disponibile + vincoli e restituisce:

```typescript
{
  theme: string,                    // "benvenuto napoletano con bimba"
  items: [
    {
      name: string,
      supplier: enum,               // amazon / partner_local / glovo / cortilia
      supplier_sku: string,
      quantity: number,
      estimated_cost_eur: number,
      fulfillment_channel: enum,
      delivery_address: enum        // cleaner_home / pickup_point / property
    }
  ],
  personal_message: string,         // 200-300 caratteri per WhatsApp ospite
  short_card_greeting: string       // 3-5 parole per biglietto fisico
                                    // es "Benvenuta Anna!"
}
```

### Scelta canale fulfillment (deterministica, non Claude)

```pseudo
per ogni item:
  se item.category == "fresh" E city ha partner locale:
    → WhatsApp automatico al partner
    consegna: casa cleaner nel giorno X

  altrimenti se lead_time < 24h:
    → Glovo API
    consegna: casa cleaner / property direttamente

  altrimenti se lead_time 24-48h:
    → Amazon shopping list 1-click
    consegna: casa cleaner / pickup point InPost

  altrimenti (lead_time > 48h):
    → preferisci partner locale se disponibile
    → altrimenti Amazon
    consegna: casa cleaner
```

### Consegna ai punti ritiro

Opzioni di `delivery_address` configurate per cleaner:
1. **Casa cleaner** (default, se disponibile)
2. **Punto ritiro InPost** (locker h24, codice via WhatsApp)
3. **Tabacchi Amazon Hub** (convenzione italiana)
4. **Indirizzo custom** (es. "sotto portineria struttura")

Cleaner configura 1-2 opzioni. Sistema sceglie la migliore in base a lead time e orari apertura.

---

## 7. Il biglietto personale

### Versione definitiva

**Cartoncino fisico minimalista:**
- Formato A6, pre-stampato con logo struttura
- Stampa offset bulk via Pixartprinting (100 pezzi ~€30, 1000 pezzi ~€80)
- Design: spazio centrale bianco per scrittura manuale
- Consegnati in scatoletta da 100 alla cleaner (durata 3-6 mesi)

**Azione cleaner:** scrive SOLO nome ospite a penna (5 secondi)

### Il messaggio "lungo" va su WhatsApp

**Flusso definitivo:**

1. Cleaner finisce di sistemare kit + biglietto con nome
2. Scatta foto con telefono
3. Invia su WhatsApp a numero Premura
4. Premura OCR/analisi foto: verifica presenza biglietto + layout decoroso
5. Premura genera `personal_message` specifico tramite Claude basato su Guest DNA
6. **T-3h prima check-in**: Premura invia all'ospite:
   - La foto del kit
   - Il messaggio personalizzato (200-300 caratteri)
   - Firma = nome struttura

**Esempio output:**

> 📸 *[foto kit: Falanghina, sfogliatelle, biglietto "Benvenuta Anna!"]*
>
> *"Buongiorno Anna, tutto pronto per il vostro arrivo a La Goccia 🏛️ Ho pensato che dopo il volo un bicchiere di Falanghina fresco potesse farvi piacere. Nel centro storico di Napoli la sera è viva, per questo ci sono i tappi — la vista vale il rumore. Vi aspetto alle 15. — La Goccia di S.Gennaro"*

---

## 8. Pagamento cleaner — logica a 2 validatori

### Regole

```
Pagamento €2 si registra come "dovuto" quando:

PATH 1 — VELOCE (90% casi):
  Cleaner invia foto kit a Premura via WhatsApp
  → Premura registra €2 in pending_payout per quella cleaner
  → Stato kit: "staged"

PATH 2 — FALLBACK automatico (se Path 1 manca):
  T-2h prima check-in: nessuna foto ricevuta
  → Premura manda reminder WhatsApp a cleaner
  → Se arriva foto entro check-in → come Path 1
  → Se ancora nulla → attiva verifica ospite (Path 3)

PATH 3 — VERIFICA OSPITE:
  Al momento del check-in:
  → Premura manda WhatsApp a ospite: "Tutto ok col benvenuto? 🎁"
  → Risposta positiva ospite (sì/emoji positiva/ringraziamento)
    → €2 registrati + rating cleaner +1
  → Risposta negativa ospite (no/manca/problema)
    → NO pagamento + alert immediato a te (host)
    → rating cleaner -5
  → Nessuna risposta ospite entro 24h
    → €2 registrati comunque (presunzione buona fede)
    → rating cleaner neutrale

Payout mensile:
  → Cumulo di tutti i €2 "dovuti" del mese
  → Trasferimento automatico via Stripe Connect a fine mese
  → Cleaner riceve notifica WhatsApp con dettaglio

Rating qualità cleaner:
  → Accumulato su 12 mesi rolling
  → Visibile solo a te (host)
  → Sotto soglia -20 punti totali → alert "valuta se sostituire cleaner"
```

### Implementazione DB

```sql
cleaners (
  id, host_id, name, whatsapp_phone,
  delivery_addresses: jsonb[],  -- casa + punti ritiro
  stripe_connect_account_id,
  quality_score integer DEFAULT 0
)

pending_payouts (
  id, cleaner_id, kit_id, amount_cents,
  status enum(pending, paid, disputed),
  validation_source enum(foto_cleaner, conferma_ospite, fallback_24h),
  created_at, paid_at, dispute_reason text
)
```

---

## 9. Billing host — Stripe con trial generoso

### Configurazione Stripe

**3 Price objects:**
- `price_tier_1` → €9.99/month, usato quando `properties.count == 1`
- `price_tier_2_5` → €7.99/month per struttura, usato quando `2 <= count <= 5`
- `price_tier_6plus` → €5.99/month per struttura, usato quando `count >= 6`

**Subscription iniziale:**
```javascript
stripe.subscriptions.create({
  customer: stripe_customer_id,
  items: [{ price: determine_tier(property_count), quantity: property_count }],
  trial_period_days: 30,
  payment_behavior: 'default_incomplete',
  payment_settings: { save_default_payment_method: 'on_subscription' }
})
```

### Trial (30 giorni senza carta)

- Feature: accesso completo dashboard + agente + messaggi + kit
- **Limite kit durante trial: budget totale €20** (anti-abuso)
- Al 25° giorno: email "ti mancano 5 giorni, vuoi continuare?"
- Al 30° giorno: paywall su nuove azioni agente, dati visibili in sola lettura
- Se inserisce carta: attiva subscription + mantiene tutti i dati

### Cambio numero strutture

Quando host aggiunge/rimuove strutture:
```javascript
stripe.subscriptions.update(sub_id, {
  items: [{ id: item_id, price: new_tier_price, quantity: new_count }],
  proration_behavior: 'create_prorations'
})
```

Stripe calcola il prorata, fattura la differenza nel ciclo successivo.

### Cancellazione

- Cancel = fine billing period (Stripe `cancel_at_period_end: true`)
- Dopo fine period: sola lettura 60 giorni
- Dopo 60 giorni: archivio dati (non cancellazione, per GDPR right-to-access)

---

## 10. Schema database Supabase (tabelle core)

```sql
-- Auth (gestito da Supabase Auth)
auth.users (id, email, ...)

-- Host (1:1 con auth.users)
hosts (
  id uuid PK = auth.users.id,
  stripe_customer_id text,
  subscription_status enum,
  subscription_tier enum(tier_1, tier_2_5, tier_6plus),
  trial_ends_at timestamp,
  created_at, updated_at
)

-- Strutture (N:1 con host)
properties (
  id uuid PK,
  host_id uuid FK hosts,
  name text,                        -- "La Goccia di S.Gennaro"
  city text,
  address text,
  ical_booking_url text,
  ical_airbnb_url text,
  kit_budget_eur numeric(5,2),      -- 3.00 - 20.00
  kit_themes text[],                -- preferenze stilistiche
  cleaner_id uuid FK cleaners,
  active boolean DEFAULT true
)

-- Cleaner
cleaners (
  id uuid PK,
  host_id uuid FK hosts,
  name text,
  whatsapp_phone text,
  delivery_addresses jsonb,          -- [{type: 'home', address: '...'}, ...]
  stripe_connect_account_id text,
  quality_score integer DEFAULT 0
)

-- Prenotazioni
bookings (
  id uuid PK,
  property_id uuid FK properties,
  external_id text,                  -- UID iCal
  platform enum(booking, airbnb, direct),
  guest_name text,
  guest_email text,
  guest_phone text,
  guest_country text,                -- ISO 2 letter
  check_in date,
  check_out date,
  nights integer,
  party_size integer,
  notes text,
  status enum(upcoming, in_stay, completed, cancelled),
  created_at, updated_at
)

-- Guest DNA
guest_profiles (
  id uuid PK,
  booking_id uuid FK bookings UNIQUE,
  data jsonb,                        -- struttura § 4
  generated_at, updated_at
)

-- Quiz ospite
guest_quizzes (
  id uuid PK,
  booking_id uuid FK bookings,
  questions jsonb,
  answers jsonb,
  completed_at
)

-- Kit
kits (
  id uuid PK,
  booking_id uuid FK bookings UNIQUE,
  theme text,
  items jsonb,                       -- array item ordine
  total_cost_cents integer,
  personal_message_whatsapp text,
  short_card_greeting text,
  photo_url text,                    -- foto cleaner
  photo_received_at timestamp,
  status enum(planning, ordered, staged, delivered, failed)
)

-- Messaggi
messages (
  id uuid PK,
  booking_id uuid FK bookings,
  channel enum(whatsapp, booking_inbox, airbnb_inbox, email, sms),
  direction enum(inbound, outbound),
  from_entity enum(premura, host, cleaner, guest),
  to_entity enum(premura, host, cleaner, guest),
  body text,
  language text,
  sent_at timestamp,
  metadata jsonb
)

-- Audit log (immutabile, append only)
agent_actions (
  id uuid PK,
  booking_id uuid FK bookings,
  phase enum(studio, contatto, cura, presenza, chiusura),
  action_type text,                  -- "guest_dna_generated", "kit_composed"
  actor enum(system, claude, host, cleaner, guest),
  details jsonb,
  created_at timestamp
)

-- Pagamenti cleaner
pending_payouts (
  id uuid PK,
  cleaner_id uuid FK cleaners,
  kit_id uuid FK kits,
  amount_cents integer,
  status enum(pending, paid, disputed, cancelled),
  validation_source enum(foto_cleaner, conferma_ospite, fallback_24h, manual),
  created_at, paid_at, paid_via_transfer_id text
)

-- Recensioni ricevute (per metriche)
reviews (
  id uuid PK,
  booking_id uuid FK bookings,
  platform enum(booking, airbnb),
  rating numeric(3,1),               -- 0.0 - 10.0
  text text,
  collected_at
)

-- Partner locali
local_partners (
  id uuid PK,
  name text,
  city text,
  category enum(pastry, wine, flowers, toys, food),
  whatsapp_phone text,
  products_catalog jsonb,
  active boolean
)
```

RLS (Row Level Security) Supabase: ogni tabella ha policy "host può vedere solo dati sue strutture".

---

## 11. Sicurezza, privacy, GDPR

- **PII ospite**: cifratura a riposo (Supabase default AES-256), TLS in transito
- **Dati minori**: se Guest DNA rileva bambini, no OSINT social sul loro nome
- **Diritto oblio**: endpoint API che cancella tutti i dati ospite entro 30 giorni da richiesta
- **Audit log immutabile**: `agent_actions` non editabile nemmeno dall'host
- **Segreti**: mai in repo, tutti in Fly secrets / Vercel env vars
- **Webhook verification**: firma HMAC per webhook Stripe, WhatsApp, Supabase
- **Rate limiting**: Fastify rate-limit plugin per API pubbliche

---

## 12. Costi operativi stimati

### Fase MVP (primi 3 mesi, <50 host)

| Servizio | Costo mensile |
|----------|--------------|
| Supabase Free | €0 |
| Fly.io (1 macchina shared CPU 1GB) | €5 |
| Upstash Redis Free | €0 |
| Vercel Hobby | €0 |
| Claude API (~500 ospiti/mese processati) | €25 |
| WhatsApp Cloud (sotto 1000 msg/mese) | €0 |
| Stripe fees | 1.5% + €0.25 per tx |
| Sentry Free | €0 |
| Dominio | €1 |
| **TOTALE** | **~€35/mese** |

### Fase growth (500 host)

| Servizio | Costo mensile |
|----------|--------------|
| Supabase Pro | €25 |
| Fly.io (2 macchine) | €20 |
| Upstash Redis Pay-as-you-go | €10 |
| Vercel Pro | €20 |
| Claude API (~5000 ospiti/mese) | €250 |
| WhatsApp Cloud (~15k conversazioni) | €150 |
| Stripe fees | ~€90 |
| Monitoring | €25 |
| **TOTALE** | **~€590/mese** |

Revenue 500 host × media €8/host = €4000/mese → margine ~85%.

---

## 13. Deploy e CI/CD

### Ambienti

- **dev**: locale, macchine Mac Andrea, Supabase dev project
- **staging**: Fly app `premura-staging`, Vercel preview deploy, Supabase staging project
- **production**: Fly app `premura-prod`, Vercel main, Supabase prod project

### Pipeline

- Push su `main` → GitHub Actions:
  1. Lint + typecheck + test
  2. Build Next.js + Fastify
  3. Deploy Vercel preview (automatico)
  4. Deploy Fly staging (automatico)
  5. Smoke tests E2E
  6. Deploy Fly prod (manual approval, Andrea clicca)

### Rollback

- Fly: `fly deploy --image <previous_sha>`
- Vercel: 1 click nel dashboard
- Supabase migrations: reversibili, down migration obbligatoria

---

## 14. Cosa NON è in questo documento (rimandato)

- Fase React Native (app mobile nativa): dopo 500 host
- Fase Cortilia partnership: dopo MVP validato
- Fase multi-lingua UI host: l'interfaccia host resta solo italiano fino a lancio internazionale
- Fase analytics avanzate + BI: oggi bastano query ad-hoc Supabase + SQL su metabase self-hosted

---

_Ultimo aggiornamento: 22 aprile 2026 — Andrea Chiacchio, fondatore_
