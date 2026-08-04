# CONTEXT — Premura Livello 1

> Questo file è la fonte di verità del progetto.
> Versione 2 — 22 aprile 2026 (include capacità Conversazione,
> profilo struttura, voice profile host, matrice delega).
>
> In caso di conflitto con qualsiasi altro file, CONTEXT.md vince.

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
- **Hospitable** ha lanciato un piano Essentials gratis per competere su
  questa fascia — conferma che il segmento è enorme e sottoservito.

---

## 2. Cosa fa Premura — 5 fasi + capacità continua

Premura è un agente AI concierge autonomo. Per ogni prenotazione esegue 5
fasi programmate nel tempo, e in parallelo mantiene una **capacità sempre
attiva** di conversare con l'ospite dovunque scriva (WhatsApp, Booking inbox,
Airbnb inbox).

### Fasi programmate (outbound, scheduled)

#### Fase 1 — STUDIO
Appena arriva una prenotazione, analizza l'ospite (nazionalità, recensioni
pubbliche lasciate altrove, pattern di prenotazione).
Output: **Guest DNA** con archetipo, rischi previsti, tono consigliato.

#### Fase 2 — CONTATTO
T-48h dal check-in: messaggio WhatsApp personalizzato con opt-in.
Benvenuto caldo + **micro-quiz di 60 secondi** (4 swipe stile Tinder) per
capire preferenze.
Fallback su messaggi Booking/Airbnb se l'ospite non dà opt-in WhatsApp.

#### Fase 3 — CURA
Compone kit fisico personalizzato basato su DNA + quiz.
Ordina ingredienti (Amazon / partner locali / Glovo) a casa della cleaner.
Briefa cleaner via WhatsApp. Cleaner sistema kit + scatta foto + scrive
nome ospite su biglietto pre-stampato.
**Mattina del check-in**: Premura manda foto kit + messaggio personalizzato
su WhatsApp a ospite, firmato col nome della struttura.

#### Fase 4 — PRESENZA
Giorno 2 sera di soggiorni ≥3 notti: check-in emotivo su WhatsApp "come va?".
- Se OK: va avanti silenzioso.
- Se problema piccolo: risolve solo (offre late check-out, sconto).
- Se problema grosso: **ESCALATION** urgente all'host con alert +
  suggerimento azione concreta.

#### Fase 5 — CHIUSURA
T+24h dopo check-out: sondaggio privato.
- Feedback negativo: recovery (sconto futuro, scuse).
- Feedback positivo: nudge forte verso recensione pubblica con link.

### Capacità continua (sempre attiva)

#### CONVERSAZIONE — dal booking al check-out
In qualsiasi momento l'ospite può scrivere a Premura (su WhatsApp, Booking
inbox, Airbnb inbox). Premura:

1. **Legge** il messaggio in tempo reale
2. **Capisce** di cosa si tratta (info struttura, richiesta servizio,
   problema, small talk)
3. **Decide** cosa fare basandosi su:
   - Profilo struttura (wifi, check-in rules, parcheggio, ecc.)
   - Voice profile host (tono, lingue, stile)
   - Matrice delega (cosa può decidere da sé, cosa deve passare all'host)
   - Guest DNA (chi è l'ospite, cosa ha chiesto prima)
4. **Risponde** in autonomia, **draft da approvare**, o **escalation** a host,
   a seconda della matrice delega

L'ospite non percepisce una differenza tra "Premura in fase programmata"
e "Premura che risponde a una domanda". Per lui è la stessa mano.
Per il sistema sono moduli diversi.

---

## 2b. Flusso canonico (stella polare — Andrea, 30/07/2026)

Ogni decisione futura si misura contro questo flusso. In caso di dubbio
su una feature, rileggere qui.

1. **Arriva la prenotazione** → Premura la vede entro 15 minuti, aggiorna
   calendario e tutte le info che riesce a ricavare.
2. **Il numero dell'ospite** arriva per una di queste vie, in ordine:
   a) l'ospite lo lascia da solo aprendo la guest app per avere i
      **codici d'accesso** (livello L1 — è la strada principale, non il
      ripiego);
   b) parser email (nome e contatti dove il canale li dà);
   c) inserimento manuale dell'host (ultimo ricorso).
3. **Premura manda la guest app** di quella struttura: casa, foto o
   video, servizi disponibili, codici, trasporti.
4. **Da lì Premura fa da tramite per tutto il soggiorno**:
   - **prevenire la cancellazione**: presenza subito dopo la
     prenotazione, l'ospite vede che c'è qualcuno;
   - **preparare l'ospite** e spingere la recensione;
   - **offrire servizi** in autonomia, e gestire il rapporto con il
     fornitore. La conferma finale resta all'host;
   - **gestire il kit** con la cleaner, in autonomia;
   - **gestire ogni problema**: "da ora puoi scrivere qui per qualsiasi
     cosa, ti rispondo subito".
5. **Trasparenza AI: due concetti separati, mai confusi (Andrea, 30/07).**
   - **Disclosure**: UNA volta, all'inizio della conversazione — "stai
     parlando con l'assistente automatico di [nome struttura]". È quello
     che richiede l'art. 50 AI Act.
   - **Firma di ogni messaggio**: SEMPRE il nome della struttura, mai
     PREMURA.AI. Il valore che vendiamo è che l'host mantiene il suo
     brand.

L'host interviene **solo quando c'è una decisione di soldi**.

### 6. Controllo e escalation — tre livelli di autonomia

**L1 — Risponde da solo.** Domande la cui risposta è già nella scheda
struttura: wifi, orari check-in/out, come arrivare, parcheggio, regole,
dove mangiare. Nessun impegno preso. → L'host le vede nel riepilogo,
non le approva.

**L2 — Prepara e aspetta conferma.** Tutto ciò che impegna soldi, date o
disponibilità: richieste servizi, prezzi, late check-out, prenotazioni
col fornitore. → Bozza in dashboard con anteprima, pulsanti
Approva / Modifica / Rifiuta, notifica WhatsApp con link diretto.
→ NIENTE parte senza il tocco dell'host.

**L3 — Si ferma e chiama.** Ospite arrabbiato o insoddisfatto, guasto o
emergenza, sicurezza, cancellazione, richiesta fuori schema, o
semplicemente qualcosa che l'agente non sa gestire.
→ Il bot SMETTE di rispondere su quella conversazione (riga in
`conversation_handover`);
→ WhatsApp immediato all'host con: ospite, struttura, testo del
messaggio, perché è scattata l'escalation;
→ il bot resta zitto finché l'host non lo riattiva.
Meglio un silenzio di dieci minuti che una risposta sbagliata.

**Rodaggio**: le prime due settimane TUTTO in modalità bozza, anche L1.
Quando le risposte semplici risultano sempre corrette, si sblocca L1 e
resta il controllo su L2 e L3. Deve esserci un **interruttore in
dashboard** per farlo, non un deploy.

**Il riepilogo** (nessun messaggio invisibile — se un invio non parte,
l'host lo deve vedere):
- in home, "Fatto dall'agente — oggi": una riga per azione, in
  linguaggio host;
- una volta al giorno, WhatsApp con il sunto: quante conversazioni,
  quante gestite da sole, cosa aspetta l'host;
- nella sezione Conversazioni: thread completo con chi ha detto cosa
  (ospite / agente / host / fornitore) e lo stato di ogni messaggio,
  inclusi quelli falliti o bloccati.

---

## 3. Tre concetti strutturali nuovi (critici)

### A. Profilo struttura — il "manuale digitale"

Ogni struttura ha un profilo informativo ricco e azionabile. È il manuale
che Premura consulta per rispondere all'ospite. Compilato **una volta**
in onboarding tramite **conversazione guidata** con Premura stesso (non form
freddo).

Contiene (esempi):

- **Arrivo**: indirizzo esatto, come arrivare da aeroporto/stazione, dove
  parcheggiare (zona blu, garage), come prendere le chiavi (keybox con
  codice, lockbox, persona)
- **Check-in/out**: orari, regole flessibilità
- **Dentro casa**: WiFi (SSID + password), come si accende AC/riscaldamento,
  elettrodomestici (lavatrice, lavastoviglie), TV/Netflix
- **Rifiuti**: giorni raccolta, dove buttare, differenziata
- **Quartiere**: 5 ristoranti top personali, 3 bar colazione, supermercato
  più vicino, farmacia, lavanderia, dove prendere un caffè decente
- **Trasporti**: metro/bus più vicini, taxi consigliato, bike rental
- **Emergenze**: idraulico di fiducia, elettricista, vicino a cui chiamare
- **Regole casa**: fumo (dentro/fuori/balcone), animali, ospiti extra,
  quiet hours, musica
- **Extra**: lenzuola extra dove, asciugacapelli, ferro da stiro, cucina
  essenziale

L'onboarding della struttura dura **15-20 minuti** di chat conversazionale,
non 2 ore di form. Premura chiede domande via chat tipo:

> Premura: "Allora, parliamo di La Goccia di S.Gennaro. Prima cosa: come
> arrivano gli ospiti? Descrivimelo come lo diresti a un amico."
>
> Host: "Arrivano dall'aeroporto con l'Alibus fino a Piazza Garibaldi, poi
> 10 min a piedi o metro linea 2 fino a Cavour."
>
> Premura: "Perfetto. E le chiavi? Come le prendono?"
>
> ... e così via.

Premura dietro le quinte struttura la conversazione in formato strutturato
(JSON nel DB), pronto da consultare.

### B. Voice profile host — il "tono"

Premura deve scrivere **come scriverebbe l'host umano**. Non un tono
generico da concierge hotel, non un tono corporate. Il tono specifico
di Andrea, o Marco, o Laura, a seconda dell'host.

Si estrae in 2 modi complementari:

**Modo 1 — Domande in onboarding**
Premura chiede 3-4 domande dirette:
- "Dai del tu o del lei agli ospiti?"
- "Usi emoji quando scrivi? Quali tipi?"
- "Come firmi di solito? (tuo nome, 'la famiglia di...', nome struttura)"
- "Se un ospite arriva in ritardo, come lo accogli?"

**Modo 2 — Analisi messaggi passati (opzionale ma potente)**
Se l'host dà accesso a Booking/Airbnb message history, Premura legge
20-30 messaggi che l'host ha scritto in passato e ne estrae lo stile
con Claude. Output: pattern linguistici, formalità, lunghezza media,
uso punteggiatura.

Risultato: ogni messaggio che Premura scrive è in **lingua ospite** ma
con **tono host specifico**. Non esiste "la voce di Premura" generica.
Esistono tante voci quante host.

### C. Matrice delega — cosa Premura decide da sé

Per ogni tipo di richiesta ospite, l'host imposta UNA VOLTA in onboarding
(con default intelligenti) uno di 3 modi:

- **🟢 Auto** — Premura risponde da sé, l'host vede solo il log
- **🟡 Draft** — Premura scrive la risposta, l'host approva con 1 tap
- **🔴 Escalate** — Premura avvisa l'host, rispondi tu

Matrice default (l'host può cambiare):

| Tipo richiesta | Default | Note |
|----------------|---------|------|
| Info wifi / parcheggio / check-in | 🟢 Auto | Dal profilo struttura |
| Info quartiere / raccomandazioni | 🟢 Auto | Dal profilo struttura |
| Early check-in ≤1h | 🟢 Auto | "Si può sì, fammi sapere" |
| Early check-in >1h | 🟡 Draft | Serve conferma cleaner |
| Late check-out ≤1h | 🟢 Auto | Soft rule |
| Late check-out >1h | 🟡 Draft | Impatta pulizia |
| Richiesta sconto | 🟡 Draft | Mai decidere da sé |
| Extra services (pulizia, lenzuola) | 🟡 Draft | Costo extra |
| Problema rotto / non funziona | 🔴 Escalate | Sempre a host |
| Lamentela seria | 🔴 Escalate | Sempre a host |
| Emergenza (acqua, elettricità) | 🔴 Escalate | Chiamata telefonica subito |
| Small talk amichevole | 🟢 Auto | Rispondi caloroso |
| Domande turistiche | 🟢 Auto | Tipo "quanto costa entrare al museo" |

Nei primi giorni di uso, l'host può forzare tutto a Draft (paranoia iniziale).
Dopo 10-20 ospiti gestiti senza disastri, passa serenamente ad Auto sui
casi verdi.

---

## 4. UX dell'host — 3 stati + notifiche contestuali

L'host **NON** vede timeline, log, task list lunghe. Vede:

- 🟢 Tutto ok, Premura sta gestendo (zero azioni richieste)
- 🟡 Ti aggiorno ma sto lavorando io (eventualmente con Draft da approvare)
- 🔴 URGENTE, serve tuo intervento (con suggerimento azione)

Sulla home card **"STA LAVORANDO PER TE"** con descrizione live di cosa
l'agente sta facendo.

Notifiche push mirate solo su 🟡 (draft da approvare) e 🔴 (urgente).
Mai notifiche su 🟢.

---

## 5. Decisioni blindate (NON cambiare senza discussione)

### Brand e tono
- **Nome app/prodotto:** Premura
- **Nome agente:** Premura (stesso del prodotto — NO "Leo", NO altri nomi)
- **Firma messaggi all'ospite:** nome della struttura
  (es. "— La Goccia di S.Gennaro"). L'ospite deve pensare di parlare con
  l'host umano, non con un brand esterno.
  **Chiarimento 30/07/2026 (vedi §2b punto 5):** la trasparenza AI
  (art. 50) è la DISCLOSURE una volta a inizio conversazione; la firma
  di ogni messaggio resta SEMPRE il nome della struttura, mai
  PREMURA.AI. Il testo del benvenuto approvato per l'1/08 resta com'è.

### Pricing
- **Prezzi:**
  - €9.99 / mese — 1 struttura
  - €7.99 / mese — 2-5 strutture
  - €5.99 / mese — 6+ strutture
- **Trial:** gratis fino al primo ospite servito (finisce al check-out
  del primo ospite, non a scadenza di calendario) — **SENZA carta richiesta**

### Kit fisico
- **Kit:** al costo + €0.75 service fee + €2 cleaner + €1 biglietto.
  **ZERO markup**. Trasparenza totale — pilastro etico non negoziabile.
- **Budget kit scelto dall'host:** da €3 simbolico a €20 premium (slider)
- **Il kit specifico NON è visibile all'host prima dell'invio**
  (anti-disintermediazione). L'host vede solo: budget, tema, "kit inviato".
- **Biglietto fisico**: cartoncino A6 pre-stampato, cleaner scrive solo
  nome ospite a penna
- **Messaggio "lungo" personalizzato**: WhatsApp la mattina check-in
  (foto kit + testo)

### Canali
- **Canale messaggi primario:** WhatsApp Business con opt-in ospite.
  Fallback Booking/Airbnb inbox se opt-in negato.
- **Aggregazione READ-ONLY** delle prenotazioni da Booking + Airbnb
  (iCal + email forwarding). NON è un channel manager.
  **Conversazione INBOUND** attiva su tutti i canali (WhatsApp, Booking
  inbox se integrato, Airbnb via email parsing).

### Onboarding (principio, 30/07/2026)
Premura deve funzionare per un host che ha SOLO Booking e Airbnb.
Il channel manager è un di più, mai un requisito. Nessun vicolo cieco:
se l'host non ha X, il wizard propone la strada alternativa, mai un
errore. Quattro livelli, in ordine di sforzo per l'host:

- **L0 — iCal (universale).** Ogni piattaforma lo dà. Il wizard spiega
  dove trovarlo (screenshot per Booking e Airbnb). Dà date e blocchi,
  non l'ospite.
- **L1 — L'ospite si registra da solo** ← il pezzo che rende Premura
  usabile da chiunque. Il wizard genera un messaggio pronto da copiare
  nell'inbox Booking/Airbnb col link della guest app; l'ospite, per
  vedere i CODICI D'ACCESSO, lascia nome, telefono e consenso. Da lì:
  finestra WhatsApp aperta, agente operativo. I codici sono
  l'incentivo: l'ospite li vuole comunque.
- **L2 — Channel manager (opzionale).** Smoobu per primo, altri solo
  su richiesta di clienti veri. Niente integrazioni in anticipo.
- **L3 — Inserimento manuale.** Sempre disponibile come fallback.

Nel wizard: MAI chiedere "hai un channel manager?" come prima domanda.
Chiedere "dove ricevi le prenotazioni?" e proporre la strada più
semplice che copre il caso. Chi ha Smoobu lo dice da sé.

### Automazione
- **L'host NON configura template messaggi.** Premura scrive tutto sempre
  diverso basandosi su Guest DNA + profilo struttura + voice profile host.
- **Matrice delega** imposta una volta in onboarding, poi regolabile.
- **Pagamento cleaner:** €2/kit validato da foto cleaner (primario) o
  conferma ospite (fallback 24h).

---

## 6. Estetica

- **Tipografia:** Fraunces per i titoli, Inter per il body (Google Fonts)
- **Palette:** avorio `#F5EFE4`, terracotta `#C65D3A`, blu profondo `#1F3A4D`,
  oro `#D4A574`
- **Tono:** elegante, caldo, italiano. NON il solito SaaS freddo.
- **Riferimenti:** Notion (pulizia), Linear (precisione), Airbnb (calore)
- **Mobile-first** ma navigabile anche da desktop
- **Emoji:** usate solo dove aggiungono valore (bandiere, stati 🟢🟡🔴)
- **Lingua UI:** italiano per app host

---

## 7. Demo visiva

Il prototipo HTML/CSS/JS cliccabile e navigabile è in:

    demo/premura-prototype.html

File singolo autocontenuto. Contiene 5 schermate: Landing/Onboarding, Home
Dashboard, Dettaglio Ospite (Anna van Dijsseldonk), Alert Urgente (Klaus
Werner), Settings Kit.

**NOTA:** il prototipo mostra UI dei casi "outbound" principali. La UI delle
feature nuove (profilo struttura, voice profile, matrice delega, draft
approval) verrà progettata in Fase 2-3 dello sviluppo.

---

## 8. Cosa NON è Premura

- **NON è un channel manager.** Non sincronizza disponibilità, non scrive
  su Booking/Airbnb. Legge calendari (iCal) e risponde a messaggi inbound.
- **NON è un PMS.** Non gestisce pulizie complesse, non fa reportistica
  contabile, non gestisce multi-property calendar editing.
- **NON è un chatbot dichiarato.** L'ospite chatta col "nome della struttura",
  non con un bot visibile. L'illusione è che parli con l'host umano.
- **NON è un tool che richiede configurazione continua.** L'host imposta
  profilo struttura + voice profile + matrice delega **una volta**, poi
  tocca zero.

---

## 9. Prossimi step per Claude Code

Quando Claude Code apre questo repo, l'ordine di lavoro è:

1. Leggere CONTEXT.md (questo file), docs/architecture.md, docs/ROADMAP.md
2. Seguire la ROADMAP fase per fase
3. NON scrivere codice senza piano approvato dall'host per la fase corrente

---

_Ultimo aggiornamento: 22 aprile 2026 — Andrea Chiacchio, fondatore_
_v2: aggiunta capacità Conversazione, profilo struttura, voice profile, matrice delega_
