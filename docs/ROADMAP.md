# ROADMAP — Premura

> Piano di sviluppo realistico, settimana per settimana.
> Versione 2 — 22 aprile 2026 (MVP esteso da 6 a 8 settimane per
> integrare Conversation Agent e Onboarding conversazionale).
>
> Subordinato a `CONTEXT.md` (cosa) e `architecture.md` (come).

---

## Stato fine 29 aprile 2026

- **Pipeline iCal Booking V1**: ATTIVA in staging Fly (`premura-api-staging`), polling automatico ogni 15 min.
- **Prenotazioni in DB**:
  - 16 prenotazioni Airbnb (`data_source=airbnb_email_parsed`)
  - 24 prenotazioni Booking (`data_source=booking_ical_only`)
  - 1 Booking completata (`data_source=booking_manual_filled`)
  - 1 Booking skippata (`host_skipped_completion=true`)
- **Backend M2a.4**: completo (slice 1-4). UI dashboard host completa (slice 5 PR #20+#21). Auth Supabase + RLS in corso (slice 6 fase 3/9, PR #22 draft).
- **Worker iCal**: scaffolding + upsert reale + cron */15 funzionanti. Idempotenza confermata via re-poll.

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

> **DEBITO TECNICO scoperto 28 apr 2026:** worker iCal NON esiste in produzione. Schema `properties.icalSources` esiste solo come seed, nessun codice in `apps/api/` lo legge. Le 16 prenotazioni La Goccia in DB sono entrate via parser email Airbnb (M2a.3 Fase 2), non via iCal.
>
> **Cosa serve costruire:** BullMQ scheduler + node-ical fetcher + parser .ics + upsert idempotente in `apps/api/`.
>
> **Stima refit:** 6-10 ore. Non bloccante per M2a.4 (le prenotazioni entrano via email parser oggi). Da scopare in PR separata.
>
> **Riferimento:** `docs/booking-strategy.md` § 3 Livello base.

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

### Milestone 2a.4 — UI Booking incompleto + form manuale dati guest

**Stato:** backend completo 29 apr 2026 (slice 1-4). UI e auth ancora TODO.
**Stima:** 3-5 giorni dev.
**Riferimento strategico:** `docs/booking-strategy.md` § 3 Livello 3.

**Cosa fa:**
- Schema `bookings.data_source` (5 valori enum) + `host_skipped_completion` + `manual_completion_at`
- Backfill record esistenti
- Helper `isRichDataSource()` per logica condizionale workflow agente AI
- UI dashboard host: badge stato dati + card "Booking incomplete" + modal form 3 campi (nome, telefono, lingua)
- Backend: POST `/api/bookings/:id/complete-manual` + POST `/api/bookings/:id/skip-completion`
- Workflow `on-new-booking` cablato + guard `isRichDataSource`

**Definition of Done:** vedere `docs/m2a4-spec.md` § 7.

**Posizionamento:** M2a.4 NON è "survey post-booking" (decisione superata 28 apr 2026). È UI manuale per host senza channel manager, parte della strategia Booking 4 livelli.

**Slice progress:**

- [x] **Slice 1 (FATTO 29 apr 2026, PR #14)**: schema `bookings.data_source` + `host_skipped_completion` + `manual_completion_at`, indice composito, backfill 16 record La Goccia.
- [x] **Slice 2 (FATTO 29 apr 2026, PR #15)**: Worker iCal scaffolding (BullMQ + ioredis + node-ical), endpoint `/health/jobs`, graceful shutdown.
- [x] **Slice 3.1 (FATTO 29 apr 2026, PR #16)**: ical-event-mapper + booking-upsert-repository (ON CONFLICT DO NOTHING + skip RICH preserve) + redactIcalUrl, helper `isRichDataSource` spostato in `packages/shared`.
- [x] **Slice 3.2 (FATTO 29 apr 2026, PR #17)**: Cron croner pattern `*/15 * * * *`, script CLI `manual-poll`, dynamic import per env caricato prima dei moduli BullMQ.
- [x] **Slice 4 (FATTO 29 apr 2026, PR #18)**: endpoint POST `/api/bookings/:id/complete-manual` + POST `/api/bookings/:id/skip-completion`, workflow guard `isRichDataSource` in `on-new-booking`. 7 nuovi test (108/108 verde). E2E reale verificato su staging Fly.
- [x] **Slice 5 (FATTO 30 apr 2026, PR #20 + polish PR #21)**: UI dashboard host live su `premura.it/dashboard` (guard 404 + ALLOW_DEV_HOST=1 fino a slice 6). Token design Premura, shadcn ui custom, RHF + zod, server actions, 18 test componenti. Polish: filtro temporale `checkin >= oggi-2gg`, header "Prossimi ospiti".
- [ ] **Slice 6 (IN CORSO — fase 3/9, branch `claude/auth-supabase-rls`, PR #22 draft)**: auth Supabase magic link + RLS multi-tenancy
  - [x] Fase 1: helper auth Supabase server-side (`supabase-server.ts`, rewrite `auth.ts` async)
  - [x] Fase 2: migration `0007_enable_rls.sql` (21 ENABLE RLS + 79 CREATE POLICY scoped `auth.uid()`)
  - [x] Fase 3: script `seed-goccia-user.ts` + `MIGRATION-SLICE6.md` deploy procedure
  - [ ] Fase 4: pagine `/login`, `/auth/callback`, `/auth/signout`
  - [ ] Fase 5: middleware protezione `/dashboard/*`
  - [ ] Fase 6: empty onboarding state + form prima property
  - [ ] Fase 6.5: pre-check ownership in server actions (mitigazione buco mutazioni)
  - [x] Fase 7: rimozione `DEV_HOST_ID`, `ALLOW_DEV_HOST`, guard 404 (refactor `connect-gmail` + `/api/gmail/sync` a `getCurrentHostId()`/sessione Supabase, middleware esteso a `/connect-gmail`)
  - [ ] Fase 8: test componenti + middleware
  - [ ] Fase 9: KNOWN-LIMITS finale + body PR #22
  - JWT validation lato Fastify rimandata a slice 6.5 dedicato

### Milestone 2.3 — Dashboard home 3-stati
- [ ] Home "Sta lavorando per te"
- [ ] Lista prossimi ospiti con badge stato
- [ ] Dettaglio ospite base (replica prototipo)

**Test chiusura fase:** Andrea incolla iCal Booking + Airbnb delle sue 3 strutture, vede tutte le prenotazioni future.

---

## Fase 2b — Channel Manager Bridge (post-validation primi host)

Strategia per host che usano già Smoobu / Hostaway / Lodgify: OAuth 1-click → Premura ottiene dati guest completi tramite il channel manager (che a sua volta è Connectivity Partner Booking ufficiale).

### Milestone 2b.1 — Smoobu OAuth bridge

**Priorità:** alta (Smoobu è più diffuso in Italia tra host short-rental).
**Stima:** TBD (ricerca API Smoobu da fare).
**Pre-requisito:** V1 in produzione + 5+ host attivi che usano Smoobu (validation che il path è sensato).

### Milestone 2b.2 — Hostaway OAuth bridge

**Priorità:** media (Hostaway più USA-centric).
**Stima:** TBD.

### Milestone 2b.3 — Lodgify OAuth bridge

**Priorità:** bassa.
**Stima:** TBD.

**Limite architetturale:** un host può avere UN solo channel manager. Se sceglie Premura come bridge, Smoobu non può più gestire Booking. Conflitto da gestire in onboarding M2b.x.

**Riferimento bibbia:** `docs/booking-strategy.md` § 3 Livello 2.

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

## Slice 6.5 — Debts cleanup (5 maggio 2026)

**Stato:** mergiato in main (PR #28).

- [x] **6.5.2** JWT validation Fastify (`apps/api/src/plugins/jwt-auth.ts` + `attachJwtAuth`). Decora `req.user`. Esclude `/health*`, `/webhooks/*`. Env `SUPABASE_JWT_SECRET`.
- [x] **6.5.3** Trigger iCal one-shot su nuova property (`POST /api/properties/:id/ical-poll-now` JWT-protected + hook in `createPropertyAction`). Riduce latenza first-poll da 15min a ~2s.
- [ ] **6.5.1** SMTP Resend per email magic link brandizzata. **In attesa credenziali Andrea** (vedi `docs/SLICE-6-5-DEBTS.md`).

---

## Slice 7a — Pipeline 1 fonte messaggi inbound (5 maggio 2026)

**Stato:** 7a.2 + 7a.3 mergiate in main. 7a.1 (PR #25) in draft, in attesa credenziali Meta per smoke test produzione.

- [x] **7a.2** Gmail message-event parser Booking (trigger-only) + Airbnb (content via Sonnet 4.6). Repository `messages` + `conversations` riusabile cross-channel. Hook in `gmail-sync-orchestrator`. Coverage misurata documentata in `docs/KNOWN-LIMITS.md` §1.
- [x] **7a.3** Deflection draft host-approved. Migration 0009 (`pending_drafts.kind` + `metadata` + `message_id` nullable). Lib + UI card + tracking outbound. Misurabile via `metadata.deflection_attempt`.
- [ ] **7a.1** WhatsApp Cloud API webhook. Signature verify + persistenza DB + structured logging. PR #25 draft. Setup doc completa: `docs/META-WEBHOOK-SETUP.md`. **In attesa credenziali Meta da Andrea.**

---

## Slice 8 — Pipeline 2 + 3: Guest DNA + Audit Agent (5 maggio 2026)

**Stato:** 8.1 + 8.2 mergiate in main.

- [x] **8.1** Guest DNA extractor da messaggi inbound. Migration 0010 (`guest_profiles.message_insights` JSONB + 3 campi nuovi). Sonnet 4.6 con tool_use, vocabolario chiuso 20 topics. Merge incrementale (moving avg, FIFO). Trigger fire-and-forget da `insertInboundMessage`. Cost stimato ~€0.001/msg.
- [x] **8.2** Agent action logger. Migration 0011 (`agent_actions.guest_profile_id` + `message_id` + `human_override`). Decorator `logAgentAction` con `calcCostUsd` (Sonnet/Haiku/Opus) + PII redaction shallow + truncation. Cabling su DNA extractor.
- [ ] **8.1.1** Cabling parser AI Airbnb message (slice 7a.2) e Airbnb confirmation (M2a.3) al logger 8.2 (richiede modifica parser per restituire `usage`).
- [ ] **8.3** Dashboard view `agent_actions` (read-only, top 50, filtro per agent + sort cost).

---

## Slice 9 prep — Onboarding scaffolding multi-host (5 maggio 2026)

**Stato:** scaffolding mergiato.

- [x] Migration 0012 `hosts.onboarding_step` varchar (welcome | property | gmail | whatsapp | completed). Backfill: utenti pre-esistenti marcati `completed`.
- [x] Lib `apps/web/lib/onboarding.ts`: `getOnboardingState`, `setOnboardingStep`, `completeOnboarding`, `urlForStep`, `nextStep`.
- [x] Pagine `/onboarding/{welcome,property,gmail,whatsapp}` + `_components/OnboardingShell` con stepper visivo. Mobile-first palette Premura.
- [x] Server actions: `submitWelcomeAction`, `submitFirstPropertyAction`, `advanceFromGmailAction`, `completeOnboardingAction`, `skipToNextStepAction`.
- [x] Middleware: `/onboarding` aggiunto alle rotte protette.
- [x] Dashboard redirect: se `onboarding_completed=false` → `/onboarding/{step}` (resume capability).
- [ ] Test E2E Playwright full flow signup → onboarding → dashboard (richiede setup E2E, slice 9.1).
- [ ] Step gmail richiama il flow `/connect-gmail` esistente (M2a.3 fase 1) ma non riceve callback diretto: l'host deve cliccare "Ho gia' connesso, vai avanti" manualmente. Refactor con redirect param `?from=onboarding-gmail` in slice 9.1.
- [ ] Step whatsapp e' placeholder informativo (Meta WA Business non ancora self-service per host #2+).

---

## Slice 8.4 — Host voice profiler automatico (5 maggio 2026)

**Stato:** mergiato in main.

- [x] Migration 0013 (host_voice_profiles +9 colonne Modo 2 auto-extraction).
- [x] `packages/agents/voice-profiler.ts` — Sonnet 4.6 + tool_use + Zod, MESSAGE_TOPICS chiuso.
- [x] `packages/agents/voice-profile-merger.ts` — weighted MA decay 0.95, voiceConfidence logaritmica plateau ~50.
- [x] `apps/web/lib/voice-profile-pipeline.ts` — orchestratore fire-and-forget, BATCH_SIZE 5.
- [x] Hook in `markDeflectionSent` (slice 7a.3).
- [ ] Cabling esteso a parser AI Airbnb message + Conversation Agent inbound (slice 8.4.1, richiede worker BullMQ async per webhook WA).
- [ ] **No UI host** (anti-pattern: Premura impara in background, l'host non vede ne' modifica).

---

## Slice 10a — Visual identity foundation (5 maggio 2026)

**Stato:** mergiato in main.

- [x] Design tokens estratti dal prototipo `demo/premura-prototype.html` in `apps/web/app/globals.css` (palette ivory/ink/terracotta/gold, typography Fraunces/Inter, radii, shadow tinted ink, easing).
- [x] Componenti shadcn (`button`, `badge`, `card`, `dialog`, `form`, `input`, `label`) con stile Premura (preesistenti slice 6, allineati).
- [x] Login + auth callback gia' allineati slice 6.
- [x] Onboarding pages refactorate slice 9 prep -> slice 10a: serif headlines, palette tokens, microcopy umano italiano in prima persona Premura ("Mi presento", "Penso io a tutto il resto", "Ti scrivo via email").
- [x] Dashboard **NON toccata**: rimane stile slice 6 fino a slice 10b (sessione futura quando Pipeline 1 ha dati prod).

---

## Slice 12 — Property knowledge ingestion (5 maggio 2026)

**Stato:** mergiato in main.

(Vedi PR slice 12 per dettagli implementazione.)

---

## Debt 6.5.1 — SMTP Resend ready-to-deploy (5 maggio 2026)

**Stato:** codice + doc pronti, **in attesa credenziali Andrea**.

- [x] `apps/web/lib/email-resend.ts` — client wrapper Resend SDK (mock-friendly).
- [x] Template magic link brandizzato (HTML + plaintext, italiano).
- [x] `docs/SLICE-6-5-DEBTS.md` §6.5.1 procedura completa: signup Resend, DNS Vercel SPF + DKIM, verifica dominio, generazione API key, configurazione Supabase Auth SMTP.
- [ ] Andrea: signup Resend + DNS records Vercel + provide `RESEND_API_KEY` su Fly secrets.

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

## V2 e oltre — Riconsiderare quando contesto cambia

### V2 candidato: Booking Connectivity API direct partnership

Quando Premura avrà host base sufficiente (~50+ properties) e Booking riaprirà registrazioni partner, applicare per Connectivity API ufficiale. Sblocca dati guest pieni come Airbnb.

### V2 candidato: Browser extension per dati Booking

Solo se host beta richiedono esplicitamente più funzionalità Booking di quello che V1 offre.

---

## Fuori scope permanenti

Le seguenti idee sono state discusse, valutate e scartate definitivamente il 28 aprile 2026. Vedere `docs/booking-strategy.md` § 4.4 per motivazioni dettagliate. **Non riaprire la discussione senza cambiamento sostanziale di contesto.**

- Scraping extranet via headless browser (ToS violation + ban risk per host)
- Second-user login extranet automatizzato (2FA + IP detection + ban risk)
- Pulse OCR / iOS Shortcuts / reverse-engineering Pulse mobile API
- QR code su biglietto fisico del kit al check-in (rifiutato per ragione prodotto)
- Whitelist domain Premura su template Booking message (rifiutato per ragione prodotto)

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
