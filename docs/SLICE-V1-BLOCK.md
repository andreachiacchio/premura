# V1 Block — Self-service totale

> **Stato:** in implementazione (5 slice sequenziali su branch `claude/v1-block-self-service`).
> **Obiettivo:** nuovo host firma, viene guidato da onboarding wizard fino a configurazione completa, poi gestisce TUTTO via UI: property, knowledge, cleaner, kit, conversazioni guest. NIENTE SQL diretto da Andrea.

## 1. Cosa fa in 30 secondi

1. Nuovo host signup → atterra su **wizard 5 step** (welcome → property → calendar → knowledge → cleaner → done).
2. Da quel momento gestisce:
   - **Cleaner** via `/dashboard/cleaners` (CRUD + magic link app cleaner).
   - **Property knowledge** via `/properties/[id]/knowledge` (sezioni + AI parser Haiku 4.5 + foto upload).
   - **Kit** via slice C `/dashboard/kits` (già live).
3. Karen apre PWA mobile `/c/*` via magic link WA, vede kit assegnati, carica foto setup.
4. Mattina del check-in, cron automatico manda al guest WhatsApp con foto kit + messaggio personalizzato.

## 2. Slice del blocco

| Slice | Scope | PR | Status |
|---|---|---|---|
| **F** | Cleaner Management UI (CRUD + dashboard card) | #45 | ✅ merged |
| **G** | Property Knowledge UI completa + AI parser Haiku 4.5 + foto upload | #46 | ✅ merged |
| **H** | Onboarding wizard 5-step | #47 | ✅ merged |
| **D** | Karen PWA mobile (magic link + foto setup) | #48 | ✅ merged |
| **E** | Welcome message check-in automatico | #49 | 🟡 draft |

## 3. Architettura

### Schema DB (migrations 0020-0023)

| Migration | Tabella | Cambiamenti chiave |
|---|---|---|
| 0020 | `cleaners` | `email` text, `notes` text, `language_preferred` ('it'/'en'/'es'), `karen_accepted` bool |
| 0021 | `property_knowledge` | `check_in_instructions`, `check_out_instructions`, `local_tips_curated_host` jsonb, `house_photos` jsonb, `language_default` |
| 0022 | storage.buckets | `property-photos` (10MB) + `kit-setup-photos` (5MB) + RLS policies. **Manuale fallback Supabase SQL Editor** (vedi `STORAGE-BUCKETS.md`) |
| 0023 | `kits` + `hosts` | `kits.welcome_message_sent_at`; `hosts.welcome_auto_send` bool, `hosts.welcome_time_slot` varchar(5) |

### Agent packages

- **`@premura/agents/knowledge-parser`**: Haiku 4.5 `parseKnowledgeFromText` (~€0.005/parse), estrazione strutturata wifi/keybox/parking/tips/contatti.
- **`@premura/agents/cleaner-auth`**: `signCleanerToken` / `verifyCleanerToken` HS256 + `sendCleanerMagicLink` via WA Cloud API. TTL 30 giorni, secret `CLEANER_TOKEN_SECRET`.
- **`@premura/agents/welcome-message`**: `findKitsForWelcomeMessage` finder + `generateWelcomeMessage` template fisso IT/EN. Voice profile integration rimandata.
- **`@premura/integrations/whatsapp-business`**: `sendImage(to, imageUrl, caption?)` per welcome message con foto.

### apps/web routes

| Route | Scope | Slice |
|---|---|---|
| `/dashboard/cleaners` (list/new/[id]/edit) | CRUD cleaner + assign property + welcome WA | F |
| `/dashboard/kits` | (legacy slice C) approvazione + execute | C |
| `/dashboard/settings` | Toggle auto-send welcome + time_slot | E |
| `/properties/[id]/knowledge` | UI sezioni + LocalTipsEditor + foto upload + AI assistant modal | G |
| `/onboarding/{welcome,property,calendar,knowledge,cleaner,done}` | Wizard 5-step | H |
| `/c/[token]` | Magic link landing cleaner (set cookie + redirect) | D |
| `/c/dashboard` | Kit cleaner (tab Oggi/Settimana/Completati) | D |
| `/c/kit/[id]` | Detail kit per cleaner (human-readable) | D |
| `/c/setup/[id]` | Foto setup camera + compress 1280px JPEG 0.85 + upload | D |
| `/c/profile` | Profilo cleaner + Add-to-Home + logout | D |
| `/c/{error,bye}` | Landing pages token invalido / logout | D |
| `/c/manifest.json`, `/c/icon-{192,512}.svg` | PWA manifest + icone SVG dinamiche | D |

### apps/api jobs

| Job | Trigger | Scope |
|---|---|---|
| `welcome-message-cron` | `*/30 8-11 * * *` Europe/Rome (8 tick/day) | E |
| `welcome-message-queue` (BullMQ) | enqueue via cron | E |
| `welcome-message-handler` | per kit candidato: generate + `sendImage` WA + markSent | E |
| `welcome-message-worker` | concurrency 2 | E |

## 4. Decisioni V1 (chiuse Andrea)

| Q | Decisione |
|---|---|
| PWA boundary slice D | **leggera**: manifest.json + Add-to-Home + responsive mobile-first. NO Service Worker / IndexedDB offline. V2 upgrade. |
| Auth cleaner | Token JWT HS256 signed (secret env), TTL 30 giorni, cookie `c_session` httpOnly + sameSite lax + maxAge 30d. |
| AI parser knowledge | **Haiku 4.5** (`claude-haiku-4-5-20251001`), tool_use forced. ~€0.005/parse, 8x cheaper di Sonnet, qualità sufficiente per estrazione strutturata. |
| Storage bucket | `property-photos` 10MB + `kit-setup-photos` 5MB, public read (path UUID random) + service_role insert/delete. Fallback procedurale via Supabase SQL Editor se Drizzle migrate fallisce per privilegi schema `storage`. |
| Welcome message voice profile | **Template fisso IT/EN** in V1, voice profile rimandato a slice futura quando avremo voice profile estratto affidabilmente. |
| PR strategia | 5 PR sequenziali su stesso branch, ogni una rebased su main aggiornato. Review chirurgica + deploy incrementale. |

## 5. Costi operativi

| Componente | Costo per evento | Note |
|---|---|---|
| AI parser knowledge (Haiku 4.5) | ~€0.005 | input ~3K + output ~600 token |
| Kit generator (Sonnet 4.6, slice C) | ~€0.05-0.08 | input 4K + output 1K |
| WhatsApp service conversation | ~€0.004 | Meta v25 |
| Resend email | free tier 3K/mese | trascurabile V1 |

## 6. Definition of Done (block-level)

### Funzionali
- [x] Slice F merged: cleaner CRUD UI + dashboard card
- [x] Slice G merged: property knowledge UI + AI parser + photo upload
- [x] Slice H merged: onboarding wizard 5 step
- [x] Slice D merged: Karen PWA + magic link
- [ ] Slice E merged: welcome message cron + sendImage

### Tecnici
- [x] 51 test files, 496 tests verdi (+39 nuovi vs main pre-blocco)
- [x] Typecheck apps/web + apps/api puliti
- [x] Biome clean su tutti i file slice
- [x] Build apps/web compila pulita (NODE_OPTIONS=7168MB)

### Da fare post-merge slice E
- [ ] Migration 0023 applicata in produzione
- [ ] Env `CLEANER_TOKEN_SECRET` (32+ char) configurato su Fly + Vercel
- [ ] Buckets Supabase Storage applicati manualmente via SQL Editor (vedi `STORAGE-BUCKETS.md`)
- [ ] Smoke test E2E pilot Andrea: nuovo host → wizard → kit → cleaner PWA → welcome message

## 7. Limitazioni V1 accettate

| Limitazione | V2 plan |
|---|---|
| PWA cleaner solo online (no Service Worker) | Upgrade quando dati su disconnessioni reali |
| Welcome message template fisso (no voice profile) | Integrare voice profile quando confidence > 0.6 |
| Photo upload single attempt (no retry queue) | BullMQ retry on Storage failure |
| Manifest PWA con icone SVG dinamiche (no PNG asset) | Convert a PNG con campagne pilot |
| Settings host: solo welcome message (no altre automazioni) | Estendere con toggle per ogni cron |
| Migration 0022 storage buckets non auto-applicabile | Supabase API admin direct call |

## 8. Riferimenti

- `CONTEXT.md` §5 — economia kit, zero markup
- `docs/STORAGE-BUCKETS.md` — fallback procedurale 0022
- `docs/SLICE-C-KIT-GENERATION.md` — slice C precedente (kit workflow)
- `packages/db/src/migrations/0020-0023*.sql` — schema diff

---

**Status sintetico:** 4/5 slice merged. Slice E PR #49 in apertura.
