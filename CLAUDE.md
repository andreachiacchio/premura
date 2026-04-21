# CLAUDE.md

Questo file fornisce contesto a Claude Code quando lavora su questa repository.

## Contesto del progetto

GiftTube è un SaaS per host di affitti brevi (Airbnb/Booking). L'abbonamento costa €4.99/mese. Per ogni ospite che prenota, un agente AI:
- Analizza i dati pubblici dell'ospite
- Invia un micro-quiz di 60 secondi se necessario
- Genera una Guest DNA card
- Ordina un kit fisico personalizzato via Amazon/Cortilia a casa della cleaner
- Invia istruzioni alla cleaner via WhatsApp
- Manda messaggi contestuali all'ospite durante tutto il soggiorno
- Intercetta feedback negativo prima della recensione pubblica

L'obiettivo è passare da recensioni 8/10 a 9.5+/10 senza che l'host faccia nulla.

## Principi di design del codice

1. **Semplicità radicale**: ogni funzione fa una cosa sola. Se serve un commento per capire, serve un refactor.
2. **Agent-first architecture**: la logica decisionale sta nei prompt a Claude, non in if/else. I prompt sono il codice più importante.
3. **Fail gracefully**: se Amazon non consegna, fallback Glovo. Se Glovo fallisce, notifica host. Mai bloccare il flusso.
4. **Host non tocca mai nulla**: ogni decisione di default è automatica. L'host interviene solo quando vuole.
5. **Observabilità totale**: ogni decisione dell'agente viene loggata con ragionamento. Niente black box.

## Stack e convenzioni

- **Linguaggio**: TypeScript strict mode
- **Runtime**: Node.js 22 LTS
- **Framework**: Fastify (preferito a Express per performance)
- **Database**: PostgreSQL 16 con Drizzle ORM
- **Queue**: BullMQ su Redis
- **AI**: Anthropic SDK, modello `claude-opus-4-7` per decisioni importanti, `claude-haiku-4-5-20251001` per task semplici
- **Testing**: Vitest
- **Linting**: Biome (sostituisce ESLint + Prettier)

## Convenzioni di codice

- File naming: `kebab-case.ts`
- Class/Type naming: `PascalCase`
- Function naming: `camelCase`
- Const globali: `SCREAMING_SNAKE_CASE`
- Import aliases: `@/` → `src/`, `@agents/` → `src/agents/`, etc.
- Async/await sempre, mai `.then()` chain
- Zod per validazione runtime di input esterni
- Mai usare `any`; se serve, usare `unknown` + narrowing

## Struttura cartelle

```
src/
├── agents/           # Claude agents (uno per ruolo)
│   ├── guest-dna.ts       # Analizza ospite, genera DNA card
│   ├── kit-composer.ts    # Sceglie contenuto kit da budget + DNA
│   ├── message-writer.ts  # Scrive messaggi contestuali
│   └── recovery-agent.ts  # Gestisce feedback negativo post-stay
├── workflows/        # Orchestrazione business logic
│   ├── on-new-booking.ts  # Trigger principale quando arriva prenotazione
│   ├── on-quiz-response.ts
│   └── on-checkout.ts
├── integrations/     # API wrappers esterni
│   ├── booking-com.ts
│   ├── airbnb.ts
│   ├── amazon-sp.ts
│   ├── cortilia.ts
│   ├── whatsapp-business.ts
│   └── stripe.ts
├── api/              # REST endpoints
│   ├── webhooks/          # Endpoint ricezione eventi Booking/Airbnb/Stripe
│   ├── dashboard/         # Endpoint per app host
│   └── cleaner/           # Endpoint per flussi cleaner (foto conferma etc.)
├── db/
│   ├── schema.ts          # Drizzle schema
│   ├── migrations/
│   └── queries/
└── utils/
    ├── claude.ts          # Wrapper Anthropic SDK
    ├── logger.ts          # Pino logger
    └── errors.ts          # Error classes
```

## Note su Claude API

- Per Guest DNA generation: usiamo tool use per estrarre dati strutturati
- Per messaggi: usiamo streaming per velocità percepita
- Ogni chiamata è loggata con input/output/cost
- Rate limiting: max 10 req/s per host per evitare burst
- Prompt caching: sempre attivo per system prompts (risparmio ~70% costi)

## Sicurezza

- Secret management: variabili d'ambiente, mai in git
- Dati ospiti: cifrati at-rest (postgres-level)
- GDPR: deletion request handler in `src/api/dashboard/gdpr.ts`
- Non inviare mai dati ospite a servizi terzi senza base legale chiara

## Testing strategy

- Unit test per ogni agent (mock Claude API)
- Integration test per workflow principali (usa Testcontainers per Postgres/Redis)
- E2E test opzionale per onboarding host

## Cosa NON fare

- Non aggiungere dipendenze npm senza discussione (lock alle essenziali)
- Non scrivere codice "difensivo" ridondante (try/catch ovunque)
- Non creare abstraction prematurate
- Non toccare i prompt degli agent senza log del cambiamento (sono il codice più critico)

## Comandi utili

```bash
pnpm dev              # Avvia server dev con hot reload
pnpm test             # Esegui test
pnpm db:migrate       # Applica migration pendenti
pnpm db:seed          # Popola DB con dati di test
pnpm lint             # Biome check
pnpm typecheck        # tsc --noEmit
```
