# ROADMAP — Premura

> Piano di sviluppo realistico, settimana per settimana.
> Versione 2 — 22 aprile 2026 (MVP esteso da 6 a 8 settimane per
> integrare Conversation Agent e Onboarding conversazionale).
>
> Subordinato a `CONTEXT.md` (cosa) e `architecture.md` (come).

---

## Principi della roadmap

1. **Validare sempre con realtà.** Ogni fase si chiude con un test su dati veri.
2. **Niente BigBang launch.** Si parte con 1 ospite reale, poi 5, poi 20, poi 100.
3. **Il codice non è il prodotto.** Il prodotto vive in casa dell'ospite.
4. **Tempo realistico: 8 settimane a MVP** con Andrea part-time.

---

## Fase 0 — Fondamenta (FATTO)

✅ Repository clonato e allineato al brand Premura
✅ Prototipo visuale `demo/premura-prototype.html` navigabile
✅ CONTEXT.md v2, architecture.md v2, ROADMAP.md v2 in repo
✅ File obsoleti GiftTube puliti
✅ Descrizione repo GitHub aggiornata

---

## Fase 1 — Infrastruttura (settimana 1)

**Obiettivo:** tutto lo scaffolding tecnico pronto per il codice di business.

### Milestone 1.1 — Setup servizi esterni

- [ ] Creare Supabase project `premura-dev`
- [ ] Registrare dominio (`.it`, `.app`, o `.io` — da decidere al volo)
- [ ] Email inbox forwarding: `inbox@premura.<tld>`
- [ ] **Richiedere WhatsApp Business Cloud API (Meta)** — URGENTE, approvazione 5-10 giorni
- [ ] Account Stripe attivato con 3 Price objects
- [ ] Account Fly.io, Anthropic API, Vercel (probabilmente già attivi)

### Milestone 1.2 — Scaffolding codice

- [ ] Migrazione `src/` corrente da solo Fastify a monorepo:
  - `apps/api` (Fastify backend)
  - `apps/web` (Next.js 15 App Router)
  - `packages/db` (Drizzle schema + Supabase client)
  - `packages/agents` (5 agenti modulari)
  - `packages/integrations` (Stripe, WhatsApp, Amazon, Glovo, email parser)
- [ ] Drizzle schema completo (v1 + tabelle v2)
- [ ] Migration iniziale su Supabase dev
- [ ] Seed dati: 1 host (Andrea), 3 strutture, 1 cleaner (Karen), 3 partner locali Napoli
- [ ] Dockerfile + `fly.toml` per backend
- [ ] Deploy Fly staging

### Milestone 1.3 — Frontend base

- [ ] Next.js app creata
- [ ] Design system: colori, font, componenti dal prototipo in Tailwind config
- [ ] Layout base con sidebar navigation
- [ ] Auth flow: magic link + Google OAuth funzionante
- [ ] Deploy Vercel staging

**Test chiusura fase:** login funzionante su staging, DB popolato, health check backend verde.

---

## Fase 2 — Ingestione prenotazioni (settimana 2)

**Obiettivo:** le prenotazioni di Andrea entrano automaticamente nel sistema.

### Milestone 2.1 — iCal polling
- [ ] Parser iCal
- [ ] Job BullMQ schedulato ogni 15 min
- [ ] Upsert `bookings` con dedup per UID
- [ ] UI settings: 2 campi iCal per struttura
- [ ] Video tutorial 30s: come trovare link iCal
- [ ] Feedback visivo post-paste

### Milestone 2.2 — Email forwarding opzionale
- [ ] Endpoint `POST /email/inbound` (Mailgun o Postmark)
- [ ] Parser email Booking + Airbnb
- [ ] Enrichment `bookings` con dati email

### Milestone 2a.3 — Connetti Gmail (OAuth + parser email)
**Obiettivo:** l'host collega Gmail; Premura legge automaticamente le
email Airbnb degli ultimi 90 giorni e popola `bookings` + `guest_profiles`.

- [x] **Fase 1**: OAuth Google end-to-end. Schema `google_tokens`
  cifrato AES-256-GCM, JWT state CSRF, pagina `/connect-gmail` con
  copy etico (4 sezioni: cosa leggiamo / cosa non possiamo / come te
  ne accorgi / cosa ti mostrerà Google), success + error pages.
  Branch: `feat/google-oauth-m2a3` — 27/27 test verdi.
- [x] **Fase 2**: Gmail backfill 90gg + parser email Airbnb con Claude
  Sonnet 4.6. Migration 0003 (bookings esteso, guest_profiles
  host-scoped, gmail_sync_jobs). Lib: gmail-client, airbnb-email-parser
  (tool_use forzato + Zod), property-matcher (fuzzy Dice + boost),
  repositories (idempotenti), gmail-sync-orchestrator (3 stati job +
  error_log). API `/api/gmail/sync` (POST 202 jobId) +
  `/api/gmail/sync/status` (polling 1.5s). UI:
  `<GmailSyncProgress />` su `/connect-gmail/success` con progress bar
  + summary "Trovate N prenotazioni, M ospiti registrati". 61 unit +
  1 integration testcontainer.
- [ ] **Fase 3** 🔄 (WIP): Booking event ingestor. Strategia diversa
  dalla Fase 2: zero AI, classifier deterministico via regex sul subject
  delle email da `noreply@booking.com` (le email sono intenzionalmente
  data-poor, vedi `docs/KNOWN-LIMITS.md` §9). Le email Booking vengono
  usate solo come EVENT TRIGGERS (new_booking / cancellation /
  modification) cross-referenziati con bookings creati via iCal. Schema:
  nuova tabella `booking_email_events` (audit trail) + 4 counter su
  `gmail_sync_jobs`. Branch:
  `feat/booking-event-ingestor-m2a3-fase3`.
- [ ] Fase 4: refresh automatico access_token, dashboard "email lette",
  trigger sync periodico.

### Milestone 2a.4 — Survey post-booking opt-in (placeholder)

Cattura telefono, allergie e frequenza contatto via survey opt-in
inviata all'ospite dopo la prenotazione. Compensa il gap dati delle
email Booking (vedi M2a.3 Fase 3 / KNOWN-LIMITS §9).

### Milestone 2.3 — Dashboard home 3-stati
- [ ] Home "Sta lavorando per te"
- [ ] Lista prossimi ospiti con badge stato
- [ ] Dettaglio ospite base (replica prototipo)

**Test chiusura fase:** Andrea incolla iCal Booking + Airbnb delle sue 3 strutture, vede tutte le prenotazioni future.

---

## Fase 3 — Agente Guest DNA + Onboarding (settimana 3)

**Obiettivo:** Guest DNA funzionante + onboarding conversazionale struttura.

### Milestone 3.1 — Guest DNA agent
- [ ] Prompt Guest DNA in `packages/agents/guest-dna.ts`
- [ ] Tool `web_search_guest_public_data` con cache
- [ ] Output validato Zod, persistenza `guest_profiles`
- [ ] Trigger: ogni booking nuovo → job `generate_guest_dna`
- [ ] Observability: costo per chiamata loggato

### Milestone 3.2 — Onboarding Agent NUOVO v2
- [ ] Prompt Onboarding Guide in `packages/agents/onboarding.ts`
- [ ] UI chat interface (no form) per prima setup
- [ ] Flusso conversazione 15-20 min guidato
- [ ] Output: `property_knowledge_base` strutturato
- [ ] Voice profile via 3-4 domande + opzionale analisi messaggi passati
- [ ] Autopilot defaults proposti (matrice delega)

### Milestone 3.3 — UI dettaglio ospite
- [ ] Pagina dettaglio ospite con Guest DNA visibile
- [ ] 3 rischi previsti con mitigation
- [ ] Bottone "rigenera Guest DNA"

**Test chiusura fase:** Andrea fa onboarding conversazionale per La Goccia, profilo struttura compilato, voice profile estratto, Guest DNA generato per prossima prenotazione.

---

## Fase 4 — WhatsApp + Conversation Agent (settimana 4-5)

**Obiettivo:** messaggistica bidirezionale funzionante.

### Milestone 4.1 — Setup WhatsApp Cloud
- [ ] Webhook ricezione WhatsApp
- [ ] Template messaggi approvati da Meta (almeno 3)
- [ ] Rate limit handling

### Milestone 4.2 — Message Writer (outbound programmato)
- [ ] Prompt Message Writer in `packages/agents/message-writer.ts`
- [ ] Varianti per ogni stage (Contatto, Presenza, Chiusura)
- [ ] Lingua determinata da Guest DNA
- [ ] Firma con nome struttura

### Milestone 4.3 — Conversation Agent NUOVO v2
- [ ] Prompt Conversation Agent in `packages/agents/conversation.ts`
- [ ] Classifier intent per messaggio inbound
- [ ] Context builder (DNA + property_kb + voice_profile + matrix)
- [ ] Engine decisione auto/draft/escalate
- [ ] Invio automatico se auto
- [ ] Creazione `pending_draft` se draft
- [ ] Alert host con contesto se escalate
- [ ] UI lato host: "Approva risposta" 1-tap per draft
- [ ] Pannello Autopilot (matrice delega visuale)

### Milestone 4.4 — Quiz pre-arrivo
- [ ] Quiz dinamico 4 domande generato da Guest DNA
- [ ] Landing page Tinder-style in Next.js
- [ ] Submit → update Guest DNA

### Milestone 4.5 — Comunicazione cleaner
- [ ] Template brief cleaner
- [ ] Ricezione foto kit via webhook WhatsApp
- [ ] Conferma automatica "€2 registrati"

**Test chiusura fase:** Andrea simula ospite, invia messaggi di vario tipo (info wifi, richiesta late checkout, lamentela). Premura risponde auto sui casi verdi, manda draft sui casi gialli, escala sui casi rossi.

---

## Fase 5 — Composizione kit + logistica (settimana 6)

**Obiettivo:** dato un Guest DNA, genera ordine Amazon reale.

### Milestone 5.1 — Kit Composer
- [ ] Catalogo prodotti in DB (~50 SKU Amazon + 15 partner locali Napoli)
- [ ] Prompt Kit Composer con vincoli
- [ ] Output validato Zod
- [ ] UI preview admin (non host — anti-disintermediazione)

### Milestone 5.2 — Amazon 1-click + Partner locali
- [ ] URL Amazon pre-popolato
- [ ] Notifica WhatsApp host per conferma 1-tap
- [ ] Template ordine WhatsApp a partner locali
- [ ] Conferma partner manuale

### Milestone 5.3 — Email parsing Booking/Airbnb
- [ ] Parser email Booking per catturare messaggi inbound fallback
- [ ] Parser email Airbnb per catturare messaggi inbound fallback
- [ ] Routing verso Conversation Agent

**Test chiusura fase:** un ospite reale riceve kit fisico in casa, vede foto mattina, risponde a messaggi, Premura gestisce tutto correttamente.

---

## Fase 6 — Billing + pagamento cleaner (settimana 7)

**Obiettivo:** monetizzazione funzionante.

### Milestone 6.1 — Stripe Subscriptions
- [ ] Checkout page con trial 30gg senza carta
- [ ] Cambio tier automatico su add/remove struttura
- [ ] Customer Portal per gestione fatture
- [ ] Webhook Stripe

### Milestone 6.2 — Stripe Connect payout cleaner
- [ ] Onboarding cleaner Connect (Express)
- [ ] Tracking `pending_payouts` per ogni kit
- [ ] Job mensile: cumulo e trasferimento
- [ ] Notifica WhatsApp cleaner

### Milestone 6.3 — Validazione pagamento 2 path
- [ ] Path 1: foto cleaner → pending immediato
- [ ] Path 2: fallback conferma ospite entro 24h
- [ ] Rating qualità cleaner automatico

**Test chiusura fase:** Andrea sottoscrive trial, usa Premura 30 giorni reali, paga a fine trial. Karen riceve primo payout.

---

## Fase 7 — Pilot 3 strutture Napoli (settimana 8-11)

**Obiettivo:** Premura gira su 3 strutture Andrea per 30 giorni reali.

### Cosa succede
- Andrea usa Premura come unico modo di gestire ospiti
- Karen è la cleaner pilota
- 3 partner locali Napoli attivi
- Tutti i 20-30 ospiti di 30 giorni vengono pilotati

### Metriche da tracciare
- % kit consegnati in tempo
- % ospiti che rispondono al quiz
- % messaggi inbound risposti automaticamente vs draft vs escalate
- Tempo medio risposta conversation agent
- Δ rating medio recensioni vs baseline
- Problemi intercettati da Premura prima delle recensioni
- Costi reali per ospite processato

### Goal: validazione economica + operativa

Se dopo 30 giorni:
- ✅ Rating medio +0.5 vs baseline
- ✅ Karen non si lamenta
- ✅ Zero disastri
- ✅ Costi <€15/mese per struttura Andrea
- ✅ Conversation agent risponde correttamente >90% dei casi auto

Allora passiamo alla Fase 8.

---

## Fase 8 — Early access (mesi 3-4)

**Obiettivo:** aprire a 20-50 host del network Andrea.

### Azioni
- [ ] Landing page pubblica Premura con waitlist
- [ ] Video demo 3 min (screen record Andrea)
- [ ] Outreach manuale 50 host del network
- [ ] Onboarding 1:1 con prime 5-10 persone
- [ ] Raccolta feedback sistematica

### Milestone tecniche emergenti
- Gestione multi-cleaner per host con più strutture
- UI settings più avanzata
- Bug fix edge case veri
- Miglioramenti prompt in base a dati reali
- Booking Partner API (se arriva approvazione)
- Possibile integrazione Glovo/InPost se richiesto

### Metriche successo
- 20+ host attivi a fine mese 4
- Churn <10% mese 1→2
- NPS >50
- MRR €150-200

---

## Fase 9 — Public launch (mese 5+)

**Obiettivo:** aprire a tutti.

### Azioni
- [ ] Rimozione waitlist
- [ ] SEO base: blog, case study Andrea
- [ ] Presenza gruppi Facebook host italiani
- [ ] Partnership 1-2 micro-influencer host
- [ ] Eventuale lancio in altre città

### Milestone post-launch
- [ ] Integrazione Cortilia (se food artigianale in crescita)
- [ ] App React Native (se user feedback la chiede)
- [ ] Analytics avanzate per host
- [ ] Multi-property dashboard migliorato

### Target 6 mesi post-launch
- 200-500 host paganti
- MRR €2k-4k
- Margine 65-70% (coerente con architecture.md v2.1)
- Break-even mese 10-12 dal lancio

---

## Fasi future (senza date)

### Fase 10+ — Espansione
- Multi-città: Milano, Roma, Firenze, Venezia
- Multi-lingua UI (inglese per host stranieri con case in Italia)
- API pubblica
- White label per agenzie property management piccole

### Fase 11+ — Prodotti collegati
- Premura Plus: assicurazione danni ospite
- Premura Fornitori: marketplace B2B per host
- Premura Insights: dataset anonimizzato per OTA/brand

---

## Cosa NON è roadmap

- **Niente fundraising nei primi 12 mesi.** Bootstrap con revenue.
- **Niente feature per 1 host.** Pattern minimo 5 host.
- **Niente pivoting facile.** Livello 1 deciso. Se non funziona, si chiude.
- **Niente over-engineering.** Risolvere manuale fino a 10° occorrenza.

---

_Ultimo aggiornamento: 27 aprile 2026 — Andrea Chiacchio, fondatore_
_v2.1: M2a.3 Fase 3 (Booking event ingestor) WIP, M2a.4 placeholder_
_v2: MVP esteso 6→8 settimane, Fase 3.2 Onboarding Agent, Fase 4.3 Conversation Agent_
