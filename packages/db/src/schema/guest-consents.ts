import { index, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { bookings } from './bookings';
import { consentActionEnum, consentSourceEnum } from './enums';

// Registro dei consensi WhatsApp — append-only.
//
// Perche' una tabella eventi e non solo il flag bookings.whatsapp_opt_in:
// se un ospite contesta ("non ho mai autorizzato"), il flag booleano
// non prova nulla. Serve la storia completa — quando ha dato il
// consenso, da dove, con quale testo davanti agli occhi, e quando
// eventualmente l'ha revocato.
//
// Regole:
//  - NESSUN UPDATE, NESSUN DELETE: ogni cambio di stato e' una riga nuova.
//    Lo stato corrente e' l'evento piu' recente per booking.
//  - bookings.whatsapp_opt_in resta come cache denormalizzata per le
//    query veloci dello scheduler, ma la verita' legale sta qui.
//  - consent_text_version registra QUALE testo l'ospite ha accettato:
//    se un domani cambiamo la formula, i consensi vecchi restano
//    verificabili contro il testo che era in vigore allora.
//
// Cancellazione GDPR (art. 17): la funzione di erasure anonimizza le
// righe di questo registro invece di eliminarle — si azzerano ip_hash
// e user_agent, si mantengono action/occurred_at/consent_text_version
// come prova che il trattamento era lecito quando e' avvenuto.
export const guestConsentEvents = pgTable(
  'guest_consent_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    bookingId: uuid('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'cascade' }),

    action: consentActionEnum('action').notNull(),
    source: consentSourceEnum('source').notNull(),

    // Numero in formato E.164 (+39…) validato prima dell'insert.
    // Snapshot: se l'ospite corregge il numero, il consenso vecchio
    // resta legato al numero a cui era stato riferito.
    phoneE164: varchar('phone_e164', { length: 20 }),

    // Identificatore del testo di consenso accettato, es.
    // 'whatsapp-services-v1-en'. I testi vivono nei file template.
    consentTextVersion: varchar('consent_text_version', { length: 64 }),

    // Prova tecnica minima, in forma non identificante.
    //
    // HMAC-SHA256(ip, pepper) e NON sha256(ip) semplice: lo spazio
    // degli IPv4 è di 4 miliardi di valori, quindi un hash senza
    // segreto si inverte con una tabella precalcolata in pochi minuti —
    // sarebbe un dato personale travestito da anonimo. Il pepper vive
    // in CONSENT_IP_PEPPER (env, mai in repo).
    //
    // Senza pepper configurato il campo resta NULL: meglio nessuna
    // prova tecnica che una prova che è essa stessa una violazione.
    // Il consenso resta comunque dimostrabile con testo versionato +
    // timestamp + canale.
    //
    // pepper_version consente la rotazione del segreto: gli hash
    // vecchi restano verificabili contro il pepper con cui sono nati.
    ipHmac: varchar('ip_hmac', { length: 64 }),
    ipPepperVersion: varchar('ip_pepper_version', { length: 16 }),
    userAgent: varchar('user_agent', { length: 255 }),

    // Chi ha registrato l'evento quando non e' l'ospite stesso
    // (es. host che spunta il flag nel pannello admin per un consenso
    // raccolto a voce). NULL = azione dell'ospite.
    recordedByHostId: uuid('recorded_by_host_id'),

    notes: text('notes'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('guest_consent_events_booking_idx').on(t.bookingId),
    // Stato corrente = ultimo evento per booking.
    index('guest_consent_events_booking_occurred_idx').on(t.bookingId, t.occurredAt),
    index('guest_consent_events_phone_idx').on(t.phoneE164),
  ],
);
