# Premura — Visione di Prodotto v1.0

**Status:** v1.0 (27 aprile 2026) — primo formal write-up della visione di prodotto.
**Owner:** Andrea Chiacchio  
**Audience:** founder, futuri co-founder, investitori early stage

---

## 1. Cosa è Premura

Premura è un **agente AI autonomo** che vive durante il soggiorno dell'ospite di un host short-rental, ascolta tutti i canali (WhatsApp + Airbnb chat + Booking chat), capisce esigenze, propone azioni concrete e le esegue in autonomia entro budget pre-approvato dall'host. L'host approva con 1 tap solo quando serve.

**Differenziatore:** NON "AI che suggerisce risposte" (Hospitable, Smoobu, Hostaway). MA "AI che agisce".

---

## 2. Filosofia di intervento — 4 livelli

In priorità decrescente:

**Livello 1 — Prevenzione strutturale**  
Premura conosce property (knowledge base) e adatta proattivamente kit + FAQ. Esempio: La Goccia in centro storico → tappi nel kit default, sempre.

**Livello 2 — Risoluzione silenziosa**  
Domande info, recommendations, conversazione casual. Premura risponde sola, host non vede.

**Livello 3 — Escalation controllata (rischio recensione)**  
Problemi seri (non dorme, lamentele, attrezzatura rotta). Premura prepara 2-3 opzioni concrete con costo e notifica all'host con marca "RISCHIO RECENSIONE". Host sceglie 1 tap.

**Livello 4 — Escalation piena**  
Conflitti, refund, legali → host prende controllo completo.

---

## 3. Stack agentico (M4-M5)

- **Glovo Business API** — confermata disponibile, [business.glovoapp.com](http://business.glovoapp.com), onboarding 2-4 settimane
- **Amazon** — no API autonomous, workaround link checkout pre-compilato con tap host
- **WhatsApp Business Cloud API** — ufficiale Meta, multi-tenant complesso (M3+)
- **Free Now / TheFork / partner pharmacy locali** — M5+

---

## 4. Wallet system

Premura anticipa spesa con carta business propria, riaddebita host via Stripe mensilmente.

Markup tier:
- < €10: +€0.50 markup
- €10-30: +€1
- €30-100: +€2
- > €100: +€3

Stima revenue passive da fees: 50 host × 5 azioni/mese × €1 = **€250/mese** aggiuntivi.

---

## 5. Kit — no catalogo fisso

Decisione esplicita: il kit è scelto da Premura caso per caso usando knowledge base property + Guest DNA + segnali email. NO catalogo predefinito ("altrimenti la gente ci sorpassa"). 

Il survey ospite resta SOLO per:
- Catturare WhatsApp
- Allergie/vincoli  
- Preferenza frequenza contatto

Il survey NON chiede "cosa vuoi nel kit" — Premura decide.

---

## 6. Roadmap (alta livello)

- **M2** (in corso): Infrastruttura email parser + WhatsApp + inbox unificata
  - Fase 1 ✅ OAuth Gmail
  - Fase 2 ✅ Parser AI Airbnb (16 prenotazioni create da 107 email, validato)
  - Fase 3 (in corso): Booking event ingestor (regex puro, no AI)
- **M2a.4**: Survey post-booking opt-in (cattura telefono + allergie + preferenze)
- **M2c**: Property knowledge base + onboarding intervista 12 domande
- **M3**: AI compose + reply automation multi-canale + categorizzazione rischio recensione
- **M4**: Tool use agent + Glovo + Amazon wallet + Stripe billing
- **M5+**: Espansione tool stack
- **M6**: Beta 50 host


---

## 7. Note di processo

Questo documento è la **base per le decisioni di prodotto**. Quando in futuro arriverà la tentazione di costruire feature "perché bella" o "perché competitor lo fa", la prima domanda sarà: "Avvicina o allontana Premura dall'agente che agisce?".

Se non avvicina → de-prioritizza, anche se è feature richiesta dall'host. Premura non vince diventando un competitor migliore di Hospitable. Vince essendo categoria diversa.
