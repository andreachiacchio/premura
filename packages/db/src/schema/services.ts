import {
  boolean,
  decimal,
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
import { serviceCategoryEnum, serviceInquirySourceEnum } from './enums';
import { properties } from './properties';
import { providers } from './providers';

// Catalogo servizi extra venduti all'ospite durante il soggiorno
// (boat tour, transfer, chef privato, pulizia extra…).
//
// Property-scoped: ogni struttura ha il proprio listino. I prezzi
// cambiano ogni stagione, quindi vivono QUI e non nel codice — questa
// tabella e' l'unica fonte di verita' sui prezzi (vedi decisione ⑥:
// villa-cristina-guest-app fara' cutover verso questi dati).
//
// Doppio prezzo: teniamo separati il costo del fornitore e il prezzo
// di vendita all'ospite. Il margine e' una colonna generata a valle
// (sale - cost) e NON va mai esposto lato ospite: le API pubbliche
// devono selezionare esplicitamente le colonne, mai `select *`.
export const services = pgTable(
  'services',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),

    // Slug stabile per property: usato nei deep link WhatsApp e come
    // chiave di join con i template messaggio. Immutabile nel tempo
    // anche se il titolo cambia (es. 'boat-tour-full-day').
    slug: varchar('slug', { length: 64 }).notNull(),
    category: serviceCategoryEnum('category').notNull(),

    // Copy bilingue. L'ospite e' quasi sempre straniero: EN e' il
    // default, IT il fallback per ospiti italiani.
    titleEn: varchar('title_en', { length: 160 }).notNull(),
    titleIt: varchar('title_it', { length: 160 }),
    descriptionEn: text('description_en'),
    descriptionIt: text('description_it'),

    // Foto principale del servizio (URL Supabase Storage o CDN esterna).
    photoUrl: text('photo_url'),

    // ─── Prezzi (decisione ② — margine tracciato) ────────────────
    // Costo riconosciuto al fornitore (es. listino Ad Maiora per i
    // boat tour). Interno: mai esposto all'ospite.
    supplierCostEur: decimal('supplier_cost_eur', { precision: 10, scale: 2 }),
    // Prezzo pagato dall'ospite. Null quando priceOnRequest = true.
    salePriceEur: decimal('sale_price_eur', { precision: 10, scale: 2 }),

    // Servizi senza listino fisso (transfer su rotte custom, chef):
    // il catalogo mostra "on request" e il CTA apre comunque WhatsApp.
    priceOnRequest: boolean('price_on_request').notNull().default(false),

    // Unita' di vendita mostrata sotto il prezzo: 'per boat',
    // 'per person', 'per cleaning'… VARCHAR e non enum per non
    // richiedere una migration a ogni nuovo servizio.
    priceUnitEn: varchar('price_unit_en', { length: 64 }),
    priceUnitIt: varchar('price_unit_it', { length: 64 }),

    // Nome del fornitore (Ad Maiora Charter, NCC…). Interno.
    supplierName: varchar('supplier_name', { length: 160 }),
    supplierNotes: text('supplier_notes'),

    // Fornitore collegato (sezione Servizi, 30/07): quando l'ospite
    // chiede questo servizio, l'agente sa con chi parlare. Interno —
    // i contatti del fornitore non escono mai verso l'ospite.
    providerId: uuid('provider_id').references(() => providers.id, { onDelete: 'set null' }),

    // Durata/orari indicativi mostrati all'ospite (es. '7h · 9:30–16:30').
    durationLabelEn: varchar('duration_label_en', { length: 120 }),
    durationLabelIt: varchar('duration_label_it', { length: 120 }),

    // Ordinamento nel catalogo (asc). Servizi in evidenza in cima.
    sortOrder: integer('sort_order').notNull().default(100),
    isFeatured: boolean('is_featured').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('services_property_idx').on(t.propertyId),
    // Lo slug identifica il servizio dentro la property.
    uniqueIndex('services_property_slug_uniq').on(t.propertyId, t.slug),
    index('services_category_idx').on(t.category),
    // Query catalogo pubblico: servizi attivi di una property in ordine.
    index('services_property_active_idx').on(t.propertyId, t.isActive, t.sortOrder),
  ],
);

// Interesse manifestato da un ospite verso un servizio.
//
// Registrato quando l'ospite tocca il CTA WhatsApp nel catalogo o
// quando il bot riconosce l'intent nella chat. NON e' una prenotazione:
// la trattativa la chiude un umano (vedi Parte 5 — il bot non vende).
// Serve per capire quali servizi generano lead e quanto margine
// potenziale c'e' in pipeline.
export const serviceInquiries = pgTable(
  'service_inquiries',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    serviceId: uuid('service_id')
      .notNull()
      .references(() => services.id, { onDelete: 'cascade' }),

    // Nullable: un visitatore anonimo del catalogo puo' cliccare prima
    // di essere associato a una prenotazione.
    bookingId: uuid('booking_id').references(() => bookings.id, { onDelete: 'set null' }),

    source: serviceInquirySourceEnum('source').notNull(),

    // Snapshot del prezzo al momento del click: i listini cambiano a
    // stagione, ma il lead va valutato col prezzo che l'ospite ha visto.
    quotedPriceEur: decimal('quoted_price_eur', { precision: 10, scale: 2 }),

    notes: text('notes'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('service_inquiries_service_idx').on(t.serviceId),
    index('service_inquiries_booking_idx').on(t.bookingId),
    index('service_inquiries_occurred_at_idx').on(t.occurredAt),
  ],
);
