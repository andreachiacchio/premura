# Dockerfile Premura API — multi-stage.
#
# Strategia build: ZERO compile step.
# I workspace `@premura/*` hanno `main: "./src/index.ts"`, quindi Node
# nativamente non potrebbe eseguirli. Usiamo `tsx` a runtime: coerenza
# dev↔prod, zero modifica ai package.json workspace.
#
# Overhead: ~200-400ms cold start per transpile iniziale. Accettabile
# per staging. Vedi `docs/KNOWN-LIMITS.md` §6 per roadmap tsup post-pilot.
#
# Build context atteso: repo ROOT (non apps/api/), perché serve accedere
# a packages/*. Vedi `apps/api/README.md` per il comando esatto.

# ───────────────────────────────────────────────────────────
# Stage 1 — deps: installa tutto il workspace
# ───────────────────────────────────────────────────────────
FROM node:20-alpine AS deps

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

# Copia PRIMA i soli manifesti: layer di install resta caldo se cambia
# solo il codice (non package.json / lockfile).
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/db/package.json ./packages/db/
COPY packages/agents/package.json ./packages/agents/
COPY packages/shared/package.json ./packages/shared/
COPY packages/integrations/package.json ./packages/integrations/

# Install completo (inclusi dev): tsx serve a runtime, i tipi non servono
# ma pesano poco e semplificano il multi-stage.
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# Ora copia i sorgenti (layer distinto, non invalida install)
COPY tsconfig.base.json ./
COPY apps/api ./apps/api
COPY packages ./packages

# ───────────────────────────────────────────────────────────
# Stage 2 — runtime: immagine finale snella
# ───────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

ENV NODE_ENV=production \
    PORT=8080

# Copia l'intero workspace pronto dallo stage deps.
# (Niente pnpm prune --prod: tsx è devDep ma serve in prod.)
COPY --from=deps /app /app

WORKDIR /app/apps/api

EXPOSE 8080

# Healthcheck Docker-level (indipendente da quello Fly in fly.toml).
# `wget` è disponibile in Alpine via busybox.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD wget -qO- http://127.0.0.1:8080/health || exit 1

CMD ["pnpm", "exec", "tsx", "src/index.ts"]
