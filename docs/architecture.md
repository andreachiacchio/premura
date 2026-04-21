# Architettura

## Panoramica

GiftTube è un sistema event-driven. Ogni booking ricevuto da Booking.com o Airbnb scatena una catena di decisioni AI e azioni automatiche. L'host non interviene mai nel flusso normale.

```
  Booking/Airbnb webhook
           │
           ▼
    ┌─────────────┐
    │ Ingest API  │  ← src/api/webhooks/
    └──────┬──────┘
           │ persist raw + normalized
           ▼
    ┌─────────────┐
    │ BullMQ      │  ← queue: new-booking
    └──────┬──────┘
           │
           ▼
  ┌─────────────────────────────────────────┐
  │ Workflow: on-new-booking                │
  │                                          │
  │  OSINT enrichment (best effort)          │
  │  ↓                                       │
  │  Guest DNA agent (Claude Opus 4.7)       │
  │  ↓                                       │
  │  confidence < 0.7? → Quiz flow (pause)   │
  │  ↓                                       │
  │  Kit Composer agent (Claude Opus 4.7)    │
  │  ↓                                       │
  │  autoApprove? → Supplier order           │
  │                 ↓                        │
  │               Cleaner brief (WhatsApp)   │
  │                 ↓                        │
  │               Schedule msg T-24h         │
  │               Schedule msg Day 2         │
  │               Schedule recovery T+24h    │
  └─────────────────────────────────────────┘
```

## Scelte architetturali chiave

### 1. Agent = prompt, non logica if/else

Le decisioni importanti (che ospite è? che kit dargli? come scrivergli?) sono delegate a Claude con prompt accurati e tool use per output strutturati. Vantaggi:
- Il prompt è modificabile senza redeploy complessi
- Gestione robusta di casi edge che in logica tradizionale sarebbero centinaia di `if`
- Output strutturato via Zod → type safety in TS

Svantaggi accettati:
- Costo per ospite ~€0.04-0.06 (Opus). Accettabile sul modello €4.99.
- Latenza ~3-8s per chiamata Opus. Tollerabile perché è tutto async.

### 2. Confidence-gated quiz

Il Guest DNA agent emette sempre una confidence 0-1. Se sotto 0.7, il workflow si pausa e triggera il quiz pre-arrivo. Al completamento del quiz, il DNA viene ri-generato con le nuove info e il flusso riprende.

Questo evita di spammare quiz quando abbiamo già dati sufficienti (ospite business con prenotazione chiara) e di tirare a indovinare quando i dati sono scarsi.

### 3. Supplier routing dinamico

Non esiste un supplier fisso. Il workflow `placeSupplierOrder` sceglie in base a:
- Lead time (quante ore al check-in)
- Disponibilità item (catalog availability sync)
- Copertura geografica (Cortilia non consegna ovunque)
- Fallback Glovo per last-minute

Algoritmo: `src/workflows/supplier-routing.ts`

### 4. Cleaner come hub logistico

Il kit viene sempre consegnato a casa della cleaner (o al suo pickup point in tabacchi/Amazon Hub), mai direttamente alla struttura. La cleaner è vista come co-protagonista: riceve briefing via WhatsApp, conferma ricezione, sistema il kit, scatta foto di conferma.

Zero app installate da parte della cleaner. Tutto dentro WhatsApp Business.

### 5. Zero markup sul kit

L'host paga gli item al costo più service fee trasparente (€0.75). La marginalità di GiftTube viene dall'abbonamento + service fee, non dal markup sul prodotto.

Questo evita il sospetto dell'host ("dove guadagnano?") e permette di scalare a prezzo base €4.99.

## Modelli Claude usati

| Agent / Stage | Modello | Ragione |
|---|---|---|
| Guest DNA | Opus 4.7 | Inferenza complessa su segnali multipli |
| Kit Composer | Opus 4.7 | Ragionamento su budget + matching |
| Pre-arrival msg | Haiku 4.5 | Testo breve, template-ish |
| Welcome msg | Haiku 4.5 | Idem |
| Day 2 check-in | Opus 4.7 | Nuance importante — non deve sembrare bot |
| Recovery | Opus 4.7 | Gestione feedback negativo, tono critico |
| Cleaner brief | Haiku 4.5 | Istruzioni semplici |

## Costi stimati per ospite

- Guest DNA (Opus, ~2k input + 500 output): ~€0.04
- Kit Composer (Opus, ~3k input + 400 output): ~€0.05
- 5 messaggi (mix Haiku/Opus): ~€0.02
- **Totale AI per ospite: ~€0.11**

Con 10 ospiti/mese per host, costo AI = €1.10/mese. A €4.99, rimane €3.89 per coprire infrastruttura + margine.

## Sicurezza e privacy

- Dati ospiti cifrati at-rest (Postgres transparent encryption)
- Nessun dato personale inviato a terzi senza base legale
- GDPR deletion implementata: cancella dati ospite completi su richiesta host
- OSINT enrichment usa SOLO fonti pubbliche (no scraping dietro login)
- Log retention: 90 giorni per debug, poi aggregati anonimi

## Osservabilità

Ogni chiamata Claude logga:
- Input completo
- Output completo
- Cost in USD
- Model usato
- Latency
- Booking ID correlato

Query utili per analisi:
```sql
-- Cost per booking
SELECT booking_id, SUM(agent_cost_usd) FROM claude_calls GROUP BY booking_id;

-- Confidence distribution
SELECT width_bucket(confidence, 0, 1, 10) AS bucket, COUNT(*)
FROM guest_dna GROUP BY bucket ORDER BY bucket;
```

## Prossimi passi tecnici

1. OSINT enrichment module (Proxycurl, recensioni Google/Tripadvisor pubbliche)
2. Supplier routing con availability cache
3. Handwrytten integration + alternativa studenti calligrafi
4. Dashboard host mobile-first (Next.js + Tailwind)
5. Stripe Connect per pagamento cleaner
6. n8n workflows come fallback/observability visuale
