# GiftTube

> Il concierge invisibile per host di affitti brevi. €4.99/mese, zero configurazione.

## Cosa fa

Per ogni ospite che prenota una struttura, GiftTube:

1. **Analizza** i dati pubblici dell'ospite (OSINT leggero: nazionalità, recensioni lasciate altrove, profilo pubblico)
2. **Invia un micro-quiz** di 60 secondi via canale Booking/Airbnb se i dati non sono sufficienti
3. **Genera una Guest DNA card** con archetipo, rischi specifici, tono consigliato
4. **Ordina un kit di benvenuto personalizzato** (vino/dolci/biglietto scritto a mano) a casa della cleaner dell'host
5. **Invia istruzioni alla cleaner** via WhatsApp (lei sistema il kit durante la pulizia pre-check-in)
6. **Manda messaggi contestuali** all'ospite (pre-arrivo, check-in emotivo giorno 2, post-stay recovery)
7. **Intercetta feedback negativo** prima che diventi recensione pubblica

L'host fa UNA cosa: collega Booking/Airbnb all'onboarding. Tutto il resto è automatico.

## Perché è diverso

| Competitor | Cosa fanno | Cosa NON fanno |
|------------|-----------|---------------|
| Hostaway, Guesty | Template di messaggi automatici | Nessun kit fisico, nessun sondaggio AI-driven |
| Besty, Nowistay | AI chatbot per FAQ ospiti | Nessuna esecuzione autonoma nel mondo fisico |
| Operto, Uplisting | Pre-arrival surveys statici | I sondaggi non si trasformano in azioni |
| **GiftTube** | **Sondaggio → interpretazione AI → kit fisico consegnato** | — |

Il gap verificato ad aprile 2026: nessun tool chiude il loop "sondaggio → azione fisica autonoma".

## Modello economico

- **Abbonamento host**: €4.99/mese per struttura
- **Kit fisico**: l'host paga al costo (~€10-12) + service fee €0.75
- **Cleaner**: riceve €2 per kit sistemato, pagamento mensile automatico
- **Noi**: non anticipiamo mai. Scaling illimitato.

A 10.000 host attivi: ~€95k/mese margine netto.

## Stack tecnico

- **Backend**: Node.js + TypeScript + Fastify
- **Orchestrazione**: n8n (workflow visuali) + Claude Agent SDK (decisioni AI)
- **AI**: Claude Sonnet 4.7 via Anthropic API (Guest DNA, messaggi, kit selection)
- **Database**: PostgreSQL (dati strutturati) + Redis (cache/queue)
- **Integrazioni**:
  - Booking.com Connectivity API + Airbnb API (input prenotazioni)
  - Amazon SP-API Italia + Cortilia + Glovo Business (kit fisico)
  - WhatsApp Business Cloud API (cleaner + ospiti)
  - Stripe (abbonamenti + pagamento kit)
- **Hosting**: Railway/Render per MVP, migrazione a AWS post-MRR €10k

## Struttura repo

```
gifttube/
├── src/
│   ├── agents/         # Claude-powered agents (GuestDNA, KitComposer, MessageWriter)
│   ├── workflows/      # Business logic orchestration
│   ├── integrations/   # API wrappers (Booking, Airbnb, Amazon, WhatsApp)
│   ├── api/            # REST endpoints (host dashboard + webhooks)
│   ├── db/             # Schema, migrations, queries
│   └── utils/          # Shared helpers
├── n8n-workflows/      # Exported n8n JSON (visual workflows)
├── docs/               # Architecture, API docs, operational playbooks
├── scripts/            # One-off scripts (seed data, migration helpers)
├── tests/              # Unit + integration tests
└── config/             # Environment configs
```

## Roadmap

### Fase 0 — Validation (Settimana 1-2)
Test manuale sulle 3 strutture di Andrea a Napoli. Zero codice.
- 10 ospiti, kit ordinati a mano, consegna via cleaner (Maria)
- Obiettivo: portare media recensioni da 8.2 → 9+ in 30 giorni

### Fase 1 — MVP tecnico (Settimana 3-8)
- Onboarding + connessione Booking/Airbnb
- Guest DNA agent (Claude-powered)
- Quiz pre-arrivo via canale piattaforma
- Dashboard host minimale
- Workflow n8n per orchestrazione

### Fase 2 — Logistica (Settimana 9-12)
- Integrazione Amazon SP-API Italia
- WhatsApp Business → cleaner
- Handwrytten / network calligrafi
- Fallback Glovo Business per last-minute

### Fase 3 — Scale (Mese 4-6)
- Partnership fornitori locali (Napoli, Roma, Milano)
- Payment automation Stripe Connect per cleaner
- Dashboard analytics per host
- Soft launch gruppi Facebook host italiani

## Contatti

Fondatore: Andrea · Napoli, Italia
Stato: Pre-MVP, validation in corso

## Licenza

Proprietaria. Non distribuire senza autorizzazione.
