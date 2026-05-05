#!/usr/bin/env bash
# Smoke test route Next.js dopo build + start.
# Cattura runtime crash (RSC errors, module-load failures, middleware
# bugs) che vitest e tsc non vedono perche' bypassano SSR.
#
# Public routes: render server-side completo, atteso 200.
# Protected routes: senza session Supabase, middleware redirect,
# atteso 307. 500 indica modulo rotto o env var mancante.
#
# Limitazione: senza session Supabase fake, le protected routes
# vengono redirected dal middleware (307) prima del render. Quindi
# questo smoke da solo non cattura RSC errors all'interno di pagine
# protette. Il static check grep nel CI workflow ci pensa.
#
# Variabili Supabase fake servono solo per non far crashare il
# middleware (che throw se NEXT_PUBLIC_SUPABASE_URL e' mancante).

set -euo pipefail

PORT="${SMOKE_PORT:-3055}"
BASE_URL="http://localhost:${PORT}"
LOG_FILE="$(mktemp)"

echo "[smoke] avvio next start su :${PORT} (log -> ${LOG_FILE})"

NEXT_PUBLIC_SUPABASE_URL="https://fake.supabase.co" \
NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiJ9.fake-token.fake-sig" \
DATABASE_URL="postgresql://fake:fake@localhost:5432/fake" \
SUPABASE_SERVICE_ROLE_KEY="fake-service-key" \
PORT="${PORT}" \
  setsid pnpm start > "${LOG_FILE}" 2>&1 &

SERVER_PID=$!

cleanup() {
  # SIGTERM al process group (setsid sopra crea un nuovo PG con PGID=PID).
  # Cosi' uccidiamo anche il next-server worker spawnato dal parent.
  # Niente wait: il child puo' restare in defunct, lo lasciamo al kernel.
  if kill -0 "${SERVER_PID}" 2>/dev/null; then
    kill -TERM -- "-${SERVER_PID}" 2>/dev/null || true
    sleep 0.5
    kill -KILL -- "-${SERVER_PID}" 2>/dev/null || true
  fi
  if [ "${SMOKE_KEEP_LOG:-0}" != "1" ]; then
    rm -f "${LOG_FILE}"
  fi
}
trap cleanup EXIT

# Wait per Next.js ready (fino a 30s).
for i in $(seq 1 30); do
  if grep -q "Ready in" "${LOG_FILE}" 2>/dev/null; then
    echo "[smoke] next pronto (dopo ${i}s)"
    break
  fi
  if ! kill -0 "${SERVER_PID}" 2>/dev/null; then
    echo "[smoke] ERRORE: next start morto prima del ready"
    cat "${LOG_FILE}"
    exit 1
  fi
  sleep 1
done

if ! grep -q "Ready in" "${LOG_FILE}" 2>/dev/null; then
  echo "[smoke] ERRORE: timeout 30s su 'Ready in'"
  cat "${LOG_FILE}"
  exit 1
fi

# Lista route + status codes accettati (separati da virgola).
ROUTES=(
  "/:200,307"
  "/login:200"
  "/privacy:200"
  "/design:200"
  "/dashboard:307"
  "/onboarding:307"
  "/onboarding/welcome:307"
  "/onboarding/property:307"
  "/onboarding/gmail:307"
  "/onboarding/whatsapp:307"
)

failed=0
for entry in "${ROUTES[@]}"; do
  path="${entry%%:*}"
  expected="${entry#*:}"
  status=$(curl -s -o /dev/null -w "%{http_code}" --max-redirs 0 "${BASE_URL}${path}")

  # Match esatto contro la lista expected (separati da virgola).
  IFS=',' read -ra valid <<< "${expected}"
  ok=0
  for v in "${valid[@]}"; do
    if [ "${status}" = "${v}" ]; then
      ok=1
      break
    fi
  done

  if [ "${ok}" -eq 1 ]; then
    echo "[smoke] OK   ${path} -> ${status}"
  else
    echo "[smoke] FAIL ${path} -> ${status} (atteso ${expected})"
    failed=$((failed + 1))
  fi
done

if [ "${failed}" -gt 0 ]; then
  echo "[smoke] ${failed} route fallite. Server log:"
  cat "${LOG_FILE}"
  exit 1
fi

echo "[smoke] tutte le route OK"
