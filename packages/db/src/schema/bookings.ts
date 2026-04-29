import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
  decimal,
  boolean,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { platformEnum, bookingStatusEnum } from './enums';
import { properties } from './properties';

// Prenotazione. Entry point di ogni workflow Premura.
// Ingested via iCal polling (M2a.1) o email parsing Gmail (M2a.3 Fase 2).
//
// Convivenza iCal ↔ email: la stessa prenotazione arriva sia via iCal
// (PII mascherata: guest_full_name = "Reserved") sia via email Airbnb
// (PII piena). L'email arricchisce la riga creata da iCal usando la
// chiave (property_id, booking_external_code), preservando i dati iCal
// quando le email mancano (es. checkin_at iCal viene preservato; il
// nome "Reserved" viene sovrascritto col nome reale dell'ospite).
export const bookings = pgTable(
  'bookings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),

    platform: platformEnum('platform').notNull(),
    // Riferimento univoco sulla piattaforma origine (iCal UID o booking ID).
    // La coppia (platform, platformBookingRef) è usata per dedup iCal.
    platformBookingRef: varchar('platform_booking_ref', { length: 128 }).notNull(),

    // Codice prenotazione user-facing (Airbnb: HM4XDFHECP, Booking: 1234567890).
    // Estratto dall'email; può essere null se la riga arriva solo via iCal
    // (Airbnb iCal non lo espone in modo affidabile).
    bookingExternalCode: varchar('booking_external_code', { length: 64 }),

    // Dati ospite dalla piattaforma.
    // Da iCal arrivano "Reserved" / null; da email Airbnb arrivano completi.
    guestFullName: varchar('guest_full_name', { length: 255 }).notNull(),
    guestFirstName: varchar('guest_first_name', { length: 128 }),
    guestCountryCode: varchar('guest_country_code', { length: 2 }),
    guestLanguage: varchar('guest_language', { length: 8 }),
    guestAgeApprox: integer('guest_age_approx'),
    guestEmail: varchar('guest_email', { length: 255 }),
    guestPhone: varchar('guest_phone', { length: 32 }),

    // Messaggio iniziale dell'ospite. Lo memorizziamo NELLA LINGUA ORIGINALE
    // (non la traduzione automatica Airbnb) perché serve a Guest DNA per
    // capire chi è veramente l'ospite.
    guestMessageOriginal: text('guest_message_original'),
    guestMessageLang: varchar('guest_message_lang', { length: 8 }),

    // Opt-in ospite per contatto via WhatsApp (canale primario).
    // Se null → non ancora chiesto; se false → fallback obbligato su inbox piattaforma.
    whatsappOptIn: boolean('whatsapp_opt_in'),

    numGuests: integer('num_guests').notNull().default(1),
    numAdults: integer('num_adults').notNull().default(1),
    numChildren: integer('num_children').notNull().default(0),

    checkinAt: timestamp('checkin_at', { withTimezone: true }).notNull(),
    checkoutAt: timestamp('checkout_at', { withTimezone: true }).notNull(),
    nights: integer('nights').notNull(),
    totalPriceEur: decimal('total_price_eur', { precision: 10, scale: 2 }),

    // Compenso netto host (post-fee Airbnb/Booking). Da email parsing.
    hostPayoutAmount: decimal('host_payout_amount', { precision: 10, scale: 2 }),
    hostPayoutCurrency: varchar('host_payout_currency', { length: 3 }),

    // URL listing piattaforma origine (utile in dashboard).
    listingUrl: text('listing_url'),

    // Tracking sync email: quale Gmail message ID ha arricchito questa
    // riga, e quando. Usato per idempotenza (skip se già processato).
    rawEmailId: varchar('raw_email_id', { length: 128 }),
    lastEmailSyncedAt: timestamp('last_email_synced_at', { withTimezone: true }),

    // Profilo ospite associato (host-scoped guest directory). Nullable
    // perché bookings creati via iCal con guest_full_name='Reserved' non
    // hanno ancora un profilo identificabile.
    // FK a guest_profiles dichiarata nella migration SQL (evita ciclo import).
    guestProfileId: uuid('guest_profile_id'),

    // Nota libera dell'ospite al momento della prenotazione
    guestNote: text('guest_note'),
    status: bookingStatusEnum('status').notNull().default('confirmed'),

    // Origine dei dati prenotazione: determina se il workflow agente AI parte
    // (Guest DNA, messaggi pre-arrivo, kit composer) o resta silente per
    // quella prenotazione.
    // Enum applicativo, niente Postgres enum per lasciare flessibilita di
    // evoluzione futura senza migration.
    // Valori ammessi:
    // - 'airbnb_email_parsed'         (RICH)        parser email Airbnb ha estratto dati ricchi
    // - 'booking_manual_filled'       (RICH)        host ha compilato form M2a.4
    // - 'booking_via_channel_manager' (RICH)        futuro M2b.x (Smoobu/Hostaway OAuth bridge)
    // - 'booking_ical_only'           (INCOMPLETE)  solo iCal Booking, niente nome/telefono
    // - 'booking_email_only'          (INCOMPLETE)  solo email Booking event ingestor
    // - 'unknown'                     fallback default, popolato via backfill
    // Solo i valori RICH abilitano il workflow agente AI completo.
    // Vedi docs/booking-strategy.md sezione 3 e docs/m2a4-spec.md sezione 2.1.
    dataSource: varchar('data_source', { length: 32 }).notNull().default('unknown'),

    // Host ha cliccato "Salta" sulla card Booking incompleto: la prenotazione
    // viene rimossa dal conteggio top della home dashboard, ma il badge sulla
    // riga resta visibile nella lista prenotazioni (l'host puo sempre tornare
    // a compilare il form quando vuole).
    hostSkippedCompletion: boolean('host_skipped_completion').notNull().default(false),

    // Timestamp del completion form manuale (M2a.4). Usato per metriche
    // prodotto: percentuale host che compila e latenza dalla notifica al
    // complete.
    manualCompletionAt: timestamp('manual_completion_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('bookings_property_idx').on(t.propertyId),
    // Dedup iCal: stessa booking non può essere ingerita due volte.
    uniqueIndex('bookings_platform_ref_uniq').on(t.platform, t.platformBookingRef),
    // Dedup email: la stessa prenotazione Airbnb (codice HM…) per stessa
    // property arriva sia da iCal sia da email. Indice partial perché
    // molte righe iCal-only non hanno il codice esterno.
    uniqueIndex('bookings_property_external_code_uniq')
      .on(t.propertyId, t.bookingExternalCode)
      .where(sql`"booking_external_code" IS NOT NULL`),
    index('bookings_checkin_idx').on(t.checkinAt),
    index('bookings_status_idx').on(t.status),
    index('bookings_created_at_idx').on(t.createdAt),
    index('bookings_guest_profile_idx').on(t.guestProfileId),
    // Query dashboard "tutte le prenotazioni incomplete della property X"
    // (filtro per data_source + scope per property). Vedi docs/m2a4-spec.md
    // sezione 2.3.
    index('bookings_data_source_property_idx').on(t.dataSource, t.propertyId),
  ],
);
