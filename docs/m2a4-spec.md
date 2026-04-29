# M2a.4 — UI "Booking incompleto" + form manuale dati guest

> **Stato:** spec scritta 28 aprile 2026, da implementare prossimi 3-5 giorni dev.
> **Riferimento strategico:** `docs/booking-strategy.md` § 3 Livello 3.
> **Scopo:** colmare il vuoto dati guest delle prenotazioni Booking (per host senza channel manager) tramite UI dashboard host che invita — senza pressione — a completare nome+telefono+lingua manualmente. Quando completato, attiva il workflow Premura agente AI completo per quell'ospite.

---

## 1. Goal e non-goal

### Goal

- Host vede a colpo d'occhio nella dashboard quali prenotazioni Booking sono "incomplete" (mancano dati guest)
- Host può cliccare e completare in 30 secondi (3 campi: nome, telefono, lingua)
- Una volta completato, Premura agente AI parte normalmente per quell'ospite (Guest DNA, kit, messaggi pre-arrivo, etc.)
- Host può lasciare la card "incompleta" senza compilare → Premura silente per quell'ospite, mostra solo data bloccata in calendario

### Non-goal

- NON è un onboarding generico. Solo prenotazioni Booking con data_source != 'rich'.
- NON sostituisce iCal / parser email Booking. È complemento quando le altre fonti non bastano.
- NON forza l'host a completare. Zero blocking modal, zero email reminder, zero notification push insistente. UX = invito calmo.
- NON gestisce caso "host vuole modificare dati di prenotazione Airbnb". Quello è altro flusso (M3+).

---

## 2. Data model — schema cambi

### 2.1 Nuovo campo bookings.data_source

Aggiungere colonna alla tabella bookings:

dataSource: varchar('data_source', { length: 32 }).notNull().default('unknown'),

Valori ammessi (enum applicativo, no Postgres enum per flessibilità futura):
- 'airbnb_email_parsed' — parser Claude email Airbnb ha estratto dati ricchi (Fase 2)
- 'booking_ical_only' — solo iCal Booking, niente nome/telefono guest
- 'booking_email_only' — solo email Booking event ingestor (codice + status), niente dati ricchi
- 'booking_manual_filled' — host ha compilato form M2a.4 (questa milestone)
- 'booking_via_channel_manager' — futuro M2b.x (Smoobu/Hostaway OAuth bridge)
- 'unknown' — default fallback, da popolare via backfill

### 2.2 Backfill record esistenti

Migration deve popolare data_source per le 16 prenotazioni La Goccia esistenti:
- Se raw_email_id IS NOT NULL AND platform = 'airbnb' → 'airbnb_email_parsed'
- Se platform = 'booking' AND raw_email_id IS NULL → 'booking_ical_only' (anche se oggi nessuna iCal Booking è in DB, copertura difensiva)
- Tutto il resto → 'unknown'

### 2.3 Indice

Aggiungere indice composito (data_source, property_id) per query dashboard "tutte le incomplete della property X":

index('bookings_data_source_property_idx').on(t.dataSource, t.propertyId),

### 2.4 Logica 'rich' vs 'incomplete'

Helper applicativo, non in DB:

// apps/web/lib/booking-data-richness.ts
export function isRichDataSource(dataSource: string): boolean {
  return [
    'airbnb_email_parsed',
    'booking_manual_filled',
    'booking_via_channel_manager',
  ].includes(dataSource);
}

Usato da workflow agente AI per decidere se attivare Guest DNA / messaggi pre-arrivo.

---

## 3. UI dashboard host

### 3.1 Lista prenotazioni — nuova colonna "Stato dati"

Sulla pagina /dashboard (o equivalente, da verificare struttura attuale prima di implementare), nella tabella prenotazioni aggiungere colonna "Stato dati":

- Completi (badge verde) — quando isRichDataSource(data_source) === true
- Incompleti (badge giallo, "completa per attivare Premura") — quando data_source IN ('booking_ical_only', 'booking_email_only')
- Sconosciuti (badge grigio, "In sincronizzazione") — quando data_source === 'unknown'

Click su badge "Incompleti" → apre modal/sheet con form manuale (sezione 3.2).

### 3.2 Form manuale "Completa dati ospite Booking"

Modal a tutta larghezza su mobile, sheet laterale su desktop. 3 campi totali. Niente di più.

Header: Completa dati ospite Booking
Subheader: Aiutaci ad attivare Premura per questa prenotazione. Codice prenotazione: 12345678 — 9-11 maggio 2026

Campo 1: Nome ospite (obbligatorio)
Campo 2: Telefono WhatsApp (obbligatorio, formato internazionale +XX...)
  - Help text: Solo numero, formato internazionale. Premura userà questo per scrivere all'ospite via WhatsApp.
Campo 3: Lingua preferita (dropdown obbligatorio: IT, EN, ES, FR, DE, PT, AR)

Pulsante: Attiva Premura per questo ospite
Link sotto: "Salta, gestisco io questo ospite"

UX rules:
- Nessun campo "email guest" — non serve, Premura usa WhatsApp
- Telefono validation client-side: deve iniziare con +, almeno 10 cifre. Server re-valida con libphonenumber-js.
- Bottone disabilitato finché tutti e 3 campi non sono valid
- Click "Salta" chiude modal senza errori, segna bookings.host_skipped_completion = true (campo nuovo, vedi 3.4)
- Submit successo: modal chiude, badge passa a verde "Completi", toast "Premura ora gestisce [Nome ospite]"

### 3.3 Card "Booking incompleto" su home dashboard

In aggiunta alla colonna nella tabella, mettere una card riassunto in alto a destra della home dashboard:

Card: "X prenotazioni Booking incomplete"
Subtext: Completa nome+telefono per attivare Premura per questi ospiti
Bottone: Vedi prenotazioni →

Click porta a vista filtrata della tabella prenotazioni con filter data_source IN ('booking_ical_only', 'booking_email_only').

Solo se conteggio > 0. Se zero, nascondi card.

### 3.4 Campo bookings.host_skipped_completion

Aggiungere boolean:

hostSkippedCompletion: boolean('host_skipped_completion').notNull().default(false),

Usato per:
- Non mostrare ripetutamente la stessa prenotazione come "da completare" se host ha esplicitamente skippato
- Filtrare conteggio card riassunto: data_source incomplete AND NOT host_skipped_completion

Nessun reminder, nessuna nag UX. Se host skippa, è chiuso. Volesse riaprire, clicca direttamente sul badge nella tabella (resta visibile, solo non conta nel conteggio top).

---

## 4. Backend — endpoint API

### 4.1 POST /api/bookings/:id/complete-manual

Endpoint web Next.js (NON apps/api worker — questo è interaction host, vive nel web).

Request body:
{
  "guestFullName": "Marco Rossi",
  "guestPhoneE164": "+393334567890",
  "guestLanguage": "it"
}

Validation:
- guestFullName: 2-100 caratteri, no whitespace-only
- guestPhoneE164: validazione libphonenumber-js, deve essere parsabile come mobile number
- guestLanguage: enum strict ['it', 'en', 'es', 'fr', 'de', 'pt', 'ar']

Effetti:
1. UPDATE bookings SET data_source = 'booking_manual_filled', guest_full_name = ..., guest_phone_e164 = ..., guest_language = ..., manual_completion_at = NOW()
2. UPSERT guest_profiles (matching su phone E164) — se profile esiste, aggiorna last_seen_at; se non esiste, crea
3. Trigger workflow agente AI: enqueue on-new-booking job per questo bookings.id (questo era previsto in apps/api/src/workflows/on-new-booking.ts ma non ancora cablato — vedi nota 6.1)
4. Return { ok: true, bookingId, guestProfileId }

Auth: verifica che bookings.host_id === current authenticated host id via Supabase Auth session.

### 4.2 POST /api/bookings/:id/skip-completion

Request body: vuoto.

Effetti:
1. UPDATE bookings SET host_skipped_completion = true
2. Return { ok: true }

Auth: stesso check come 4.1.

---

## 5. Logica agente AI — comportamento conditional

In apps/api/src/workflows/on-new-booking.ts (file esistente, oggi non cablato), aggiungere all'inizio:

import { isRichDataSource } from '@premura/shared';

export async function onNewBooking(input: OnNewBookingInput): Promise<void> {
  const booking = await loadBookingFull(input.bookingId);
  
  if (!isRichDataSource(booking.dataSource)) {
    logger.info(
      "Booking " + booking.id + " has data_source=" + booking.dataSource + ", " +
      "skipping agent workflow. Host can complete manually via dashboard."
    );
    return;
  }
  
  // ... rest of existing workflow
}

Questo significa:
- iCal Booking poll che entra come 'booking_ical_only' → workflow non parte (mancano dati guest)
- Email Booking parser entra come 'booking_email_only' → workflow non parte
- Quando host completa form → 'booking_manual_filled' → workflow parte da quel momento
- Airbnb email parser → 'airbnb_email_parsed' → workflow parte normalmente (caso oggi attivo)

---

## 6. Note tecniche

### 6.1 Cabling workflow on-new-booking

Oggi il file apps/api/src/workflows/on-new-booking.ts esiste ma non è cablato a nessun trigger. Questa milestone richiede di cablarlo a:
- POST /api/bookings/:id/complete-manual (sezione 4.1) — chiamata sincrona dopo UPDATE
- Future trigger Airbnb email parser quando arriva nuova prenotazione (oggi crea booking ma non lancia workflow)
- Future trigger iCal worker (ma con guard isRichDataSource ritorna subito)

Cablare significa: enqueue su BullMQ + Redis (vedi infrastruttura M2a.1 worker, ancora da costruire). Per M2a.4 sufficiente chiamata sincrona inline, BullMQ è ottimizzazione successiva.

### 6.2 manual_completion_at audit field

Aggiungere manual_completion_at: timestamp per tracciare quando host ha completato. Utile per metriche prodotto (quanto tempo passa tra creazione booking e completion?).

### 6.3 Bisogna esistere UI dashboard

Stamattina abbiamo verificato che apps/web/app/properties/ NON esiste. Verifica analoga andrà fatta per apps/web/app/dashboard/ o apps/web/app/bookings/ prima di partire con implementazione. Se non esiste UI dashboard, M2a.4 cresce di scope (da "aggiungi UI a dashboard esistente" a "costruisci dashboard + aggiungi UI"). Da scopare separatamente.

### 6.4 Mobile-first

Premura è PWA mobile-first. Form deve funzionare bene su smartphone in portrait. Modal a schermo intero su mobile, sheet laterale su desktop (>768px).

---

## 7. Definition of Done

- Schema bookings.data_source + host_skipped_completion + manual_completion_at deployati a DB Supabase
- Backfill record esistenti eseguito (verificato che 16 prenotazioni La Goccia hanno valore corretto)
- Helper isRichDataSource() in packages/shared o equivalente
- Workflow on-new-booking ha guard isRichDataSource
- POST /api/bookings/:id/complete-manual implementato + auth check + validation
- POST /api/bookings/:id/skip-completion implementato
- UI tabella prenotazioni con colonna "Stato dati" + badge
- UI modal/sheet form manuale con 3 campi
- UI card "X prenotazioni Booking incomplete" su home (solo se count > 0)
- Test E2E manuale: prendere una delle 16 La Goccia bookings, simularla come Booking incompleta (UPDATE manuale), aprire dashboard, vedere card+badge, cliccare, compilare form, verificare che workflow parte e booking passa a data_source = 'booking_manual_filled'
- PR con review checklist completa

---

## 8. Stima

3-5 giorni dev (1 dev). Breakdown indicativo:
- Schema migration + backfill: 0.5 giorni
- Backend endpoint + helper + cablatura workflow: 1 giorno
- UI dashboard list + badge: 1 giorno
- UI modal form: 1 giorno
- Test E2E + bug fix: 0.5-1 giorno

Se UI dashboard non esiste oggi (sezione 6.3), aggiungere 1-2 giorni per costruirla.

---

**Versione:** 1.0
**Data spec:** 28 aprile 2026
**Autore:** Claude (assistente) basato su decisione strategica Andrea Chiacchio
**Riferimento bibbia:** docs/booking-strategy.md
