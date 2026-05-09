# Slice C — Kit generation + approval workflow

> **Stato:** in implementazione (PR draft `claude/slice-c-kit-generation`).
> **Data inizio:** 9 maggio 2026.
> **Modello operativo:** Concierge Operator V1 — host vede UI clean
> 1-tap, Andrea founder è operatore manuale (no Amazon API, no Glovo
> API, niente automazione fulfillment).
> **Scope pilot:** 3 B&B Andrea (La Goccia, Napoli Sotterranea, Villa
> Cristina) + cleaner Karen.

## 1. Cosa fa lo slice in 30 secondi

1. **Genera proposta kit** (Sonnet 4.6) post-survey: theme + storytelling
   IT/EN + 1-8 items + card_message IT/EN + budget rispettato.
2. **Notifica founder via email** (`kit_proposed`) con link dashboard.
3. **Founder approva / rifiuta / modifica** via `/dashboard/kits/[id]`.
4. **Founder esegue ordini manuali** via `/dashboard/kits/[id]/execute`
   raggruppati per fonte (Amazon Business / Glovo same-day / manuali).
5. **Click "Tutto ordinato → notifica Karen"**: invia WA brief italiano
   alla cleaner via Cloud API, marca `cleaner_briefed_at`, status →
   `ordering`. Email founder `kit_approved` (T-1).
6. **Karen risponde 👍** (qualunque inbound da suo numero): webhook
   matcha cleaner, marca `cleaner_accepted_at`. Email founder
   `cleaner_confirmed`.
7. **Founder avanza status manualmente** dallo /execute (in_transit →
   arrived_at_locker → picked_up_by_cleaner → set_up). Foto setup
   carica → email founder `cleaner_uploaded_photo`.
8. **delivered_to_guest** chiude lo slice (welcome message gestito da
   slice E successivo).

## 2. Architettura

### Schema (migration 0019)

`kits` esteso con 13 colonne audit + 11 nuovi `kit_status` enum
(coesistenti coi legacy V1 per backward-compat):

```
proposalGeneratedAt     TIMESTAMP
approvedAt              TIMESTAMP
approvedBy              UUID FK hosts(id)
rejectedAt              TIMESTAMP
rejectionReason         TEXT
modificationLog         JSONB[]   {field,oldValue,newValue,modifiedAt,modifiedBy}
generatorAgentVersion   VARCHAR
generatorCostUsd        NUMERIC(8,6)
guestLanguage           VARCHAR DEFAULT 'it'
storytellingIt          TEXT
storytellingEn          TEXT
rationale               TEXT
cardMessageEn           TEXT
```

Nuovi enum status:

```
pending_survey, proposed, approved, rejected, modified,
ordering, in_transit, arrived_at_locker, picked_up_by_cleaner,
set_up, delivered_to_guest
```

`property_knowledge.kit_default_placement TEXT NULL` — override "dove
lasciare il kit" nel WA brief Karen (default code-side: "tavolo
cucina").

`kits_status_proposal_idx` — query lista founder ordinata per
proposalGeneratedAt.

### Items (JSONB)

`KitItem` è un union di legacy V1 (sku, qty, supplier, ecc.) e slice C:

```ts
type KitItem = {
  taxonomyKey?: string;
  specificDescription?: string;
  quantity?: number;
  estimatedPriceEur?: number;
  fonte?: 'amazon' | 'glovo' | 'manual_print' | 'manual_write';
  leadTime?: 'same_day' | '1_day' | '2_days' | '1_hour';
  amazonSearchHint?: string;
  glovoSearchHint?: string;
  reasoning?: string;
  executedAt?: string | null;
  // ...legacy V1 fields tutti opzionali
};
```

### Tassonomia hardcoded V1 (`packages/agents/src/kit-generator/items-taxonomy.ts`)

13 entries divise:

- **Glovo same-day** (3): pasticceria_fresca_napoletana,
  fiori_freschi_piccolo_mazzo, frutta_fresca_stagionale.
- **Amazon Business 2-day** (8): caffe_napoletano_confezionato,
  vino_locale_campania, liquore_locale, cioccolato_artigianale,
  prodotto_iconico_napoli, acqua_minerale_premium, te_premium,
  prodotto_kids_baby.
- **Manuale** (3): mappa_personalizzata_stampata,
  biglietto_manoscritto, guida_napoli_curata.

Ogni entry: `fonte`, `leadTime`, `examples[]`, `typicalPriceEur
{min,max,perPerson?}`. Il founder sceglie ASIN preciso al momento
dell'ordine.

### Budget tier

`computeKitBudgetEur({ nights, hostPayoutEur })`:

```
1-2 notti  → min(hostPayout * 0.07, 12 €)
3-5 notti  → min(hostPayout * 0.06, 18 €)
6+ notti   → min(hostPayout * 0.05, 30 €)
```

### Agent kit-generator (Sonnet 4.6)

`packages/agents/src/kit-generator/kit-generator-agent.ts`.

- Tool use forzato `emit_kit_proposal` (theme, storytelling_it/en,
  items[1-8], cardMessage_it/en, totalEstimatedEur, rationale).
- Cache control ephemeral su system prompt (riduce ~70% costo su
  generazioni multiple stessa giornata).
- Validazione output via Zod, fail-loud su shape sbagliata.
- Cost tracking: input 3 $/Mtok, output 15, cache_write 3.75, cache_read
  0.3. Atteso ~€0.05-0.08 per kit.
- `KIT_GENERATOR_VERSION = '2026-05-09-v2'` versione prompt corrente
  (con vincoli storytelling tone + card 15-word limit).

System prompt vincoli chiave (vedi `kit-generator-agent.ts`
`SYSTEM_PROMPT`):

1. **Budget** target enforced.
2. **Adaptive logic**: occasion (anniversary/birthday/honeymoon/family/
   business), allergies (esclude categorie incompat.), preferences
   (1 item match), numChildren (kids item).
3. **Tone storytelling**: caldo italiano-mediterraneo, NO marketing-
   speak ("experience"/"amazing"/"unforgettable"), 2-3 frasi max.
4. **Card message**: max 15 parole, firmato `— {hostFullName}`,
   no emoji, esempi accept/reject in prompt.
5. **Mix consigliato**: 1-2 fresh Glovo + 1-2 packaged Amazon + 1
   manual = 3-5 item totali.

### Pipeline orchestrator

`triggerKitProposal(db, bookingId)` in `kit-pipeline.ts`:

1. Fetch context (booking + property + host + survey responses).
2. Skip se nessun booking / nessuna survey completata / kit già
   proposto (idempotente — solo `pending_*` riusato).
3. Computa `budgetTargetEur` da nights + hostPayout.
4. Chiama `generateKitProposal()`.
5. Upsert kit con `status='proposed'` + audit.

Discriminated result: `'generated' | 'skipped_no_booking' |
'skipped_no_survey' | 'skipped_already_proposed' | 'generator_error'`.

### Auto-trigger post-survey

`apps/web/app/s/[token]/actions.ts` — dopo `submitSurvey()` con
`alreadySubmitted=false`, fire-and-forget `triggerKitProposal()`.
La response al guest non aspetta i ~10-20s del Sonnet call.

### Server actions (`apps/web/app/dashboard/kits/actions.ts`)

7 actions, tutte con ownership host verificata via repository
JOIN `properties.host_id = currentHostId`:

| Action | Effetto | Email |
|---|---|---|
| `generateKitProposalAction(bookingId)` | manual trigger UI | `kit_proposed` |
| `approveKitAction(kitId)` | status → approved + approvedBy | `kit_approved` |
| `rejectKitAction(kitId, reason)` | status → rejected + reason | — |
| `modifyKitItemsAction(kitId, payload)` | status → modified + modificationLog | — |
| `toggleItemExecutedAction(kitId, idx)` | items[idx].executedAt toggle | — |
| `markCleanerBriefedAction(kitId)` | sendCleanerBrief + status → ordering | (cleaner_confirmed quando Karen risponde) |
| `updateKitStatusAction(kitId, status)` | transition whitelist | `cleaner_uploaded_photo` per set_up |

Tutte loggano in `agent_actions` (audit trail).

### WA brief Karen (`cleaner-brief.ts`)

Lingua **solo italiano** (Karen è italiana, no detection).

Template:

```
Ciao {cleanerFullName} 👋
Kit per {propertyName} - check-in {DD/MM HH:mm}

📦 RITIRO:
- Amazon Locker {locker} dal {DD/MM}            ← se Amazon items
- Mattina check-in ordino io Glovo a casa tua    ← se Glovo items

🎯 SETUP RICHIESTO ({propertyName}):
- {item.specificDescription}                     ← per ogni item
- Biglietto manoscritto: scrivi a mano "{cardMessage}" sul biglietto pre-stampato

📋 DOVE LASCIARE: {kit_default_placement || "tavolo cucina"}

📸 PRIMA di uscire: foto del setup completo + carica nell'app Premura

💰 €2 cumulativo a fine mese

Tutto chiaro? Confermami con 👍
```

`sendCleanerBrief(db, kitId)`:

- Fetch kit + booking + property + cleaner + property_knowledge.
- Compose template.
- `sendText(cleaner.whatsappNumber, brief)` via Meta Cloud API v25.
- Set `cleanerBriefedAt = now()`, status → `ordering`.
- Idempotent: skip se già briefed.

### Reply detection (`handleCleanerReplyForKitAcceptance`)

Wired in `apps/api/src/api/webhooks/whatsapp.ts` su orphan_inserted
(no booking match):

1. Match `cleaner.whatsappNumber` su last 9 digits del `from`.
2. Find kit briefed-non-acceptato per properties di quel cleaner.
3. Set `cleanerAcceptedAt = now()`.
4. Email founder `cleaner_confirmed` (best-effort).

### Email founder (`kit-emails.ts`)

4 templates via Resend, from `noreply@premura.it`, to `hosts.email`:

| Kind | Subject | Quando |
|---|---|---|
| `kit_proposed` | 🎁 Nuovo kit pronto per approvazione | post agent generation |
| `kit_approved` | ✅ Kit approvato — cosa devi ordinare | post approveKit |
| `cleaner_confirmed` | 👍 Karen ha confermato | post cleaner reply |
| `cleaner_uploaded_photo` | 📸 Foto setup pronta | post status=set_up |

XSS-safe (escapeHtml su tutti gli user input).

## 3. UI

### `/dashboard/kits` (lista)

- 5 tab filtrate per status: Da approvare (proposed+modified) /
  Approvati / In esecuzione (ordering+in_transit+arrived+picked_up) /
  Consegnati (set_up+delivered) / Rifiutati.
- Badge counter per tab.
- Riga per kit: guest + property + check-in + budget + item count.
- Click → detail.

### `/dashboard/kits/[kitId]` (detail)

- Header booking + StatusTimeline 8-step orizzontale.
- Tema (editabile in modifica).
- Storytelling IT/EN (read-only, da agent).
- Items list con qty + price (editabile inline).
- Card message IT + EN (editabili, max 300 char).
- Rationale agent (collassabile).
- CTA sticky bottom: **Approva e procedi** / **Modifica** /
  **Rifiuta** (con textarea reason).
- Audit modificationLog collassato.

### `/dashboard/kits/[kitId]/execute` (operator)

- Header + StatusTimeline.
- 3 sezioni grouped per fonte:
  - 🛒 Amazon Business (X items, deadline T-2g): per ogni item link
    `https://amazon.it/s?k={searchHint}` + button "Marca ordinato"
    toggle `executedAt`.
  - 🚲 Glovo (X items, mattina check-in): link
    `https://glovoapp.com/it/it/napoli/s?query={searchHint}` +
    "Marca ordinato".
  - ✋ Manuali: card preview cardMessage per `manual_write`,
    placeholder PDF per `manual_print`.
- CTA bottom **🚀 Tutto ordinato → notifica Karen** disabled finché
  ogni item ha `executedAt`.
- Post-brief: bottoni "Marca: in transito / arrivato / ritirato /
  allestito / consegnato" filtrate sulla whitelist transizioni.

### Dashboard card

`KitsApprovalCard` mostrata su `/dashboard` quando ci sono kit
proposed+modified. Link diretto a `/dashboard/kits`.

## 4. Test (`packages/agents/tests/`)

| File | Tests | Cosa copre |
|---|---|---|
| `kit-budget-tier.test.ts` | 8 | computeKitBudgetEur tier + boundaries |
| `cleaner-brief.test.ts` | 14 | composeCleanerBrief output, sezioni condizionali, default placement, helpers Amazon/Glovo URL |
| `kit-emails.test.ts` | 10 | renderTemplate per 4 kind, XSS escape, photoUrl handling |

Tutti sono **pure-function tests** (no DB, no Resend, no Anthropic
SDK). 32 nuovi, 461 totali tutti verdi.

## 5. Definition of Done

Funzionali:

- [x] Migration 0019 + property_knowledge.kit_default_placement
- [x] Trigger automatico kit-generator post-survey-completion
- [x] Manual trigger via `generateKitProposalAction`
- [x] 7 server actions ownership-verified
- [x] /dashboard/kits lista filtrata per status con tab
- [x] /dashboard/kits/[id] page editabile con approve/reject/modify
- [x] /dashboard/kits/[id]/execute con raggruppamenti + checkmark + WA brief
- [x] WA brief Karen (italiano, copy esatto)
- [x] 4 email Resend (kit_proposed, kit_approved, cleaner_confirmed, photo)
- [x] Status timeline visivo
- [x] Cleaner reply detection da WA inbound webhook → cleanerAcceptedAt

Tecnici:

- [x] Test budget tier (8)
- [x] Test composeCleanerBrief (14)
- [x] Test renderTemplate emails (10)
- [x] Tutti test esistenti verdi (461 / 461)
- [x] Typecheck apps/web + apps/api puliti
- [x] Biome clean su tutti i file slice C

Mancante (deferred):

- [ ] Test agent kit-generator con mock Anthropic (richiede setup
  fixture; valore basso vs costo, demando a integration test post-merge)
- [ ] Test E2E Playwright completo proposed → approved → executed →
  cleaner notified (idem, integration test)
- [ ] Smoke test produzione (ambiente Andrea)

## 6. Costi e cap

- Sonnet 4.6 input 3 $/Mtok, output 15. Cache read 0.3. Cache write
  3.75.
- ~4K input + 1K output per kit ≈ $0.027 (no cache) → $0.005 a
  cache hit.
- ~€0.05-0.08 stimato per kit con assumption 50% cache hit pilot.
- WA Cloud API: service conversation €0.004 → trascurabile.
- Resend: 3000 email/mese gratis tier corrente.

## 7. Limitazioni V1 accettate

1. **Nessun Amazon API**: founder fa ordine manuale via UI link.
   Stima ASIN/prezzo a tempo di proposal, riconciliazione manuale
   alla consegna (`actualPriceEur` opzionale, V2 hook).
2. **Nessun Glovo API**: founder ordina via web/app Glovo a mano.
3. **Manual_print PDF**: button placeholder ("Scarica PDF") non
   funzionante in V1 — il founder stampa il PDF a mano.
4. **No deeplink mobile Glovo**: link va al web Glovo Napoli.
5. **No automazione status `in_transit` → `arrived_at_locker`**:
   founder li avanza manualmente (no Amazon Locker tracking API
   per la pilot scale).
6. **No reminder email founder**: se founder ignora `kit_proposed`
   per giorni, niente nudge automatico (V2: cron 24h pre-checkin).
7. **No photo upload UI** in /execute: per il photo `set_up` Karen
   manda WA → founder copia URL → UI updateStatus. V2: photo
   upload diretto da WA persist.

## 8. Riferimenti

- `CONTEXT.md` §5 — economia kit, zero markup.
- `docs/SLICE-B-SURVEY-TAP-APP.md` — survey upstream.
- `packages/db/src/migrations/0019_kits_proposal_workflow.sql` —
  schema diff.
- `packages/agents/src/kit-generator/` — agent + composer + emails.
- `apps/web/app/dashboard/kits/` — UI (list/detail/execute) + actions.
- `apps/api/src/api/webhooks/whatsapp.ts` — cleaner reply hook.

---

**PR draft:** [`claude/slice-c-kit-generation`](https://github.com/andreachiacchio/premura/tree/claude/slice-c-kit-generation).
**Decisioni aperte rimaste:** nessuna (tutti i punti spec coperti).
