# Slice B — Pre-arrival survey tap-based mini web app

Seconda slice della roadmap V1. Per ogni booking attivato (slice A `premura_active_at`), Premura manda WhatsApp 7gg pre-checkin con UN messaggio + link a una mini web app pubblica `/s/[token]`. Il guest fa 3-4 tap (no typing), submit → responses salvate in `guest_quizzes` + email Andrea operatore.

## Riorientamento product strategy

Andrea ha confermato modello "Concierge Operator V1":
- Host vede UI 1-tap pulita
- Andrea (founder) e' operatore umano dietro le quinte
- Tutta operazione fulfillment manuale (no Amazon API, no automation)
- Pilot solo 3 B&B di Andrea (La Goccia, Napoli Sotterranea, Villa Cristina)

Slice B PRECEDENTE (chat conversazionale Sonnet multi-turn) **scartata**. Sostituita da questa: tap-based mini web app con questions adaptive Sonnet planner.

## Architettura

### DB — migration 0018_guest_quizzes_tap_app

| Colonna | Tipo | Note |
|---|---|---|
| `token` | VARCHAR(512) | JWT signed (HMAC SHA-256), unique partial |
| `token_expires_at` | TIMESTAMPTZ | TTL = 7gg pre-checkin + 7gg post (cuscinetto guest in ritardo) |
| `questions_plan` | JSONB | Snapshot QuestionPlan generato da survey-planner |
| `language` | VARCHAR(8) DEFAULT 'it' | Determinata al send-time |
| `url_opens` + `first_opened_at` | INT, TIMESTAMPTZ | Analytics conversion funnel |
| `skipped_reason` | VARCHAR(32) | `'no_response_96h'` / `'manual'` / `'guest_declined'` |

`responses` esistente riusato come `{ qid: optionValue | optionValue[] }` (per single_choice o multi_choice). Per opzioni `allow_text=true`, free-text serializzato come `"value|<text>"`.

### Survey planner agent (Sonnet 4.6)

`packages/agents/src/survey-planner.ts`:
- Tool_use forzato → `QuestionPlan[]` (2-4 questions)
- Cache_control ephemeral su system prompt
- Output IT/EN paralleli (frontend sceglie)
- Adaptive rules in system prompt:
  - 1-2 notti → 2 questions, skip morning
  - 3-5 notti → 3 questions
  - 6+ notti → 4 questions (aggiunge "interests")
  - guestMessage menziona occasion → skip occasion question
  - children > 0 → aggiunge "kids_ages"
  - 1 adulto + soggiorno breve → probabile business, skip allergies, aggiunge "early_checkout"

`fallbackPlan` deterministico se Sonnet fallisce o per testing.

### JWT token utilities

`packages/agents/src/survey-token.ts`:
- `signSurveyToken(bookingId, expiresAtMs)` → JWT HMAC SHA-256
- `verifySurveyToken(token)` → result discriminato (`ok` | `reason: 'invalid_format' | 'invalid_signature' | 'expired' | 'invalid_payload'`)
- Implementazione minimal con Node `crypto` (no `jose`/`jsonwebtoken` deps)
- Timing-safe compare
- Env: `SURVEY_TOKEN_SECRET` min 32 char

### Pipeline (`packages/agents/src/survey-pipeline.ts`)

| Funzione | Ruolo |
|---|---|
| `findBookingsForSurveySend` | Cron query window 7gg + filter guest_phone + no-quiz-sent |
| `prepareSurveySend` | Genera (o riusa) token + plan + WA message; idempotente |
| `markSurveySent` | Set sent_at dopo successful Meta send |
| `loadSurveyByToken` | Verify + fetch + render data per /s/[token] |
| `trackSurveyOpen` | Increment url_opens + first_opened_at |
| `submitSurvey` | Verify + persist responses + completed_at |
| `findStaleSurveys` | Cron 96h timeout |
| `markSurveyAbandoned` | Set skipped_at + skipped_reason='no_response_96h' |
| `buildMessage` | Template WA IT/EN deterministico |

### apps/api wiring

**Cron** (`survey-cron.ts`): `'0 9 * * *'` Europe/Rome.
Tick: enqueue `send-link` per candidates + enqueue `mark-abandon` per stale.

**Queue** (`survey-queue.ts`): `pre-arrival-survey`. Job types:
- `send-link`: prepara survey + invia WA (jobId fisso `survey:send:{bookingId}`)
- `mark-abandon`: skip survey (jobId `survey:abandon:{quizId}`)

**Worker** (`survey-worker.ts`): wrappa `processSurveyJob`. Concurrency 2.

### Public route `/s/[token]` (apps/web)

Server Component (`page.tsx`): valida token → render una di 4 schermate:
1. **SurveyApp** (Client) — mini web app interattiva
2. **SurveyExpired** — link scaduto
3. **SurveyInvalid** — link tampered/sconosciuto
4. **SurveyAlreadySubmitted** — guest riapre dopo submit

`SurveyApp.tsx` (Client):
- 1 question per schermata (max-w-md mobile-first)
- Grid 2-col options: emoji + label IT/EN
- Single-choice → tap auto-advance dopo 250ms
- Multi-choice → tap toggle + bottone "Continua"
- 'none' esclusivo (deselezione altre)
- 'other' inline text input
- Indietro / Continue / Manda
- Thanks screen finale con messaggio personalizzato

Server action `submitSurveyAction(token, responses)`:
- Validate via Zod
- `submitSurvey` (verify + persist)
- Email founder fire-and-forget via Resend

### Email notification

`OPERATOR_EMAIL` (default `andrea.chiacchio@premura.it`). Fire-and-forget — submit succeeds anche se email fallisce.

### Dashboard integration

`/dashboard/upcoming-checkins` (slice A) extra colonna **Survey** con badge:
- ⚪ "In coda" (sent_at NULL)
- 🟡 "Inviata" (sent_at NOT NULL, completed_at NULL)
- 🟢 "Completata" (completed_at NOT NULL)
- 🟠 "Saltata" (skipped_at NOT NULL)

## Flow end-to-end

```
T-7gg: cron 09:00 → enqueue send-link for candidates
worker:
  1. findBookingsForSurveySend (re-fetch per safety)
  2. prepareSurveySend → planSurvey (Sonnet 4.6, fallback if errore)
                       → signSurveyToken (TTL 14gg)
                       → buildMessage WA IT/EN
                       → INSERT guest_quizzes (token, plan, language)
  3. sendText Meta Cloud API
  4. markSurveySent

guest opens /s/[token]:
  page.tsx: loadSurveyByToken → trackSurveyOpen → render SurveyApp
  guest taps through 3-4 questions
  submit → submitSurveyAction → submitSurvey → completed_at + responses
        → notify founder email Resend (fire-and-forget)

timeout 96h: cron → enqueue mark-abandon → skipped_reason='no_response_96h'
```

Slice C (kit composer) consuma `responses` di booking con `completed_at NOT NULL`.

## Test (485 verdi totali, +14)

- `survey-token.test.ts` (6): round-trip, expired, tampered, invalid_format, missing secret.
- `survey-planner.test.ts` (5): fallback determinismo per nights 1/3/7, all questions valid, 'other' option allow_text.
- `survey-pipeline.test.ts` (3): buildMessage IT/EN + size cap.

Test profondi Sonnet mock e2e fuori scope (target 6h slice). Coperti via local manual smoke quando numero pilota migrato.

## Limiti V1 (TODO)

| Limite | Slice |
|---|---|
| No Sonnet mock e2e test pipeline | B.1 |
| No 24h reminder mid-flow ("ehi tutto ok? completa qui") | B.1 |
| No `/dashboard/bookings/[id]` con thread + responses dettaglio | C |
| Reinvio link dalla dashboard (regenera token) | B.1 |
| Solo IT/EN | B.2 quando arrivano host non-italiani |
| Weather API forecast nella thanks screen | nice-to-have |
| Settings host: editor template messaggio iniziale | B.2 |

## Deploy

1. **Env Fly**:
   - `SURVEY_TOKEN_SECRET` (min 32 char, generate via `openssl rand -base64 48`)
   - `OPERATOR_EMAIL` (Andrea)
   - `RESEND_API_KEY` (gia' setup slice 6.5.1)
   - `NEXT_PUBLIC_BASE_URL` (`https://premura.it`)
2. **Migration**: `DATABASE_URL=<staging> pnpm db:migrate` (applica 0018)
3. **Smoke**: `/dashboard/upcoming-checkins` mostra colonna Survey.
4. **Manuale**: enqueue `send-link` per booking specifica → verifica WA arrivato → click link su mobile → tap through → verifica DB.
