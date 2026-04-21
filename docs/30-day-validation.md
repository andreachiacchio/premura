# Test di validazione 30 giorni

> Obiettivo: validare il modello GiftTube sulle 3 strutture di Andrea a Napoli PRIMA di scrivere codice serio. Costo totale stimato: €250.

## Perché validare prima

Il rischio più grande di GiftTube non è la tecnologia (fattibile) né il prezzo (chiaro) — è la **logistica fisica col cleaner**. Se Maria non collabora con entusiasmo, tutto il modello salta. Un mese di test manuale risponde a questa domanda con €250, invece che €50k dopo l'MVP.

## Setup (giorno 0)

### 1. Parla con Maria (o chi pulisce)

Script esatto:
> "Maria, sto testando un servizio nuovo per migliorare le recensioni. Per ogni ospite che arriva, voglio farti trovare un piccolo regalo a casa tua il giorno prima (vino, sfogliatelle, un biglietto). Tu quando pulisci lo sistemi sul tavolo, fai una foto e me la mandi. Ti pago €3 in più per ogni volta. Ci stai?"

Se sì → parti. Se no → chiedi perché, e capisci se è un problema Maria-specifica o un problema del modello.

### 2. Setup acquisti

Compra questi 4 kit pre-confezionati e tienili a casa tua (o portali a Maria in anticipo):

**Kit A — Classico Napoli (€10)**
- Bottiglia Falanghina del Sannio 0.375L (€6.50)
- Pacchetto sfogliatelle sottovuoto Poppella (€3.50)
- Biglietto scritto a mano

**Kit B — Famiglia (€10)**
- Succhi bio per bambini confezione (€4)
- Biscotti bio (€3.50)
- Cartoline di Napoli per bambini (€2.50)

**Kit C — Romantico (€12)**
- Bollicine mini (€6)
- Cioccolato di Modica (€3.50)
- Tappi per orecchie in cera (€2)
- Biglietto scritto a mano

**Kit D — Business (€8)**
- Taralli napoletani (€3)
- Tisana rilassante (€3)
- Biglietto scritto a mano (€2 effort tuo)

Totale acquisti iniziali: ~€40 × 5 di scorta = **€200**

### 3. Biglietti scritti a mano

Per ora li scrivi tu. Usa carta buona (esiste su Amazon a €5 per 20 biglietti con busta). Penna stilografica o marker sottile. Frasi tipo:

- Olandese/tedesco: "Welcome, we are happy to host you. Enjoy Napoli!"
- Italiano: "Benvenuti, un piccolo pensiero per l'arrivo. Buon soggiorno!"
- Inglese: "Welcome. A small taste of Napoli to start your stay."
- Francese: "Bienvenue à Naples. Un petit cadeau pour bien commencer."

Non firmare. Resta universale.

## Flusso operativo (per ogni ospite)

### T-48h (due giorni prima del check-in)

1. Guarda chi arriva (nome, nazionalità, gruppo)
2. Scegli il kit più appropriato usando questa tabella rapida:
   - Olandese/tedesco → Kit A + tappi extra (se centro storico)
   - Famiglia con bambini → Kit B
   - Coppia senza bambini, weekend, spesa alta → Kit C
   - Business traveler (1 persona, feriali) → Kit D
   - Dubbio → Kit A
3. Scrivi il biglietto con nome dell'ospite
4. Manda WhatsApp a Maria:
   > "Ciao Maria, mercoledì 30 arriva Anna a La Goccia, 2 notti. Ti porto Kit A domani sera. Sistemalo come al solito, foto quando hai finito. €3 extra. Ok?"

### T-24h (giorno prima del check-in)

1. Porta il kit a Maria (o lascialo dove concordato)
2. Manda messaggio all'ospite via Booking/Airbnb (te lo scrivo sotto)

### Giorno del check-in

1. Maria pulisce, sistema kit, scatta foto, manda a te
2. Tu verifichi che sia tutto ok
3. Paghi €3 a Maria (Satispay o contanti a fine mese — concorda)

### Giorno 2 del soggiorno, sera

Manda messaggio all'ospite via piattaforma:
> "Ciao [Nome], come va? Spero che Napoli ti stia accogliendo bene. Se hai bisogno di qualsiasi cosa, scrivi pure."

### 24h dopo il check-out

Manda messaggio privato all'ospite (via email o piattaforma):
> "Ciao [Nome], grazie per essere stato con noi. Prima che lasci la recensione pubblica, vorrei chiederti in privato: c'è qualcosa che avremmo potuto fare meglio? Il tuo feedback onesto ci aiuta tantissimo. Grazie mille!"

Se risponde negativo → gestisci problema prima che scriva recensione.
Se risponde positivo → rispondi con gratitudine + chiedi gentilmente recensione pubblica.

## Template messaggi

Salvali nelle note del telefono per copia-incolla veloce.

### Pre-arrival (T-24h)

IT: "Ciao [Nome], ti aspettiamo domani a [Struttura]. Abbiamo preparato un piccolo pensiero per il tuo arrivo. A presto!"

EN: "Hi [Name], we can't wait to host you tomorrow at [Property]. A little surprise is waiting for you. See you soon!"

NL: "Hallo [Name], wij kijken ernaar uit om je morgen te verwelkomen. Een kleine verrassing wacht op je. Tot morgen!"

### Day 2 check-in

IT: "Ciao [Nome], come va? Napoli ti sta piacendo? Scrivimi se hai bisogno di qualcosa."

EN: "Hi [Name], how's it going? Enjoying Napoli so far? Let me know if you need anything."

### Post-stay recovery

IT: "Ciao [Nome], grazie per esserti fermato da noi. Se c'è qualsiasi cosa che avremmo potuto fare meglio, scrivimi in privato — il tuo feedback onesto vale oro. Grazie!"

## KPI da tracciare

Foglio Excel con queste colonne per ogni ospite:

| Data | Ospite | Paese | Struttura | Kit usato | Costo kit | Tempo Andrea | Tempo Maria | Recensione prima | Recensione ottenuta | Note |

Obiettivo: dopo 30 giorni hai dati veri per rispondere a:

1. La media recensioni è salita? (hypothesis: da 8.2 → 9+)
2. Quanto tempo Andrea ha speso realmente a settimana? (target: < 2 ore)
3. Maria è stata collaborativa? Ha mai rifiutato o tardato?
4. Quanti kit hanno generato feedback esplicito dell'ospite ("grazie per il regalo")?
5. Quante recovery post-stay hanno evitato recensioni negative?

## Scenario di fallimento

Se dopo 30 giorni vedi:
- Maria si lamenta del lavoro extra → la logistica cleaner non scala, devi cambiare modello (magari corrieri)
- Ospiti non reagiscono al kit nelle recensioni → il kit non vale il costo, ridimensiona
- Media recensioni invariata → il problema non era il kit, indaga altro (check-in? pulizia? prezzo?)

Se invece i numeri confermano l'ipotesi → **hai prova concreta** per partire con l'MVP tech, raccogliere early users, fare fundraising se vuoi.

## Budget finale test

- Acquisti iniziali kit: €200
- Pagamento Maria (stima 15-20 kit): €45-60
- Carta biglietti + penne: €15
- **Totale: ~€275**

Per avere la risposta se un'idea vale €100k di sviluppo, €275 è il miglior ROI investment che farai quest'anno.

## Prossimo step dopo il test

Se il test conferma, questi sono i primi 3 moduli da sviluppare in ordine:

1. Webhook ingest Booking + Airbnb → DB
2. Guest DNA agent + Kit Composer (il cuore)
3. WhatsApp Business integration per cleaner briefing

Gli altri pezzi (dashboard, Stripe, OSINT) vengono dopo.
