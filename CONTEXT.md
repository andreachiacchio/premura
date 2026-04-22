# CONTEXT — Premura Livello 1

> Questo file è la fonte di verità del progetto.
> I file `CLAUDE.md` e `README.md` nella root contengono riferimenti OBSOLETI
> a "GiftTube" e al prezzo "€4.99". Vanno aggiornati al nuovo posizionamento
> descritto qui sotto. In caso di conflitto tra CONTEXT.md e altri file,
> CONTEXT.md vince.

---

## 1. Posizionamento — Livello 1

Premura è il **primo tool** che un host italiano di affitti brevi compra
quando capisce che non può più gestire tutto a mano.

- **Target**: host con 1-5 strutture, zero PMS, pain point = tempo e recensioni.
- **Mercato**: ~70% degli host italiani (Hostaway Summer Snapshot 2025).
- **Non competiamo** con Smoobu / Hostaway / Guesty / Hospitable.
  Quelli sono Livello 2 — channel manager seri per 10+ strutture.
  Premura è ciò che l'host compra **PRIMA** di loro, o **AL POSTO DI** loro
  per sempre se resta piccolo.
- **Hospitable** ha appena lanciato un piano Essentials GRATIS proprio per
  competere su questa fascia — conferma che il segmento è enorme e
  sottoservito.

---

## 2. Cosa fa Premura — le 5 fasi dell'agente

Premura è un agente AI concierge autonomo. Per ogni prenotazione esegue
automaticamente queste 5 fasi:

### Fase 1 — STUDIO
Appena arriva una prenotazione, analizza l'ospite (nazionalità, recensioni
pubbliche lasciate altrove, pattern di prenotazione).
Output: **Guest DNA** con archetipo, rischi previsti, tono consigliato.

### Fase 2 — CONTATTO
T-48h dal check-in: messaggio WhatsApp personalizzato con opt-in.
Benvenuto caldo + **micro-quiz di 60 secondi** (4 swipe stile Tinder) per
capire preferenze.
Fallback su messaggi Booking/Airbnb se l'ospite non dà opt-in WhatsApp.

### Fase 3 — CURA
Compone kit fisico personalizzato basato su DNA + quiz.
Ordina ingredienti (Amazon / Cortilia / fornitori locali) a casa della cleaner.
Briefa cleaner via WhatsApp. Cleaner sistema kit + scatta foto.
Ospite al check-in trova kit + riceve foto su WhatsApp.

### Fase 4 — PRESENZA
Giorno 2 sera: check-in emotivo su WhatsApp "come va?".
- Se OK: va avanti silenzioso.
- Se problema piccolo: risolve solo (offre late check-out, sconto).
- Se problema grosso: **ESCALATION** urgente all'host con alert +
  suggerimento azione concreta.

### Fase 5 — CHIUSURA
T+24h dopo check-out: sondaggio privato.
- Feedback negativo: recovery (sconto futuro, scuse).
- Feedback positivo: nudge forte verso recensione pubblica con link.

---

## 3. UX dell'host — solo 3 stati

L'host **NON** vede timeline, log, task list. Vede **solo 3 stati** per ogni
ospite:

- Verde: tutto ok, Premura sta gestendo (zero azioni richieste)
- Giallo: ti aggiorno ma sto lavorando io
- Rosso: URGENTE, serve tuo intervento (con suggerimento azione)

Sulla home la card principale recita **"STA LAVORANDO PER TE"** con
descrizione live di cosa l'agente sta facendo in quel momento.

---

## 4. Decisioni blindate (NON cambiare senza discussione)

- **Nome app/prodotto:** Premura
- **Nome agente:** Premura (stesso del prodotto — NO "Leo", NO altri nomi)
- **Firma messaggi all'ospite:** nome della struttura
  (es. "— La Goccia di S.Gennaro"). L'ospite deve pensare di parlare con
  l'host umano, non con un brand esterno.
- **Prezzi:**
  - €9.99 / mese — 1 struttura
  - €7.99 / mese — 2-5 strutture
  - €5.99 / mese — 6+ strutture
- **Trial:** 30 giorni gratis **SENZA carta richiesta**
- **Kit:** al costo + €0.75 service fee + €2 cleaner + €1 biglietto.
  **ZERO markup**. Trasparenza totale — è un pilastro etico non negoziabile.
- **Budget kit scelto dall'host:** da €3 simbolico a €20 premium (slider)
- **Canale messaggi primario:** WhatsApp Business con opt-in ospite.
  Fallback Booking/Airbnb solo se opt-in negato.
- **Il kit specifico NON è visibile all'host prima dell'invio**
  (anti-disintermediazione). L'host vede solo: budget, tema, "kit inviato".
- **L'host NON configura template messaggi.** Premura scrive tutto sempre
  diverso basandosi su DNA + contesto + quiz.
- **Aggregazione READ-ONLY** delle prenotazioni da Booking + Airbnb
  (legge entrambe, mostra lista unificata). NON è un channel manager
  (non scrive, non sincronizza disponibilità). È un abilitatore per il
  target Livello 1 che oggi gestisce a mano.

---

## 5. Estetica

- **Tipografia:** Fraunces per i titoli, Inter per il body (Google Fonts)
- **Palette:** avorio `#F5EFE4`, terracotta `#C65D3A`, blu profondo `#1F3A4D`,
  oro `#D4A574`
- **Tono:** elegante, caldo, italiano. NON il solito SaaS freddo.
- **Riferimenti:** Notion (pulizia), Linear (precisione), Airbnb (calore)
- **Mobile-first** ma navigabile anche da desktop
- **Emoji:** usate solo dove aggiungono valore (bandiere, stati verde/giallo/rosso)
- **Lingua:** italiano per UI e commenti

---

## 6. Demo visiva

Il prototipo HTML/CSS/JS cliccabile e navigabile è in:

    demo/premura-prototype.html

File singolo autocontenuto (Google Fonts a parte). Apribile con doppio clic
nel browser. Contiene 5 schermate: Landing/Onboarding, Home Dashboard,
Dettaglio Ospite (Anna van Dijsseldonk, olandese), Alert Urgente
(Klaus Werner, tedesco), Settings Kit.

**NOTA IMPORTANTE:** in questa versione del prototipo l'agente appare ancora
firmato come "Leo" in alcuni punti (Home card + chat Anna). Da sistemare:
sostituire "Leo" con "Premura" ovunque.

---

## 7. File obsoleti da aggiornare

Questi file parlano ancora di "GiftTube" e del vecchio prezzo "€4.99".
Vanno riscritti al posizionamento attuale descritto sopra:

- `README.md` — riscrivere intero al nuovo brand e pricing
- `CLAUDE.md` — istruzioni per Claude Code, da allineare
- `docs/` — rivedere contenuti
- `package.json` — campo `name`, `description`
- Descrizione del repo su GitHub (attualmente "The invisible concierge...
  €4.99/month")

---

## 8. Cosa NON è Premura

Distinzioni importanti per evitare scope creep:

- **NON è un channel manager.** Non sincronizza disponibilità, non scrive
  su Booking/Airbnb. Solo lettura.
- **NON è un PMS.** Non gestisce pulizie complesse, non fa reportistica
  contabile, non gestisce multi-property calendar editing.
- **NON è un chatbot per ospiti.** L'ospite chatta col "nome della struttura"
  attraverso WhatsApp/Booking inbox, non con un bot dichiarato.
- **NON è un tool che richiede configurazione.** L'host imposta cleaner +
  budget una volta. Tutto il resto è automatico.

---

## 9. Prossimi step concreti (per Claude Code)

Quando Claude Code apre questo repo, l'ordine di lavoro consigliato è:

1. **Leggere** `CONTEXT.md` (questo file) e `demo/premura-prototype.html`
   per capire posizionamento e UX target.
2. **Aggiornare** `README.md`, `CLAUDE.md`, `package.json` (campo name
   e description) al nuovo brand Premura e pricing €9.99/€7.99/€5.99.
3. **Rivedere** `docs/` per allineare architettura al nuovo posizionamento
   (aggregazione read-only, no channel manager, ecc.).
4. **Sistemare il prototipo**: nel file `demo/premura-prototype.html`
   sostituire ogni occorrenza di "Leo" con "Premura" (o rimuovere firma,
   lasciando firma = nome struttura per i messaggi all'ospite).
5. Dopo aver aggiornato i file testuali, discutere con l'host fondatore
   (Andrea) i prossimi step di sviluppo prodotto.

---

_Ultimo aggiornamento: 22 aprile 2026 — Andrea Chiacchio, fondatore_
