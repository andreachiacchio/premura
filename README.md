# Premura

> Il primo tool che un host italiano di affitti brevi compra quando capisce che
> non può più gestire tutto a mano. Agente AI concierge, zero configurazione.

## Posizionamento

Premura è **Livello 1**: serve l'host con 1-5 strutture, senza PMS, che oggi
gestisce ospiti a mano. ~70% del mercato italiano (Hostaway Summer Snapshot 2025).

Non competiamo con Smoobu, Hostaway, Guesty o Hospitable. Quelli sono Livello 2,
channel manager seri per chi ha 10+ strutture. Premura è quello che l'host compra
**PRIMA** di loro — o **AL POSTO DI** loro per sempre se resta piccolo.

Hospitable ha appena lanciato un piano Essentials gratis proprio su questa fascia:
conferma che il segmento è enorme e sottoservito.

## Cosa fa — le 5 fasi

Per ogni prenotazione, l'agente esegue automaticamente:

1. **Studio** — analizza l'ospite (nazionalità, recensioni pubbliche altrove,
   pattern di prenotazione). Output: Guest DNA con archetipo, rischi, tono.
2. **Contatto** — T-48h dal check-in, messaggio WhatsApp personalizzato con
   opt-in. Micro-quiz di 60 secondi (4 swipe stile Tinder). Fallback canale
   Booking/Airbnb se opt-in negato.
3. **Cura** — compone kit fisico personalizzato da DNA + quiz. Ordina
   ingredienti (Amazon/Cortilia/fornitori locali) a casa della cleaner. Briefa
   cleaner via WhatsApp. Cleaner sistema kit e manda foto.
4. **Presenza** — giorno 2 sera, check-in emotivo su WhatsApp. Se OK, silenzio.
   Se problema piccolo, risolve solo. Se problema grosso, escalation urgente
   all'host con azione concreta suggerita.
5. **Chiusura** — T+24h dopo il check-out, sondaggio privato. Feedback negativo
   → recovery. Feedback positivo → nudge alla recensione pubblica.

## UX dell'host — solo 3 stati

L'host **non** vede timeline, log, task list. Vede **solo 3 stati** per ogni ospite:

- **Verde** — tutto ok, Premura sta gestendo (zero azioni)
- **Giallo** — ti aggiorno ma sto lavorando io
- **Rosso** — urgente, serve tuo intervento (con azione suggerita)

La card principale della home recita *"STA LAVORANDO PER TE"* con descrizione
live di cosa l'agente sta facendo in quel momento.

## Prezzi

| Strutture | Prezzo |
|-----------|--------|
| 1         | €9,99 / mese |
| 2-5       | €7,99 / mese per struttura |
| 6+        | €5,99 / mese per struttura |

**Trial 30 giorni gratis, senza carta richiesta.**

## Kit — zero markup

L'host paga il kit a costo trasparente. Nessun margine sul prodotto fisico.

- Prodotti: al costo vivo
- Service fee: €0,75 per kit
- Cleaner: €2 per kit sistemato
- Biglietto scritto a mano: €1
- Slider budget host: da €3 (simbolico) a €20 (premium)

Trasparenza totale sui centesimi: è un pilastro etico non negoziabile.

## Decisioni blindate

- Nome prodotto e agente: **Premura** (stesso nome, non "Leo" né altri)
- Firma messaggi all'ospite: **nome della struttura** (es. "— La Goccia di
  S.Gennaro"). L'ospite pensa di parlare con l'host umano, non con un brand
  esterno.
- Il kit specifico **non è visibile all'host** prima dell'invio
  (anti-disintermediazione). L'host vede solo budget, tema, "kit inviato".
- L'host **non configura** template messaggi. Premura scrive tutto sempre
  diverso basandosi su DNA + contesto + quiz.
- Canale messaggi primario: WhatsApp Business con opt-in. Fallback
  Booking/Airbnb solo se opt-in negato.
- Aggregazione **read-only** di Booking + Airbnb. Non è un channel manager.

## Cosa NON è Premura

- **Non è un channel manager** — non sincronizza disponibilità, non scrive
  su Booking/Airbnb. Solo lettura.
- **Non è un PMS** — niente pulizie complesse, niente reportistica
  contabile, niente calendar editing multi-property.
- **Non è un chatbot dichiarato** — l'ospite chatta col nome della struttura,
  non con un brand terzo.
- **Non richiede configurazione** — l'host imposta cleaner + budget una volta
  sola. Il resto è automatico.

## Stack tecnico

- **Linguaggio**: TypeScript strict
- **Runtime**: Node.js 22 LTS
- **Framework**: Fastify
- **Database**: PostgreSQL 16 + Drizzle ORM
- **Queue**: BullMQ su Redis
- **AI**: Anthropic SDK — `claude-opus-4-7` per decisioni importanti,
  `claude-haiku-4-5-20251001` per task semplici
- **Testing**: Vitest
- **Linting**: Biome
- **Integrazioni previste**: Booking.com Connectivity API, Airbnb API (lettura),
  Amazon SP-API Italia, Cortilia, WhatsApp Business Cloud API, Stripe

## Struttura repo

```
premura/
├── src/
│   ├── agents/         # Agenti Claude (guest-dna, kit-composer, message-writer, recovery)
│   ├── workflows/      # Orchestrazione business logic
│   ├── integrations/   # Wrapper API esterne
│   ├── api/            # REST endpoints (webhooks, dashboard, cleaner)
│   ├── db/             # Schema Drizzle, migrations, queries
│   └── utils/          # Claude wrapper, logger, errori
├── demo/               # Prototipo HTML navigabile
├── docs/               # Architettura, validation, playbook
└── tests/              # Unit + integration (Testcontainers)
```

## Estetica

- Typography: Fraunces (titoli), Inter (body)
- Palette: avorio `#F5EFE4`, terracotta `#C65D3A`, blu profondo `#1F3A4D`,
  oro `#D4A574`
- Tono: elegante, caldo, italiano. Non il solito SaaS freddo.
- Riferimenti: Notion (pulizia), Linear (precisione), Airbnb (calore).
- Mobile-first, navigabile anche da desktop.

## Getting started

```bash
git clone <repo-url> premura
cd premura
pnpm install
pnpm dev
```

Per la lista completa dei comandi (test, migrations, lint, typecheck) e le
convenzioni di codice, vedi [`CLAUDE.md`](./CLAUDE.md).

## Stato

Pre-MVP. In corso: allineamento brand + prototipo UX.

## Contatti

Fondatore: Andrea Chiacchio · Napoli, Italia

## Licenza

Proprietaria. Non distribuire senza autorizzazione.
