# Slice A — Onboarding "Prossimi check-in" + bulk fill numeri WA

Prima slice della roadmap V1 (A→E). Costruisce il gateway per
attivare un booking in Premura: l'host inserisce il numero WhatsApp
del guest dalla dashboard e quel booking diventa "premura active",
sbloccando le pipeline downstream (slice B survey, C check-in, D
mid-stay, E checkout).

## Razionale window 14gg

- **Limite superiore**: oltre 14gg il booking non e' nel "campo
  visivo operativo" dell'host (pianifica per la settimana corrente o
  quella dopo). Mostrare 6 mesi futuri = lista lunga e disorganizzata.
- **Limite inferiore**: oggi (start of day). Booking gia' iniziati
  vanno gestiti da `/dashboard` esistente (lista operativa M2a.4).

Window non configurable in V1; se servira' (es. host con cadenza piu'
lunga), aggiungiamo `?days=30` query param.

## Flow host

1. Host apre `/dashboard` → vede card "Prossimi check-in" con count
   totale + count senza numero (se > 0, card peach urgente).
2. Click sulla card → atterra su `/dashboard/upcoming-checkins`.
3. Tabella con riga per booking. Per ogni riga senza `guest_phone`,
   input editabile inline.
4. Tab+digitazione passa rapidamente da una riga all'altra (UX bulk
   fill in 5 minuti settimanali).
5. Enter o blur → save via `setBookingGuestPhoneAction`.
6. Validazione client + server: libphonenumber-js normalizza in E.164.
   Se invalido → border alert + messaggio "Numero non valido".
7. Su success: status row passa da "🟡 Da inserire" a "🟢 Attivo".
   Animazione check verde 1.2s.
8. Trash icon → conferma → `clearBookingGuestPhoneAction`
   resetta guest_phone + premura_active_at (audit fields preservati).

## Schema changes (migration 0017_bookings_premura_active)

`bookings`:
- `premura_active_at` TIMESTAMPTZ nullable — gate per pipeline
  downstream. NULL = booking non attivato Premura.
- `guest_phone_added_by_host_id` UUID FK hosts.id ON DELETE SET NULL
  — audit chi ha aggiunto.
- `guest_phone_source` VARCHAR(32) — 'manual' (slice A path),
  'platform' (numero arrivato dal channel ingestion), futuro
  'import_csv', 'sms_invite', ecc. Senza enum per flessibilita'.
- Index `bookings_premura_active_at_idx` per query downstream.

Backfill: row pre-A con `guest_phone IS NOT NULL` ricevono
`premura_active_at = COALESCE(manual_completion_at, updated_at)` e
`source = 'platform'`.

## Activation logic — cosa cambia quando booking diventa premura_active

V1 (slice A): nulla, semplice flag. Le pipeline downstream lo
filtreranno quando arriveranno (slice B in poi).

Schema gate: `WHERE premura_active_at IS NOT NULL` su tutte le query
downstream (survey trigger, check-in scheduler, ecc).

## Roadmap link

| Slice | Cosa abilita |
|---|---|
| **A** (questa) | Gate attivazione booking via guest_phone |
| B | Pre-arrival survey 60s WA → guest preferences (T-48h dal check-in, **solo** se `premura_active_at` valorizzato) |
| C | Check-in: kit composer + foto setup cleaner + send foto a guest la mattina del check-in |
| D | Mid-stay: emotional check-in giorno 2, escalation host se rosso |
| E | Post-stay: T+24h sondaggio privato, recovery o nudge recensione |

## Test

- `apps/web/tests/phone-normalize.test.ts` — 12 test su `normalizePhone`:
  formati italiani validi (5), internazionali (2), invalidi (5).
- `apps/web/tests/upcoming-checkins-repo.test.ts` — 7 test su
  `setBookingGuestPhone` (not_found, wrong_host, prima volta,
  idempotenza preserve premura_active_at) + `clearBookingGuestPhone`
  (3 path).
- Test CI: 471 verdi totali (415 monorepo + 56 web).

## Deploy

1. Migration: `DATABASE_URL=<staging> pnpm db:migrate` (riusa script
   DEBT-1, applica 0017_bookings_premura_active).
2. Verifica: `SELECT count(*) FROM bookings WHERE premura_active_at IS NOT NULL`
   = backfill counts.
3. Seed dev (opzionale): `pnpm --filter @premura/db seed:upcoming-checkins`
   crea 5 booking T+2..T+13 per host pilot Andrea (2 con phone, 3 senza).
4. Push main → Vercel auto-deploy → smoke test:
   `curl -I https://premura.it/dashboard/upcoming-checkins` → 307 (no auth).

## Limiti V1 (TODO)

- **No bulk import CSV**. Slice A.1 se serve a host con tante
  property: upload CSV con (booking_id, phone) → bulk update.
- **No SMS invite**: per i guest senza WhatsApp, non c'e' un
  fallback. Slice A.2 se serve: form pubblico magic-link via SMS.
- **Reject reason UI per invalid_phone**: per ora generico. Slice
  A.1 puo' aggiungere errore specifico ("paese non riconosciuto",
  "lunghezza errata", ecc).
- **No history audit**: l'host vede solo l'ultimo numero, non chi /
  quando l'ha cambiato. Audit fields esistono in DB ma non in UI.
