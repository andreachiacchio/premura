# Slice B — Pre-arrival survey conversazionale

Seconda slice della roadmap V1. Per ogni booking attivato (slice A,
`premura_active_at IS NOT NULL`), Premura manda WhatsApp al guest 7
giorni prima del check-in con survey conversazionale 3-domande:

1. Occasione speciale? (anniversary / birthday / honeymoon / business / family / other / none)
2. Allergie o preferenze alimentari?
3. Cosa farebbe piacere trovare in casa? (caffè, tè, dolci, vino, frutta, altro)

Output salvato in `guest_quizzes.responses` per consumo dello slice C
(kit composer).

## Architettura

### DB — migration 0018_guest_quizzes_conversational

`guest_quizzes` esistente (originalmente "swipe quiz" milestone 4.4)
estesa per supportare formato conversazionale:

| Colonna | Tipo | Note |
|---|---|---|
| `skipped_reason` | VARCHAR(32) | `'no_response_96h'` / `'guest_declined'` / `'manual'` |
| `conversation_messages` | JSONB array | Turn-by-turn `{role, content, ts}` |
| `language` | VARCHAR(8) NOT NULL DEFAULT `'it'` | Determinata al send-time |
| `last_outbound_at` | TIMESTAMPTZ | Ultimo turno premura, per timeout cron |
| `last_inbound_at` | TIMESTAMPTZ | Ultimo turno guest |

Le 3 risposte estratte vivono in `responses` esistente (jsonb), shape:
```ts
{ specialOccasion, foodAllergies, preferences }
```

Index `guest_quizzes_pending_idx` per query fast cron timeout.

### Survey conductor agent (Sonnet 4.6)

`packages/agents/src/survey-conductor.ts`:
- Tool_use forzato → output strutturato `{message, extracted, completed, declined}`
- Cache_control ephemeral su system prompt (~70% saving cost dopo primo turn)
- 1500 token system + history, 200 token output → ~€0.004/turn

Prompt richiede:
- Una domanda per turno
- Tone caldo + professional italiano (anche in EN)
- No emoji eccetto messaggio chiusura
- Riconoscere intent declined ("non voglio", "stop")
- Riconoscere intent off-topic (e gestirlo riportando alla domanda)

### Pipeline (`packages/agents/src/survey-pipeline.ts`)

Funzioni:
- `findBookingsForSurveySend(db, now?)` — query cron "+7gg window" + filter `guest_phone NOT NULL` + no-survey-yet
- `buildFirstMessage` / `buildNudgeMessage` — template deterministici (no LLM)
- `startSurvey(db, candidate)` — insert guest_quizzes + record outbound (idempotente)
- `findActiveSurvey(db, bookingId)` — lookup per webhook routing
- `processSurveyInbound(db, input)` — orchestrazione 1 turn: Sonnet → merge extracted → persist → ritorna reply + status
- `findStaleSurveys(db)` — cron timeout: nudge dopo 48h, abandon dopo 96h
- `markSurveyAbandoned`, `recordSurveyOutbound` — helpers

### apps/api wiring

**Cron** (`survey-cron.ts`): `'0 9 * * *'` Europe/Rome. Tick:
1. `findBookingsForSurveySend` → enqueue `send-first` per ogni candidato
2. `findStaleSurveys` → enqueue `send-nudge` o `mark-abandon`

**Queue** (`survey-queue.ts`): `pre-arrival-survey`. Job types:
- `send-first` — primo messaggio + insert guest_quizzes
- `send-nudge` — re-invio dopo 48h
- `mark-abandon` — skip dopo 96h
- `process-inbound` — turn agent + reply

JobId fissi: `survey:first:{bookingId}`, `survey:nudge:{quizId}`, `survey:abandon:{quizId}`, `survey:inbound:{messageId}`. Idempotency a livello BullMQ + DB (status check).

**Worker** (`survey-worker.ts`): wrappa `processSurveyJob` (handler puro testabile) con DB lifecycle + structured logging. Concurrency 2.

**Webhook routing** (`whatsapp.ts`): dopo `persistInboundMessage`, prima di enqueue draft-generation, controlla `findActiveSurvey(db, bookingId)`. Se esiste → enqueue `process-inbound` su survey-queue, skip draft. Altrimenti → enqueue draft-generation (legacy slice 7a.4).

### Email notification (Resend)

`notifyOperatorSurveyCompleted` in `survey-handler.ts`. Lazy import Resend SDK.

Trigger: alla `processInbound` con `status='completed'`.

Dest: `OPERATOR_EMAIL` env (default `andrea.chiacchio@premura.it`).

Subject: `Premura — Survey {guest_name} completata`.

Body: HTML con risposte estratte + link a `/dashboard/bookings/{id}` (route futura per kit gen).

### UI

`/dashboard/upcoming-checkins` (slice A esistente) estesa con colonna **Survey**. Badge stati:
- 🔘 "In coda" (sent_at NULL) — sara' inviata al cron tick prima dei 7gg pre-checkin
- 🟡 "Inviata" (sent_at NOT NULL, completed_at NULL)
- 🟢 "Completata" (completed_at NOT NULL)
- 🟠 "Saltata" (skipped_at NOT NULL)

## Flow end-to-end

1. **T-7gg**: cron 09:00 trova booking → `send-first` job.
2. **Worker**: `startSurvey` insert guest_quizzes + sendText Meta Cloud.
3. **Guest risponde**: webhook `/webhooks/whatsapp` riceve → persist messages → `findActiveSurvey` ritorna quiz attivo → enqueue `process-inbound`.
4. **Worker**: carica context → `conductSurveyTurn` Sonnet 4.6 → merge extracted → persist conversation + responses → sendText reply.
5. **Iterate**: 2-3 round per raccogliere tutte e 3 le info.
6. **Completion**: agent emette `completed: true` → `processSurveyInbound` setta `completed_at` → `notifyOperatorSurveyCompleted` email Andrea.
7. **Decline**: agent emette `declined: true` → `skipped_at + skipped_reason='guest_declined'`.
8. **Timeout 48h** (no risposta): cron enqueue `send-nudge` → re-invia messaggio "no pressure".
9. **Timeout 96h** (ancora no risposta): cron enqueue `mark-abandon` → `skipped_reason='no_response_96h'`.

Slice C (kit composer) consuma `responses` dei booking con `completed_at NOT NULL` per generare proposta omaggio.

## Test

419 vitest verdi totali (+4 nuovi):
- `packages/agents/tests/survey-pipeline.test.ts` (4): `buildFirstMessage` IT/EN, `buildNudgeMessage` IT/EN.
- Test esistenti: 415 invariati.

Test piu' profondi (Sonnet mock end-to-end + Drizzle mock complete) sono out-of-scope per slice B v1: target 5h. Coperti via local manual smoke quando il numero pilota e' migrato.

## Limiti V1 (TODO)

| Limite | Slice |
|---|---|
| No mock Sonnet test pipeline end-to-end | B.1 |
| No `/dashboard/bookings/[id]` page con conversation thread | C |
| No editor template messaggio iniziale per host | B.2 |
| Survey solo IT/EN (no FR, ES, DE) | B.2 quando arrivano host non-italiani |
| No re-invio manuale survey dalla dashboard | B.1 |
| Email notification senza preferenze per Andrea (volume?) | B.1 if necessario |

## Deploy

1. Migration: `DATABASE_URL=<staging> pnpm db:migrate` (riusa script DEBT-1, applica 0018).
2. Env vars Fly: `OPERATOR_EMAIL` (Andrea), `RESEND_API_KEY` (gia' setup slice 6.5.1).
3. Smoke staging: dashboard → /upcoming-checkins → vedo colonna "Survey" badge "In coda" per booking T+7gg.
4. Manuale via tsx `apps/api/scripts/manual-poll.ts` (futuro): enqueue `send-first` per booking specifica → verifica messaggio Meta arrivato a tester.
5. Reply test: guest tester risponde da WA → verifica `process-inbound` → reply Sonnet visibile in chat.
