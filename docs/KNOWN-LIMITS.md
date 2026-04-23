# KNOWN-LIMITS — Premura

> Limiti architetturali noti al 22 aprile 2026. Da rivedere ad ogni fase
> della ROADMAP e aggiornare quando cambia l'evidenza.

---

## 1. Buco Airbnb inbox

**Problema.** L'API ufficiale di Airbnb è chiusa a chi non è channel manager
certificato. Messaggi inbound arrivano solo via email forwarding (parser
lato nostro). Risposta bidirezionale diretta sul thread Airbnb non è
garantita: o reply via email (da verificare se finisce davvero nel thread)
o via WhatsApp, che richiede opt-in ospite.

**Impatto stimato.** 20-30% delle conversazioni potenziali (ospiti che
arrivano da Airbnb senza opt-in WhatsApp). Per questo slice, Conversation
Agent può solo leggere e classificare, non rispondere in autonomia.
Fallback automatico: escalation all'host, che risponde dal proprio account
Airbnb sul Mac/telefono. Nei fatti, per questi ospiti l'agente lavora in
modalità "draft permanente" invece che auto.

**Mitigazione futura.**
- Verifica empirica se la reply alla notifica email Airbnb finisce nel
  thread (test rapido in Fase 5).
- Rinforzare opt-in WhatsApp dal quiz pre-arrivo ("per ricevere la foto del
  kit la mattina del check-in").
- Partnership Booking Partner API come precedente (se/quando approvata),
  e monitorare se Airbnb apre API inbox in futuro.

---

## 2. Voice profile fragile nei primi ospiti

**Problema.** Modo 2 (analisi 20-30 messaggi passati dell'host) dà voice
profile ricco ma richiede accesso alla history Booking/Airbnb, oggi
limitato dalle stesse API chiuse. Modo 1 (3-4 domande onboarding) dà solo
segnali grossolani: formality, emoji, lunghezza media, firma.

**Impatto stimato.** Per i primi 5-10 ospiti di ogni host nuovo, i
messaggi generati da Premura potrebbero suonare "non esattamente te".
Rischio: host percepisce scollamento e forza tutto a Draft o disattiva
l'autopilot per paranoia. Questo neutralizza il valore percepito del
prodotto nelle prime settimane di utilizzo.

**Mitigazione futura.**
- Feedback loop implicito: ogni volta che l'host riscrive manualmente un
  draft, memorizzare il delta (before/after) e usarlo come segnale
  d'aggiornamento del voice profile.
- UI "incolla 5-10 tuoi messaggi passati" in onboarding per chi non ha
  accesso API.
- Prompt engineering con default "tono neutro caldo italiano" + esempi
  quando il voice profile ha poche features estratte.

---

## 3. Latenza Conversation Agent target <10s

**Problema.** Pipeline attuale pianificata: webhook WhatsApp → BullMQ
queue → worker → 5 query context (DNA + property_kb + voice_profile +
autopilot_rules + history) → Claude Sonnet 4.6 (4-8s tipici su prompt
grossi) → WhatsApp send (1-2s). Budget stretto per stare sotto 10s in
modo consistente.

**Impatto stimato.** In ~20% dei casi il target salta: Claude rallenta,
context si ingrossa con conversazioni lunghe, rete fa fatica. L'ospite
percepisce il ritardo e l'illusione "rispondi come l'host stesso" si
rompe. Per i casi in cui il ritardo supera i 30s, il problema è più grave
(l'ospite nel frattempo ha mandato altri messaggi, o ha chiuso la chat).

**Mitigazione futura.**
- Prompt caching Anthropic sui system prompt + property_knowledge_base
  (riduzione TTFB ~30-50% secondo Anthropic docs).
- Context minimization: ultimi 5-10 messaggi + riassunto generato una
  tantum sui precedenti, invece di 20 messaggi raw ogni volta.
- "Typing indicator" via WhatsApp Cloud API per mascherare attese fino a
  20s senza perdere percezione di reattività.
- Router preliminare con Claude Haiku 4.5 per classificare intent (1-2s),
  poi Sonnet solo per il draft della risposta.
- Budget di latenza per componente misurato in Axiom, alert se p95 > 8s.

---

_Ultimo aggiornamento: 22 aprile 2026 — Andrea Chiacchio, fondatore_
