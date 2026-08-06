# CLAUDE.md

Questo file fornisce contesto a Claude Code quando lavora su questa repository.

> La fonte di verità del progetto è `CONTEXT.md` nella root. In caso di
> conflitto tra questo file e `CONTEXT.md`, vince `CONTEXT.md`.

## Contesto del progetto

Premura è un agente AI concierge per host italiani di affitti brevi.

- **Target**: host con 1-5 strutture, zero PMS, pain = tempo e recensioni
  (~70% del mercato italiano).
- **Posizionamento**: Livello 1. Il primo tool che l'host compra. Non compete
  con Smoobu/Hostaway/Guesty/Hospitable (Livello 2, per 10+ strutture).
- **Prezzi**: €9,99 / mese (1 struttura), €7,99 / mese (2-5), €5,99 / mese (6+).
  Trial gratis fino al primo ospite servito, senza carta.

Per ogni prenotazione l'agente esegue 5 fasi automatiche:

1. **Studio** — analizza l'ospite, genera Guest DNA
2. **Contatto** — T-48h WhatsApp + micro-quiz 60s (4 swipe)
3. **Cura** — compone e ordina kit fisico, briefa cleaner
4. **Presenza** — check-in emotivo giorno 2, risolve o escalation all'host
5. **Chiusura** — T+24h sondaggio privato, recovery o nudge recensione

L'obiettivo è passare da recensioni 8/10 a 9,5+/10 senza che l'host faccia
nulla.

## Decisioni blindate (NON cambiare senza discussione)

Riferimento completo in `CONTEXT.md` §4. In sintesi:

- Nome prodotto e agente: **Premura**. Mai "Leo" né altri nomi.
- Firma messaggi all'ospite: **nome della struttura**, non un brand terzo.
  L'ospite deve pensare di parlare con l'host umano.
- **Zero markup** sul kit: costo + €0,75 service + €2 cleaner + €1 biglietto.
  Slider budget host €3-€20. Pilastro etico non negoziabile.
- Il kit specifico **non è visibile all'host** prima dell'invio
  (anti-disintermediazione). L'host vede solo budget, tema, "kit inviato".
- L'host **non configura** template messaggi. L'agente scrive sempre diverso
  basandosi su DNA + contesto + quiz.
- Canale primario: WhatsApp Business con opt-in. Fallback Booking/Airbnb solo
  se opt-in negato.
- Aggregazione **read-only** di Booking + Airbnb. Non è un channel manager.
- UX host: **solo 3 stati** (verde / giallo / rosso). No timeline, no log,
  no task list.

## Principi di design del codice

1. **Semplicità radicale**: ogni funzione fa una cosa sola. Se serve un
   commento per capire, serve un refactor.
2. **Agent-first architecture**: la logica decisionale sta nei prompt a
   Claude, non in if/else. I prompt sono il codice più importante.
3. **Fail gracefully**: se Amazon non consegna, fallback Cortilia/fornitori
   locali. Se tutto fallisce, notifica host. Mai bloccare il flusso.
4. **Host non tocca mai nulla**: ogni decisione di default è automatica.
   L'host interviene solo quando vuole (o quando Premura lo chiede in rosso).
5. **Observabilità totale**: ogni decisione dell'agente viene loggata con
   ragionamento. Niente black box.

## R2 — leggere l'esito, non assumerlo

> Questa è la regola che ha generato i tre bug del 5 agosto. Sta qui
> perché vale ovunque, non solo nel prompt in cui è nata.

**Un valore mostrato o registrato deve derivare dal dato che pretende di
descrivere.** Mai da un'assunzione ottimistica presa a parte.

Le due forme in cui si presenta:

1. **Sui fatti** — chi chiama una funzione che può fallire deve *leggere*
   cosa ha restituito prima di avanzare lo stato. Un invio "partito" si
   scrive solo con la prova dell'invio in mano (vedi il parametro
   `providerMessageId` obbligatorio su `markWelcomeMessageSent`,
   `markSurveySent`, `markCleanerBriefed`). Se una funzione registra
   un'azione *umana* e non un invio di Premura, il commento deve dire
   **cosa registra**, non solo perché non ha una prova.
2. **Sul testo** — la frase che l'host legge deve derivare dallo stesso
   conteggio che gli mostri accanto. "Tutto tranquillo" accanto a
   "SERVE TE: 1" sono due verità opposte a dieci centimetri. E non si
   dice mai "tranquillo" quando semplicemente non si è ancora guardato:
   calendario non letto è uno stato suo, con la sua azione.

Come si rende vera, non solo scritta: **il dato che serve alla verità è
un parametro obbligatorio**. Se si può omettere, prima o poi qualcuno lo
omette e il default mente in silenzio. Ometterlo deve essere un errore di
compilazione (vedi `buildAgentStatus`, dove `needsYouCount` e `calendars`
sono obbligatori e la stringa di calma incondizionata è stata eliminata).

## Stack e convenzioni

- **Linguaggio**: TypeScript strict mode
- **Runtime**: Node.js 22 LTS
- **Framework**: Fastify (preferito a Express per performance)
- **Database**: PostgreSQL 16 con Drizzle ORM
- **Queue**: BullMQ su Redis
- **AI**: Anthropic SDK — `claude-opus-4-7` per decisioni importanti,
  `claude-haiku-4-5-20251001` per task semplici
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
- **Lingua**: italiano per UI, commenti, messaggi utente

## Struttura cartelle

```
src/
├── agents/           # Agenti Claude (uno per ruolo)
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
│   └── cleaner/           # Endpoint per flussi cleaner (foto conferma, etc.)
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
- Ogni chiamata è loggata con input / output / cost
- Rate limiting: max 10 req/s per host per evitare burst
- Prompt caching: sempre attivo per i system prompt (risparmio ~70% costi)

## Sicurezza

- Secret management: variabili d'ambiente, mai in git
- Dati ospiti: cifrati at-rest (postgres-level)
- GDPR: deletion request handler in `src/api/dashboard/gdpr.ts`
- Non inviare mai dati ospite a servizi terzi senza base legale chiara

## Testing strategy

- Unit test per ogni agent (mock Claude API)
- Integration test per workflow principali (Testcontainers per Postgres/Redis)
- E2E test opzionale per onboarding host

## Cosa NON fare

- Non aggiungere dipendenze npm senza discussione (lock alle essenziali)
- Non scrivere codice "difensivo" ridondante (try/catch ovunque)
- Non creare abstraction prematurate
- Non toccare i prompt degli agent senza log del cambiamento (sono il codice
  più critico)
- Non introdurre scope creep verso channel manager o PMS — se hai un dubbio,
  rileggi `CONTEXT.md` §8 ("Cosa NON è Premura")

## Comandi utili

```bash
pnpm dev              # Avvia server dev con hot reload
pnpm test             # Esegui test
pnpm db:migrate       # Applica migration pendenti
pnpm db:seed          # Popola DB con dati di test
pnpm lint             # Biome check
pnpm typecheck        # tsc --noEmit
```

## Nota storica

Il progetto si chiamava GiftTube nel periodo gen-mar 2026. Tutto il codice, il
repo e il package name sono ora premura. Riferimenti residui a gifttube in
docs/30-day-validation.md e docs/ROADMAP.md sono volutamente lasciati come
record storico.
