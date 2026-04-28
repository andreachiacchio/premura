# Quick Start

## Prerequisiti

- Node.js 22+
- pnpm 9+
- PostgreSQL 16 (locale o Docker)
- Redis 7+ (locale o Docker)
- Account Anthropic con API key
- (Opzionale per MVP) Account Booking.com Connectivity, Airbnb API, Stripe, WhatsApp Business

## Setup locale

```bash
# 1. Clone + install
git clone https://github.com/yourusername/premura.git
cd premura
pnpm install

# 2. Env vars
cp .env.example .env
# Edita .env con almeno ANTHROPIC_API_KEY, DATABASE_URL, REDIS_URL

# 3. Database
docker compose up -d  # starta postgres + redis (TODO: creare docker-compose.yml)
pnpm db:generate      # genera migration dal schema
pnpm db:migrate       # applica migration

# 4. Dev server
pnpm dev
# Server su http://localhost:3000/health

# 5. Test
pnpm test
```

## Struttura sviluppo

1. **Fase validation (settimane 1-4)**: Zero codice. Segui `docs/30-day-validation.md` per testare il modello manualmente sulle 3 strutture di Napoli.

2. **Fase MVP (settimane 5-12)**: Segui `docs/claude-code-prompts.md` step by step. Ogni step è una feature atomica testabile.

3. **Fase beta (mese 4)**: Soft launch con 20-30 host early adopter, tutti con ≤3 strutture. Feedback intensivo.

4. **Fase scale (mese 5+)**: Lancio pubblico.

## Comandi frequenti

```bash
pnpm dev              # server dev con hot reload
pnpm test             # unit test
pnpm test:watch       # test in watch mode
pnpm typecheck        # controllo TS senza emit
pnpm lint             # Biome check
pnpm lint:fix         # Biome auto-fix
pnpm db:generate      # genera migration
pnpm db:migrate       # applica migration
pnpm db:studio        # GUI database
```

## Troubleshooting

**Errore "ANTHROPIC_API_KEY missing"**: copia `.env.example` in `.env` e inserisci la tua chiave.

**Errore connessione DB**: verifica che Postgres sia su porta 5432 e che `DATABASE_URL` sia corretta.

**Test che falliscono su `runClaude`**: i test usano mock, non dovrebbero chiamare Claude vero. Se falliscono, verifica che il `vi.mock` sia prima dell'import del modulo under test.

## Contatti

- Product: Andrea (Napoli)
- Repository: questo è un progetto privato, non distribuire
