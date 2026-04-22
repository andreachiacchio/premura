# ROADMAP — Premura

> Piano di sviluppo realistico, settimana per settimana.
> Dal commit 0 al primo ospite reale pilotato dall'agente.
>
> Scopo: avere sempre visibilità su "a che punto siamo" e "cosa viene dopo".
> Subordinato a `CONTEXT.md` (il cosa) e `ARCHITECTURE.md` (il come).

---

## Principi della roadmap

1. **Validare sempre con realtà.** Ogni fase si chiude con un test su dati veri (tue strutture, ospiti tuoi, cleaner tua).
2. **Niente BigBang launch.** Si parte con 1 ospite reale, poi 5, poi 20, poi 100. Ogni step è occasione per scoprire cosa non funziona.
3. **Il codice non è il prodotto.** Il prodotto è quello che vive in casa dell'ospite. Il codice serve solo a rendere ripetibile quello.
4. **Tempo reale: 3-4 mesi a MVP lanciato**, con Andrea che lavora part-time (lavoro principale + Premura).

---

## Fase 0 — Fondamenta (settimana 0, FATTO)

✅ Repository clonato e allineato al brand Premura
✅ Prototipo visuale `demo/premura-prototype.html` navigabile
✅ CONTEXT.md, README.md, CLAUDE.md aggiornati
✅ File obsoleti GiftTube puliti
✅ ARCHITECTURE.md e ROADMAP.md in repo
✅ Descrizione repo GitHub aggiornata

**Dove siamo:** prototipo visibile, documenti fonte di verità in repo, Claude Code allineato.

---

## Fase 1 — Infrastruttura (settimana 1)

**Obiettivo:** tutto lo scaffolding tecnico pronto per accogliere codice di business.

### Milestone 1.1 — Setup servizi esterni

- [ ] Creare Supabase project `premura-dev`
  - Enable Auth (email + Google OAuth)
  - Setup Storage bucket `kit-photos`
- [ ] Registrare dominio (decidere: `.it`, `.app`, `.io`)
  - Setup DNS base
  - Email inbox per forwarding: `inbox@premura.<tld>`
- [ ] Richiedere WhatsApp Business Cloud API (Meta)
  - ⚠️ **da fare subito**, approvazione richiede 5-10 giorni
  - Dominio + numero dedicato (può essere Andrea's mobile inizialmente)
- [ ] Account Stripe attivato
  - Configurare 3 Price objects (tier 1, 2-5, 6+)
  - Setup Stripe Connect per payout cleaner
- [ ] Account Fly.io, Anthropic API, Vercel (probabilmente già attivi)

### Milestone 1.2 — Scaffolding codice

- [ ] Migrazione `src/` corrente da solo Fastify a monorepo con:
  - `apps/api` (Fastify backend)
  - `apps/web` (Next.js 15 App Router)
  - `packages/db` (Drizzle schema + Supabase client)
  - `packages/agents` (Guest DNA, Kit Composer, Message Writer)
  - `packages/integrations` (Stripe, WhatsApp, Amazon, Glovo)
- [ ] Drizzle schema completo da `ARCHITECTURE.md` § 10
- [ ] Migration iniziale su Supabase dev
- [ ] Seed dati: 1 host (tu), 3 strutture, 1 cleaner (Karen), 3 partner locali Napoli
- [ ] Dockerfile + `fly.toml` per deploy backend
- [ ] Deploy su Fly staging

### Milestone 1.3 — Frontend base

- [ ] Next.js app creata
- [ ] Design system: i colori, font, componenti del prototipo portati in Tailwind config
- [ ] Layout base con sidebar navigation
- [ ] Auth flow: magic link + Google OAuth funzionante
- [ ] Deploy Vercel staging

**Test chiusura fase:** login funzionante su staging, DB popolato, health check backend verde.

---

## Fase 2 — Ingestione prenotazioni (settimana 2)

**Obiettivo:** le prenotazioni di Andrea entrano automaticamente nel sistema.

### Milestone 2.1 — iCal polling

- [ ] Parser iCal (libreria `ical.js` o simile)
- [ ] Job BullMQ schedulato ogni 15 min
- [ ] Upsert `bookings` con dedup per UID
- [ ] UI settings: input 2 campi iCal per struttura
- [ ] Video tutorial 30s: come trovare link iCal Booking + Airbnb
- [ ] Feedback visivo "✓ trovate 12 prenotazioni" dopo paste

### Milestone 2.2 — Email forwarding (opzionale, nice to have)

- [ ] Endpoint `POST /email/inbound` (da servizio come Mailgun o Postmark)
- [ ] Parser email Booking + Airbnb (formati noti)
- [ ] Enrichment `bookings` con dati email

### Milestone 2.3 — Dashboard home 3-stati

- [ ] Home "Sta lavorando per te" con:
  - Lista prossimi ospiti (5-10 upcoming)
  - Badge stato 🟢/🟡/🔴 per ogni ospite
  - Card grande che mostra azione corrente Premura
- [ ] Dettaglio ospite (replica prototipo)

**Test chiusura fase:** Andrea incolla iCal Booking + Airbnb delle sue 3 strutture, vede tutte le prenotazioni future nel dashboard, stato 🟢 ovunque.

---

## Fase 3 — Agente Guest DNA (settimana 3)

**Obiettivo:** per ogni nuova prenotazione, Premura genera Guest DNA automatico.

### Milestone 3.1 — Prompt + tool use

- [ ] Prompt Guest DNA in `packages/agents/guest-dna.ts` (già esistente, verificare e aggiornare)
- [ ] Tool `web_search_guest_public_data` con cache per evitare doppie chiamate
- [ ] Output strutturato validato Zod
- [ ] Persistenza in `guest_profiles`
- [ ] Audit log in `agent_actions`

### Milestone 3.2 — Enrichment automatico

- [ ] Trigger: ogni `booking` nuovo → job `generate_guest_dna`
- [ ] Retry logic su fail Claude API
- [ ] Observability: costo per chiamata loggato in Axiom

### Milestone 3.3 — UI dettaglio ospite

- [ ] Pagina dettaglio ospite mostra:
  - Archetipo ospite
  - Nazionalità + bandiera + lingua preferita
  - 3 rischi previsti con mitigation
  - Composizione famiglia
  - Budget kit suggerito
- [ ] Bottone "rigenera Guest DNA" (per test)

**Test chiusura fase:** per ogni prenotazione futura di Andrea, Premura genera Guest DNA entro 2 minuti. Andrea vede il profilo, conferma se è plausibile.

---

## Fase 4 — Messaggistica ospite + cleaner (settimana 4)

**Obiettivo:** WhatsApp Cloud API integrata end-to-end.

### Milestone 4.1 — Setup WhatsApp Cloud

- [ ] Webhook ricezione messaggi WhatsApp
- [ ] Template messaggi approvati da Meta (almeno 3: contatto, quiz, check-in)
- [ ] Rate limit handling

### Milestone 4.2 — Message Writer agent

- [ ] Prompt Message Writer in `packages/agents/message-writer.ts`
- [ ] Varianti di messaggio per ogni stage (Contatto, Presenza, Chiusura)
- [ ] Lingua determinata da Guest DNA
- [ ] Firma sempre con nome struttura (mai "Premura")

### Milestone 4.3 — Quiz pre-arrivo

- [ ] Quiz dinamico 4 domande generato da Guest DNA
- [ ] Interfaccia swipe/choice card (Tinder-style) — landing page dedicata Next.js
- [ ] Submit risposte → update Guest DNA
- [ ] Fallback testuale se ospite non clicca swipe

### Milestone 4.4 — Comunicazione cleaner

- [ ] Numero cleaner associato in settings
- [ ] Template brief cleaner: "domani Anna arriva alle 15, kit n.4, consegna alle 10 a casa tua"
- [ ] Ricezione foto kit via webhook WhatsApp
- [ ] Conferma automatica "grazie €2 registrati"

**Test chiusura fase:** Andrea simula un ospite, invia quiz, riceve risposte, vede il DNA aggiornato. Karen riceve messaggio WhatsApp di brief, risponde "ok", riceve conferma.

---

## Fase 5 — Composizione kit + Amazon (settimana 5)

**Obiettivo:** dato un Guest DNA, genera ordine Amazon reale.

### Milestone 5.1 — Kit Composer

- [ ] Catalogo prodotti in DB (~50 SKU Amazon + 15 partner locali Napoli)
- [ ] Prompt Kit Composer con vincoli (budget, allergie, età bambini)
- [ ] Output validato Zod
- [ ] UI preview kit: tema + costo + item (visibile solo a te admin, mai all'host)

### Milestone 5.2 — Amazon 1-click shopping list

- [ ] Generazione URL carrello Amazon pre-popolato
- [ ] Notifica WhatsApp a host: "conferma ordine kit Anna, 1 tap"
- [ ] Callback dopo acquisto (OOB o manuale)
- [ ] Aggiornamento status kit a "ordered"

### Milestone 5.3 — Partner locali WhatsApp

- [ ] Template ordine pre-compilato per partner
- [ ] Invio automatico al partner 24h prima consegna
- [ ] Conferma manuale partner (risponde "ok")
- [ ] Status aggiornato

**Test chiusura fase:** Andrea ha un ospite reale in arrivo, riceve proposta kit su WhatsApp, conferma con 1 tap, Amazon manda conferma ordine, arriva a casa Karen in 2 giorni.

---

## Fase 6 — Billing + pagamento cleaner (settimana 6)

**Obiettivo:** monetizzazione funzionante.

### Milestone 6.1 — Stripe Subscriptions

- [ ] Checkout page con trial 30gg senza carta
- [ ] Cambio tier automatico su add/remove struttura
- [ ] Customer Portal per gestione fatture
- [ ] Webhook Stripe: `invoice.paid`, `subscription.updated`, `trial_will_end`

### Milestone 6.2 — Stripe Connect payout cleaner

- [ ] Onboarding cleaner Connect (flusso Express)
- [ ] Tracking `pending_payouts` per ogni kit completato
- [ ] Job mensile: cumulo e trasferimento cleaner
- [ ] Notifica WhatsApp cleaner "€X accreditati questo mese"

### Milestone 6.3 — Validazione pagamento 2 path

- [ ] Path 1: foto cleaner → payout pending immediato
- [ ] Path 2: fallback conferma ospite → verifica entro 24h
- [ ] Rating qualità cleaner automatico

**Test chiusura fase:** Andrea sottoscrive lui stesso un account trial (simula), usa Premura su 1 struttura reale per 30 giorni, paga a fine trial. Karen riceve primo payout.

---

## Fase 7 — Pilot su 3 strutture Napoli (settimane 7-10)

**Obiettivo:** Premura gira su La Goccia di S.Gennaro + altre 2 strutture Andrea per 30 giorni reali.

### Cosa succede

- Andrea usa Premura come unico modo di gestire ospiti nelle 3 strutture
- Karen è la cleaner pilota
- 3 partner locali Napoli (Poppella, Scaturchio, enoteca) attivi
- Tutti i 20-30 ospiti che passano nelle strutture in 30 giorni vengono pilotati da Premura

### Metriche da tracciare

- % kit consegnati in tempo
- % ospiti che rispondono al quiz
- Δ rating medio recensioni vs baseline
- Tempo operativo Andrea per ospite (target: <5 min/ospite)
- Problemi intercettati da Premura prima di diventare recensioni negative
- Costi reali per ospite processato (Claude, WhatsApp, infra)

### Goal: validazione economica + operativa

Se dopo 30 giorni:
- ✅ Rating medio +0.5 vs baseline → prodotto funziona
- ✅ Karen non si lamenta → logistica funziona
- ✅ Zero disastri (recensioni <8, problemi gravi mancati) → sistema stabile
- ✅ Costi <€15/mese per struttura Andrea → economics funziona

Allora si passa alla Fase 8.

Se no, si debugga e si ripete.

---

## Fase 8 — Early access (mesi 3-4)

**Obiettivo:** aprire a 20-50 host del network Andrea.

### Azioni

- [ ] Landing page pubblica Premura con form waitlist
- [ ] Video demo 3 min (screen record di Andrea che usa il prodotto sulle sue strutture)
- [ ] Outreach manuale a 50 host nel network Andrea (quelli con 1-5 strutture, NO PMS)
- [ ] Onboarding in 1:1 con prime 5-10 persone (Andrea guida via videocall)
- [ ] Raccolta feedback sistematica settimanale

### Milestone tecniche emergenti

Probabilmente emergeranno in questa fase:
- Gestione multi-cleaner per host con più strutture
- UI settings più avanzata
- Bug fix vari su edge case veri
- Miglioramenti ai prompt in base a risposte reali ospiti
- Possibile integrazione Glovo (se serve)
- Possibile integrazione InPost punti ritiro (se serve)

### Metriche successo

- 20+ host attivi a fine mese 4
- Churn <10% mese 1→2
- NPS >50
- Revenue MRR ~€150-200 (piccolo ma reale)

---

## Fase 9 — Public launch (mese 5+)

**Obiettivo:** aprire a tutti.

### Azioni

- [ ] Rimozione waitlist, signup libero
- [ ] SEO base: blog post, case study Andrea
- [ ] Presenza su gruppi Facebook host italiani
- [ ] Partnership con 1-2 micro-influencer host-host
- [ ] Eventuale lancio in qualche città oltre Napoli

### Milestone prodotto post-launch

- [ ] Integrazione Cortilia (se food artigianale diventa richiesta)
- [ ] App React Native (se user feedback la richiede forte)
- [ ] Analytics avanzate per host (ROI calcolato, recensioni trend)
- [ ] Multi-property dashboard migliorato

### Target 6 mesi post-launch

- 200-500 host paganti
- MRR €2k-4k
- Margine 85%+ (sostenibile da Andrea full-time se vuole)

---

## Fasi future (senza date — aspettare segnali dal mercato)

### Fase 10+ — Espansione

- Multi-città: Milano, Roma, Firenze, Venezia (con partnership locali dedicate)
- Multi-lingua UI (inglese per host stranieri con case in Italia)
- API pubblica per integrazioni (channel manager vogliono aggiungere Premura come add-on)
- White label per agenzie property management piccole

### Fase 11+ — Prodotti collegati

- Premura Plus: assicurazione danni ospite (partnership con insurer)
- Premura Fornitori: marketplace B2B per host, prodotti wholesale
- Premura Insights: dataset anonimizzato vendibile a OTA o brand

---

## Cosa NON è roadmap (decisioni di principio)

- **Niente fundraising nei primi 12 mesi.** Bootstrap con revenue, validazione prima.
- **Niente feature per richiesta di 1 solo host.** Feature per pattern minimo 5 host.
- **Niente "pivoting" facile.** Livello 1 è deciso. Se non funziona, si chiude o si rifonda, non si diventa Smoobu.
- **Niente over-engineering.** Se un problema capita 1 volta ogni 100 ospiti, si risolve manualmente. Si automatizza al 10°.

---

_Ultimo aggiornamento: 22 aprile 2026 — Andrea Chiacchio, fondatore_
