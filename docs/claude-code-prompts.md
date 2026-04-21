# Prompts per Claude Code

Come usare Claude Code per sviluppare GiftTube in ordine logico. Copia-incolla questi prompt uno alla volta.

## Prima sessione — capire il contesto

```
Leggi CLAUDE.md, README.md e docs/architecture.md. Poi fammi un riassunto di cosa fa il progetto, quali sono le scelte architetturali principali, e cosa manca ancora per avere un MVP funzionante.
```

## Step 1 — Database setup

```
Implementa la logica di migration del database. Usa drizzle-kit generate per generare la prima migration dallo schema in src/db/schema.ts, poi crea scripts/migrate.ts che applica le migration pending. Verifica che tutto compili con pnpm typecheck.
```

## Step 2 — Booking normalization layer

```
Crea src/db/queries/bookings.ts con funzioni tipate per:
- createBookingFromBookingCom(payload)
- createBookingFromAirbnb(payload)
- loadBookingFull(id) [quella referenziata in workflows/on-new-booking.ts]
- markBookingStatus(id, status)

Usa Drizzle ORM. Test in tests/bookings.test.ts con mock del DB (oppure Testcontainers per integration).
```

## Step 3 — OSINT enrichment module

```
Implementa src/workflows/osint-enrichment.ts. Dato nome + email + country, prova a:
1. Search Google per "[nome] [cognome] booking review" (usa SerpAPI o Google Custom Search)
2. Se email presente, LinkedIn pubblico via Proxycurl
3. Estrai: profession guess, social flags, recensioni pubbliche lasciate altrove

Tutto best-effort: se un sub-task fallisce, continua con gli altri. Output = EnrichmentResult type.
```

## Step 4 — WhatsApp cleaner flow

```
Collega src/integrations/whatsapp-business.ts al workflow on-new-booking. 
Crea src/api/webhooks/whatsapp.ts che:
1. Verifica webhook signature (WHATSAPP_APP_SECRET)
2. Parsa inbound messages usando parseInboundWebhook
3. Se la foto viene da numero di un cleaner → salva come kit.cleanerPhotoUrl
4. Se il messaggio è "OK" in risposta al brief → marca kit come cleanerAcceptedAt

Testa con mock Webhook payloads in tests/whatsapp.test.ts.
```

## Step 5 — Dashboard host (API)

```
Implementa src/api/dashboard/ con endpoint REST:
- GET /api/dashboard/overview — stats mensili (ospiti, kit inviati, recensione media)
- GET /api/dashboard/upcoming-guests — prossimi 7 giorni
- GET /api/dashboard/guest/:bookingId — Guest DNA + kit + timeline
- PUT /api/dashboard/guest/:bookingId/kit — modifica kit (se non auto-approve)
- PUT /api/dashboard/settings — aggiorna budget, tono, cleaner

Auth via JWT (src/utils/auth.ts). Tutti gli endpoint richiedono hostId dal token.
```

## Step 6 — Amazon SP-API integration

```
Implementa src/integrations/amazon-sp.ts con:
- searchCatalog(query) — cerca item per keywords
- placeOrder(skus, shippingAddress, slotRange) — place order alla cleaner
- getOrderStatus(orderId)

Usa official amazon-sp-api npm package. Marketplace: A21TJRUUN4KGV (Italia).
Focus su subset di item ricorrenti (vini, dolciumi confezionati, tappi).
```

## Step 7 — Quiz flow

```
Implementa src/workflows/quiz-flow.ts:
1. Quando DNA.confidence < 0.7, genera 3-4 domande (via Claude Haiku, personalizzate sul context)
2. Invia via canale piattaforma (Booking/Airbnb message) con UI generata come short link a quiz.gifttube.app/[token]
3. Crea src/api/quiz/ con endpoint pubblici per rendere il quiz (no auth, solo token)
4. Al completamento, ri-triggera generateGuestDna con le risposte aggiunte all'input

Il quiz deve essere mobile-first, 4 swipe max, completabile in <60s.
```

## Step 8 — n8n observability workflow

```
Crea n8n-workflows/gifttube-observability.json.
Workflow che ogni ora:
1. Query DB per bookings in "stuck" states (es. awaiting_approval da > 2h)
2. Alert su Slack/Telegram all'admin
3. Dashboard metrica: % booking che completano il flow in <24h

Esportalo come JSON per import in un'istanza n8n self-hosted.
```

## Come valutare ogni PR

Prima di fare merge, chiedi a Claude Code:
```
Rivedi questo diff. Check: (1) coerenza con CLAUDE.md, (2) typecheck passa, (3) test coverage per i path critici, (4) nessuna regressione di sicurezza. Dammi 3 cose da migliorare se ci sono.
```

## Debugging

Quando qualcosa non funziona:
```
Il flow on-new-booking fallisce per l'ospite [X]. Leggi i log in src/utils/logger.ts per capire dove. Poi proponi una fix minima senza introdurre nuove dipendenze.
```

## Note importanti

- **Non creare tool astratti**. Se serve un'astrazione, deve emergere dal codice reale, non anticiparla.
- **Ogni modifica ai prompt degli agent** va loggata in `docs/prompt-changelog.md`. I prompt sono il codice più critico del sistema.
- **Prima della prima deploy**, testa end-to-end sulle 3 strutture di Andrea a Napoli con dati reali (mode shadow: workflow gira ma non manda messaggi veri, solo logga).
