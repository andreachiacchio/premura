# Premura — Strategia Booking V1

> **Stato:** Decisione finale presa il 28 aprile 2026.
> **Scopo del documento:** chiudere per sempre la discussione su "come integriamo Booking.com in Premura". Il documento è una **barriera anti-rediscussione**: chi lo rilegge tra mesi deve trovare qui tutto il contesto, le opzioni considerate, e i NO definitivi, senza dover rifare il giro.
> **Quando rileggere:** prima di proporre qualsiasi modifica all'integrazione Booking. Se l'idea è già nella sezione "FUORI SCOPE PERMANENTI", la risposta è NO. Riapri la discussione SOLO se è cambiato il contesto esterno in modo sostanziale (Booking riapre Connectivity API a small SaaS, oppure Andrea cambia filosofia di prodotto).

---

## 1. Vincoli strutturali verificati empiricamente

Ogni vincolo qui è stato testato direttamente, non assunto. Le fonti sono linkate dove disponibili. Le verifiche offline sono etichettate come tali.

### 1.1 Booking Connectivity API ufficiale è chiusa a nuovi entranti

**Verifica:** 28 aprile 2026, lettura developers.booking.com + blog Elfsight 2025.
**Citazione testuale dalla documentazione Booking:** *"There is no Booking.com public API available, and the service grants access to its API solutions only to the Connectivity Partners. At the moment the platform is not accepting new registrations on the partner portal."*
**Implicazione per Premura:** non possiamo avere accesso diretto Connectivity API in V1. Quando riaprirà, richiederà comunque ~50+ properties gestite, audit tecnico, mesi di onboarding. Premura V1 con 1 property non è eligible.
**Status:** porta chiusa per V1. Riapertura possibile solo quando Premura avrà host base.

### 1.2 iCal Booking espone solo date occupate, anonimizzate

**Verifica:** 28 aprile 2026 ore 16:35, test reale con curl su URL iCal della property La Goccia.
**URL testato:** `https://ical.booking.com/v1/export?t=...` (token rotato dopo test).
**Output ottenuto (esempio):**
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//admin.booking.com//NONSGML v1.0//EN
BEGIN:VEVENT
DTSTART;VALUE=DATE:20260426
DTEND;VALUE=DATE:20260429
UID:a90207a6098fea365fa0d9ebc4af632d@booking.com
SUMMARY:CLOSED - Not available
END:VEVENT
**Cosa contiene:** date check-in/checkout + UID interno Booking + SUMMARY hardcoded "CLOSED - Not available".
**Cosa NON contiene:** nome guest, codice prenotazione leggibile, telefono, email, lingua.
**Implicazione per Premura:** iCal Booking è utile solo per overbooking detection. Non basta per attivare il workflow agente AI completo (manca tutto il dato guest).
**Status:** uso confermato come "Livello base" della strategia (vedi sezione 3).

### 1.3 Email Booking sono data-poor by design

**Verifica:** 27 aprile 2026, M2a.3 Fase 3 ingestor in produzione.
**Test E2E:** sync Gmail di `c.farmabeauty@gmail.com` ha processato 44 email Booking. Risultato: 18 new_booking + 13 cancellation + 2 modification + 11 noise. Subject estraibile via regex: `Booking.com - Hai una nuova prenotazione! (NNNNN, ...)`. Body NON contiene struttura parsabile per nome guest, date dirette, telefono, lingua.
**Architettura attuale:** parser regex Booking ingestor in `apps/web/lib/booking-event-ingestor.ts` estrae SOLO event type + codice prenotazione + timestamp. Niente Claude AI per Booking (a differenza di Airbnb dove Claude estrae dati ricchi dal body email).
**Implicazione per Premura:** email Booking servono solo come trigger ("qualcosa è successo") e per sincronizzare codici prenotazione con righe iCal esistenti. Niente di più.
**Status:** integrato nella pipeline. Aspettative di valore corrette.

### 1.4 Reply-To noreply / alias guest non sono utilizzabili off-platform

**Verifica:** lettura Booking partner help center, articolo "Contacting guests".
**Citazione testuale:** *"To protect your and your guests' privacy, we don't share private email addresses. Both you and your guests will only see an anonymous alias ending in @guest.booking.com or @partner.booking.com. Only use Booking.com platforms, the Extranet, and Pulse app to communicate with guests securely."*
**Implicazione per Premura:** anche se ottenessimo l'email guest dall'extranet, è un alias temporaneo che scade dopo il check-out e che Booking monitora. Mandare email a quell'alias da fuori piattaforma è violazione esplicita ToS. La conversazione DEVE restare on-platform.
**Status:** non possiamo bypassare via email. Conferma che la fonte di canale diretto deve venire dal guest stesso (vedi Livello 3).

### 1.5 Scraping extranet viola ToS + introduce ban risk per host

**Verifica:** combinazione di tre fattori verificati:
- 2FA aggressivo: ogni nuovo device richiede codice SMS o conferma via Pulse app.
- Breach 13 aprile 2026 (fonte: theregister.com / stateofsurveillance.org): Booking ha rafforzato monitoring antifraud sugli accessi extranet. Login da IP server cloud (Fly.io, AWS, Vercel) tipici di bot vengono challenge-d.
- Conseguenza: se Booking rileva pattern scraping su un account host, sospende l'**account host** (non Premura). L'host perde property visibility su Booking.
**Implicazione per Premura:** scraping extranet farebbe perdere ai nostri clienti la loro listing Booking. È il tipo di rischio che si chiama "ban risk on customer behalf" — il peggior tipo di rischio in B2B SaaS.
**Status:** vietato per sempre. Vedi "FUORI SCOPE PERMANENTI" sezione 4.

### 1.6 Pulse iOS non espone API pubblica né Shortcuts/Share endpoints

**Verifica:** Andrea, 28 aprile 2026 (offline, metodologia da documentare in sessione successiva).
**Risultato:** nessuna API pubblica documentata su developers.booking.com per Pulse, nessuna integrazione Apple Shortcuts esposta da Booking, Daily Activity Widget mostra dati ma non accessibili programmaticamente da app terze, 2FA aggressivo blocca emulatori e bot.
**Implicazione per Premura:** Pulse è una porta più chiusa dell'extranet web. Non c'è scappatoia mobile.
**Status:** porta chiusa. Vedi "FUORI SCOPE PERMANENTI" sezione 4.
**TODO:** documentare metodologia verifica Pulse in sessione successiva (cosa è stato testato, cosa è stato trovato sui forum, output di tentativi URL scheme `booking://...`).

---

## 2. Opzioni considerate e scartate

Sette percorsi sono stati esplorati il 28 aprile 2026. Per ognuno, è documentata la ragione del NO. Se rileggi questo documento e la tua idea è in questa lista, la risposta è già stata data.

### 2.1 Booking Connectivity API direct partnership

**Cosa avrebbe risolto:** dati guest completi (nome, telefono, email, messaggi, online check-in con passaporto). Stessa esperienza di Airbnb.
**Perché scartata:** registrazioni partner chiuse a nuovi entranti (vedi 1.1). Quando riapriranno, richiedono ~50+ properties + audit + mesi onboarding. Premura V1 non eligible.
**Status:** rimandato a V2 quando avremo host base sufficiente per applicare. Non è "scartato per sempre" — è "non oggi, riconsiderare quando il contesto cambia".

### 2.2 Scraping extranet via headless browser

**Cosa avrebbe risolto:** lettura completa pannello extranet, estrazione dati guest in tempo reale.
**Perché scartata:** ToS violation + ban risk per host (vedi 1.5). Il costo non è di Premura, è del cliente. Inaccettabile.
**Status:** **NO definitivo. Mai.**

### 2.3 Second-user login extranet (Premura come collaboratore host)

**Cosa avrebbe risolto:** accesso autorizzato all'extranet con credenziali dedicate, evitando scraping nascosto.
**Perché scartata:**
- 2FA aggressivo richiede codice SMS ogni nuovo device + ogni tot tempo anche su dispositivi fissi → workflow rotto, host deve essere disponibile per inserire codici
- IP detection: login da Fly.io/AWS è challenge-d come bot
- Booking account aggiuntivi sono pensati per **persone fisiche** (collaboratori, manager, contabile), non per script. Pattern automatizzato → sospensione account host.
**Status:** **NO definitivo. Mai.**

### 2.4 Browser extension (host installa, legge DOM extranet quando lui è loggato)

**Cosa avrebbe risolto:** bypassare il problema 2FA / IP detection perché tutto avviene nel browser dell'host autenticato.
**Perché scartata in V1:**
- Adds friction onboarding (host deve installare extension, dare permessi)
- Richiede browser context dell'host attivo (non funziona se host non apre extranet)
- Fragile a cambi UI extranet (Booking aggiorna spesso il DOM)
- Per V1 troppo lavoro infrastrutturale per ROI incerto
**Status:** **possibile in V2** dopo validation con host beta. Riconsiderare quando avremo dati su quanti host vorrebbero davvero più funzionalità Booking.

### 2.5 Pulse OCR / iOS Shortcuts / reverse-engineering Pulse mobile API

**Cosa avrebbe risolto:** estrazione dati direttamente dall'app mobile dell'host.
**Perché scartata:** vedi 1.6. Pulse non espone API, niente Shortcuts, OCR è friction altissima per host (deve fare screenshot e mandarli a Premura). Reverse engineering Pulse API sarebbe scoperto rapidamente da Booking + ToS violation.
**Status:** **NO definitivo. Mai.**

### 2.6 QR code su biglietto del kit fisico al check-in

**Cosa avrebbe risolto:** survey post-check-in che cattura nome+telefono+lingua+allergie via QR scansionato dall'ospite.
**Perché scartata:** non è ragione tecnica, è **ragione di prodotto**. Decisione esplicita Andrea 28 aprile 2026:
- Aggiunge logistica fisica (stampa cartoncino, distribuzione, controllo che cleaner non si dimentichi)
- Friction su cleaner che diventa parte del flusso onboarding ospite
- Non scalabile: ogni nuova property = nuovo ciclo logistico fisico
- Premura deve essere "100% digitale, super semplice per host" — il cartoncino tradisce questa promessa
**Status:** **NO definitivo.** È una decisione di posizionamento prodotto, non un limite tecnico.

### 2.7 Whitelist domain Premura su Booking message templates (pattern Hospitable/Hostex)

**Cosa avrebbe risolto:** survey link inviato all'ospite via template scheduled di Booking, con domain Premura whitelistato sull'extranet host (4 click admin) per evitare il `[link removed]` automatico.
**Perché scartata:** non è ragione tecnica (funziona, lo fanno Hospitable e Hostex), è **ragione di prodotto**. Decisione esplicita Andrea 28 aprile 2026:
- Setup macchinoso per host (whitelist dominio + paste template + admin rights extranet)
- Conversion rate basso (template generico letto distrattamente, ospite skippa)
- Sembra "cosa già vista" — Hospitable/Hostex la fanno da anni, Premura non si differenzia
- Filosoficamente sbagliato: Premura agente AI dovrebbe **agire**, non chiedere all'ospite di compilare un form
**Status:** **NO definitivo.** Anche questa è decisione di posizionamento prodotto.

---

## 3. Decisione finale — Booking V1 a 4 livelli

Premura V1 sarà multi-canale ma con **asimmetria onesta** tra Airbnb e Booking, riconoscendo i vincoli strutturali documentati in sezione 1. Non promettiamo all'host parità di esperienza dove la piattaforma stessa non lo permette.

### Livello base — iCal Booking (M2a.1, già esistente)

Premura legge iCal Booking → conosce date bloccate + UID interno (non utile per match con email Booking). Mostra le prenotazioni Booking nella dashboard come **calendario bloccato** con stato data-poor.

**Stato implementazione:** schema `properties.icalSources` esistente. Worker iCal NON ancora costruito (scoperta del 28 apr 2026). Da costruire come parte di M2a.1 reale (BullMQ scheduler, fetcher node-ical, parser .ics, upsert idempotente). **Stima: 6-10 ore**, da scopare separatamente. Non parte di M2a.4.

### Livello 2 — Channel Manager bridge (M2b.x, post-validation primi host)

Per host che usano Smoobu, Hostaway o Lodgify: OAuth 1-click → Premura ottiene dati guest completi (nome, telefono, email, lingua) **tramite il channel manager**, che a sua volta è Connectivity Partner Booking ufficiale.

**Vantaggio:** stessa esperienza di Airbnb da quel momento, senza che Premura debba essere lei stessa Connectivity Partner.
**Limite:** un host può avere **un solo** channel manager. Se sceglie Premura come bridge, Smoobu non può più gestire Booking. Conflitto da gestire in onboarding.
**Stato:** non in M2 corrente. Prima validiamo V1, poi attacchiamo M2b.x con priorità su Smoobu (più diffuso in Italia).

### Livello 3 — Manuale dashboard host (M2a.4, prossimo lavoro)

Per host senza channel manager, dashboard Premura mostra una card "Booking incompleto" per ogni prenotazione Booking. L'host può:
- **Compilare manualmente** nome + telefono + lingua (campo libero, ~30 secondi) → attiva il workflow Premura completo su quell'ospite
- **Lasciare vuoto** se preferisce gestire quell'ospite Booking come ha sempre fatto → Premura silente per quell'ospite, mostra solo data bloccata in calendario

**Principio UX:** zero pressione. Il form è opzionale. La card non bloccante. Non sentenziamo "DEVI riempire", solo "se vuoi attivare Premura per questo ospite, eccoti il form".

**Stato:** specifica M2a.4, prossimo task. Vedi `docs/m2a4-spec.md` (da scrivere).

### Logica agente AI conseguente

Se `bookings.data_source != 'rich'` (cioè se non abbiamo telefono/lingua/nome guest), Premura:
- **NON manda messaggi pre-arrivo all'ospite** (non ha canale di contatto)
- **NON triggera Guest DNA / kit composer / OSINT enrichment**
- **MANDA notifiche all'host** sulle prenotazioni Booking ricevute (via web app dashboard + email host)
- **Gestisce kit standard se host ha richiesto fulfillment generico** (non personalizzato per guest)

Quando l'host compila il form manuale → `data_source` diventa `'booking_manual_filled'` → workflow agente AI parte normalmente da quel momento.

---

## 4. Scope M2 vs M2b vs V2

### 4.1 M2 corrente (oggi → prossime settimane)

- M2a.3 Fase 3 parser regex Booking event ingestor — fatto, mergiato in main il 27 apr 2026 (PR #8, commit 6ac8b61)
- M2a.4 — UI "Booking incompleto" + form manuale + schema bookings.data_source (vedi docs/m2a4-spec.md). Stima 3-5 giorni dev.
- M2a.1 reale — worker iCal vero da costruire (BullMQ + fetcher + parser .ics + upsert). Stima 6-10 ore. Da scopare in PR separata, NON parte di M2a.4.

### 4.2 M2b.x (post-validation primi host)

- Channel Manager bridge OAuth — priorità Smoobu (più diffuso in Italia tra host short-rental)
- Hostaway, Lodgify in M2b.2+

### 4.3 V2 (futuro, riconsiderare quando contesto cambia)

- **Booking Connectivity API direct partnership** — quando Premura avrà host base sufficiente per applicare e quando Booking riaprirà registrazioni
- **Browser extension** — quando avremo dati validation da host beta che lo richiedono esplicitamente

### 4.4 FUORI SCOPE PERMANENTI (mai, anche V2/V3)

Le seguenti opzioni sono state discusse, valutate e scartate definitivamente. Chiunque rilegga questo documento tra 6 mesi: se l'idea che ti viene è in questa lista, la risposta è **NO definitivo**. Già discussa, già scartata, motivazioni in sezione 2. Non riaprire la discussione senza prima aver trovato un cambiamento sostanziale di contesto (es. Booking ha riaperto Connectivity API a small SaaS, oppure Andrea ha cambiato filosofia di prodotto Premura).

- Scraping extranet via headless browser (sez. 2.2)
- Second-user login extranet automatizzato (sez. 2.3)
- Pulse OCR / iOS Shortcuts / reverse-engineering Pulse mobile API (sez. 2.5)
- QR code su biglietto fisico del kit (sez. 2.6) — rifiutato per ragione prodotto
- Whitelist domain Premura su template Booking message (sez. 2.7) — rifiutato per ragione prodotto

---

## 5. Quando rileggere questo documento

Rileggi e potenzialmente aggiorna questo documento quando:

- **Booking annuncia riapertura Connectivity API** a small SaaS → riconsidera 2.1, sposta da V2 a M3
- **Booking rilascia ufficialmente API Pulse mobile** → riconsidera 2.5
- **Andrea cambia filosofia prodotto** (es. "ok anche cose fisiche tipo cartoncino se conversion rate è alto") → riconsidera 2.6
- **Un competitor lancia integrazione Booking spettacolare** → analizzare come l'hanno fatto, capire se hanno trovato un percorso che noi abbiamo mancato
- **Andrea ha 10+ host attivi su Premura V1** → applicare Connectivity API partner program (anche se chiuso, fare richiesta esplicita)

Per tutto il resto: la decisione è chiusa.

---

**Versione:** 1.0
**Data decisione:** 28 aprile 2026
**Autore decisione:** Andrea Chiacchio (founder Premura)
**Documentazione:** Claude (assistente)
**Ultimo update:** 28 aprile 2026
