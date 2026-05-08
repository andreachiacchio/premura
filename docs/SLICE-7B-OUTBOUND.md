# Slice 7B — Outbound WhatsApp pipeline

Chiude il loop di Pipeline 1: l'host approva un `reply_draft` dalla
dashboard → il messaggio parte via WhatsApp Cloud API → il webhook
riceve gli status events (delivered/read/failed) e li propaga sul DB.

## Stato pre-7B

- Slice 7a.1 (PR #25): webhook inbound `/webhooks/whatsapp` HMAC + persist
- Slice 11 (PR #36): draft generator Sonnet → `pending_drafts` kind=`reply_draft`
- Slice 7a.4 (PR #37): connector inbound → BullMQ → draft pipeline
- ReplyDraftCard UI: bottoni Invia / Modifica / Scarta presenti ma
  cliccare "Invia" aggiornava solo il DB (status=approved + insert
  messages outbound). **Niente call Meta**, niente delivery tracking.

## Cosa fa slice 7B

### 1. DB schema

Migration `0016_pending_drafts_outbound.sql`:

- Aggiunge a `pending_draft_status` enum: `sent`, `failed`
- Aggiunge a `pending_drafts` colonne:
  - `sent_at` — timestamp 200 da Meta (separato da `approved_at`)
  - `rejection_reason` — testo opzionale all'click Scarta (max 500 char)
  - `meta_message_id` — wamid Meta (cross-ref con `messages.platform_message_id`)
  - `error_log` — ultimo body errore Meta (4xx body o 5xx finale)
  - `retry_count` — contatore tentativi (default 0; max 1 retry inline su 5xx/429)
- Index su `meta_message_id` per webhook status lookup

### 2. Meta Cloud API client

`packages/integrations/src/whatsapp-business.ts`:

- Bumped da `v21.0` a `v25.0` (latest stable maggio 2026)
- Env vars rinominate `WHATSAPP_*` → `META_*` con fallback compat
- Lazy env read (`getEnv()`) invece di module-load (test friendly)
- Nuova classe `WhatsappSendError` con field `retryable`:
  - 4xx → non recuperabile (auth, payload, recipient invalid)
  - 5xx + 429 → transiente, retry
- Nuova `parseStatusEvents(payload)` per estrarre array `statuses` da
  webhook payload Meta (parallelo all'array `messages` esistente)

### 3. Server action approve flow

`apps/web/lib/repositories/reply-drafts.ts` `approveAndSendReplyDraft`:

```
SELECT draft + booking.guestPhone + inbound channel (single JOIN)
  → not_found            (draft inesistente)
  → already_sent         (status gia' sent/approved/modified, idempotent)
  → no_guest_phone       (booking senza guest_phone)
  → channel_not_supported (per ora solo whatsapp; email/booking_inbox V2)

UPDATE pending_drafts SET status=approved WHERE status=pending  (lock atomico)
  → race lost            (qualcuno l'ha gia' approvato → re-leggi metaMessageId)

CALL Meta sendText(guest_phone, body)
  → 4xx                  → status=failed, error_log
  → 5xx/429 + retry      → 1x retry con 1s backoff
  → 5xx/429 dopo retry   → status=failed, error_log, retry_count=1
  → 200                  → segue

INSERT messages (outbound, platformMessageId=wamid, sentAt, recipientExternalId)
UPDATE pending_drafts SET status=sent, sent_at, meta_message_id, retry_count
```

Idempotenza:
- Lock atomico `WHERE status=pending`: doppio click non fa doppio invio.
- Re-leggi `metaMessageId` su lock perso → ritorna `already_sent`.
- Retry inline cap a 1 (TODO: BullMQ retry per resilienza piu' robusta).

`rejectReplyDraft(db, draftId, hostId, reason?)`: aggiunge `rejection_reason`
opzionale (max 500 char). Status='rejected'.

### 4. Server actions UI-facing

`apps/web/app/dashboard/actions.ts`:

- `approveReplyDraftAction(draftId)` ritorna `ApproveActionResult`:
  ```ts
  { ok: true, metaMessageId } | { ok: false, reason, detail? }
  ```
  con `reason` ∈ `not_found | no_guest_phone | channel_not_supported | send_failed`.
  Sostituisce il `Promise<void>` precedente cosi' la UI mappa toast specifici
  invece di throw generico.
- `editAndSendReplyDraftAction(draftId, finalBody)` stesso pattern.
- `rejectReplyDraftAction(draftId, reason?)` accetta reason opzionale.

### 5. Status webhook handler

`apps/api/src/api/webhooks/whatsapp-status-persist.ts`:

- `applyOutboundStatusUpdate({ wamid, status, timestamp, errorMessage })`
- Lookup `messages.platform_message_id = wamid` → no_match se outbound
  non nostro (skip silenzioso).
- Update messages timestamp idempotente:
  - `delivered` → `delivered_at`
  - `read` → `read_at` (+ `delivered_at` se mancante, race fast)
  - `failed` → `failed_at` + `failure_reason`
- Lookup `pending_drafts.meta_message_id = wamid` → propaga `failed`
  status (con `error_log`).

`apps/api/src/api/webhooks/whatsapp.ts` chiama il handler in parallelo
ai messages: stesso payload puo' contenere sia inbound che statuses,
processiamo entrambi.

### 6. UI ReplyDraftCard

`apps/web/app/dashboard/_components/ReplyDraftCard.tsx`:

- `handleSend` / `handleEditSubmit` ora consumano `ApproveActionResult`
  e mostrano errori user-friendly (`reasonToMessage`).
- `handleReject` accetta reason opzionale.
- Reject button: `window.confirm` minimale (slice 7B v1).
  TODO 7B.1: modal con dropdown ("non contestuale" / "tono sbagliato"
  / "ho gia' risposto a mano" / altro).

## Test

20 nuovi:

- `apps/web/tests/reply-drafts-outbound.test.ts` (12) — happy path,
  not_found, no_guest_phone, channel_not_supported, 4xx no-retry,
  5xx retry success, 5xx retry exhausted, idempotency, race condition,
  rejectReplyDraft con/senza reason.
- `apps/api/tests/whatsapp-status-persist.test.ts` (8) — no_match,
  delivered/read/failed, idempotency (already applied), failed
  twice no double-update.

Mock pattern Drizzle stub: `select().from().where().limit()`,
`update().set().where().returning()`. Mock Meta sendText con vi.mock.

**Totale suite: 452 verdi (396 monorepo + 56 web).**

## Limiti slice 7B v1 (TODO follow-up)

- **Retry inline 1x** invece di BullMQ queue. Una caduta Meta lunga 30s
  non recovery automaticamente (host deve riapprovare). Slice 7B.1:
  worker `apps/api/src/jobs/whatsapp-send-worker.ts` con backoff
  esponenziale 30s/2min/10min, max 3 retry, dead-letter su `failed`.
- **Solo canale whatsapp** outbound. Email outbound (slice 7c) e
  Booking/Airbnb inbox (read-only, deflection only) restano da fare.
- **Reject reason UI** minimale (`window.confirm`). Slice 7B.1: modal
  dedicato.
- **Status badges sulla card** non aggiornati (la lista mostra solo
  `status=pending` per design — quando `sent` la card scompare).
  Sezione "Inviati di recente" arriva con slice 11.1.

## Test plan deploy

1. Migration: `pnpm db:migrate` (richiede `DATABASE_URL` con privilegi).
2. Smoke staging: dalla dashboard, draft pending → click Invia. Atteso:
   - Card scompare dalla lista pending.
   - Su Meta dashboard: messaggio inviato a `+39 338 396 3307` (test
     number Andrea).
   - DB: `pending_drafts.status=sent`, `meta_message_id=wamid.*`,
     `messages` row outbound con `platform_message_id=wamid.*`.
3. Verifica delivery: dopo ~5s, `messages.delivered_at` popolato (Meta
   webhook `delivered`).
4. Verifica failure path: usare numero invalido (es. `+391234567890`)
   → atteso `pending_drafts.status=failed`, `error_log` con Meta 400 body.
