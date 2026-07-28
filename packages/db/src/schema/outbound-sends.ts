import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { bookings } from './bookings';
import { outboundSendStatusEnum, outboundTriggerEnum } from './enums';
import { messages } from './messages';

// Registro degli invii automatici per trigger — e il lucchetto che
// impedisce il doppio invio.
//
// QUESTO E' IL PARACADUTE PRINCIPALE (Parte 6). L'idempotenza esistente
// nel progetto (kits.welcome_message_sent_at, timestamp nullable) e'
// check-then-write: due worker che partono nello stesso istante leggono
// entrambi NULL e inviano entrambi. Qui invece il vincolo
// UNIQUE(booking_id, trigger) e' applicato dal database: il secondo
// INSERT fallisce, punto. Anche se lo scheduler parte dieci volte.
//
// Protocollo d'uso obbligatorio nel worker:
//   1. INSERT ... ON CONFLICT DO NOTHING  → se 0 righe, un altro
//      worker ha gia' preso questo (booking, trigger): esci subito.
//   2. Solo se l'INSERT e' andato a segno, chiama WhatsApp.
//   3. UPDATE della riga con esito, wamid ed eventuale errore.
// Prima si prenota il diritto di inviare, poi si invia. Mai il contrario.
//
// Un fallimento NON libera lo slot in automatico: la riga resta con
// status='failed' e va sbloccata esplicitamente dal pannello admin
// (pulsante "invia ora"), che azzera la riga. Cosi' un errore
// transitorio non innesca un loop di retry sul numero della villa.
export const outboundSends = pgTable(
  'outbound_sends',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    bookingId: uuid('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'cascade' }),

    trigger: outboundTriggerEnum('trigger').notNull(),
    status: outboundSendStatusEnum('status').notNull().default('reserved'),

    // Numero destinatario in E.164, snapshot al momento dell'invio.
    phoneE164: varchar('phone_e164', { length: 20 }).notNull(),

    // TRUE = simulazione: tutto loggato, nessuna chiamata a Meta.
    // Default true a livello applicativo (DRY_RUN=true di default).
    dryRun: boolean('dry_run').notNull().default(true),

    // Esito della verifica preventiva del numero su WhatsApp.
    // NULL = non ancora verificato. FALSE = numero non su WhatsApp,
    // l'invio viene saltato e loggato.
    phoneOnWhatsapp: boolean('phone_on_whatsapp'),

    // Template usato + lingua risolta (EN/IT) per audit del contenuto.
    templateKey: varchar('template_key', { length: 64 }),
    language: varchar('language', { length: 8 }),

    // Messaggio generato in messages (audit trail condiviso col resto
    // del progetto). Nullable in dry-run e quando l'invio fallisce prima
    // della persistenza.
    messageId: uuid('message_id').references(() => messages.id, { onDelete: 'set null' }),

    // ID Meta Cloud API del messaggio accettato (wamid.…).
    providerMessageId: varchar('provider_message_id', { length: 128 }),

    // Ritardo casuale 30-60s effettivamente applicato prima dell'invio
    // (Parte 6): tenuto per dimostrare a posteriori che non abbiamo
    // fatto raffiche.
    jitterAppliedMs: integer('jitter_applied_ms'),

    attemptCount: integer('attempt_count').notNull().default(0),
    lastError: text('last_error'),

    // Momento in cui lo slot e' stato prenotato (INSERT) e momento in
    // cui Meta ha accettato il messaggio.
    reservedAt: timestamp('reserved_at', { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
  },
  (t) => [
    // ─── IL VINCOLO ────────────────────────────────────────────────
    // Un solo invio per (prenotazione, trigger). Non negoziabile.
    uniqueIndex('outbound_sends_booking_trigger_uniq').on(t.bookingId, t.trigger),
    index('outbound_sends_status_idx').on(t.status),
    // Conteggio del tetto giornaliero (MAX_SENDS_PER_DAY): contiamo le
    // righe reali (dryRun = false) inviate nella giornata corrente.
    index('outbound_sends_sent_at_idx').on(t.sentAt),
    index('outbound_sends_dry_run_idx').on(t.dryRun, t.sentAt),
    index('outbound_sends_phone_idx').on(t.phoneE164),
  ],
);

// Sospensione delle risposte automatiche su un numero (Parte 5).
//
// Quando una persona vera risponde in chat, il bot deve tacere per
// almeno 24 ore su quel numero. Il controllo di questa tabella e'
// la PRIMA cosa che fa il generatore di risposte automatiche, prima
// ancora di classificare l'intent.
//
// Chiave sul numero e non sulla prenotazione: l'ospite scrive dallo
// stesso numero anche prima del check-in o dopo il check-out, e in
// quei momenti il legame con la prenotazione puo' non esserci.
export const conversationHandover = pgTable(
  'conversation_handover',
  {
    phoneE164: varchar('phone_e164', { length: 20 }).primaryKey(),

    // Il bot resta zitto fino a questo istante. Prolungato a ogni
    // nuovo messaggio umano in uscita su quella chat.
    until: timestamp('until', { withTimezone: true }).notNull(),

    // Perche' e' scattato: 'human_reply' (un umano ha scritto),
    // 'bot_escalation' (il bot si e' fermato e ha passato la palla),
    // 'manual' (forzato dal pannello admin).
    reason: varchar('reason', { length: 32 }).notNull(),

    // Prenotazione di riferimento quando identificabile.
    bookingId: uuid('booking_id').references(() => bookings.id, { onDelete: 'set null' }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('conversation_handover_until_idx').on(t.until)],
);
