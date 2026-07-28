import { and, asc, eq } from 'drizzle-orm';
import type { Database } from '@premura/db';
import { bookings, properties, services } from '@premura/db/schema';

/**
 * Catalogo servizi lato ospite — proiezione pubblica.
 *
 * ─── REGOLA NON NEGOZIABILE ───────────────────────────────────────
 *
 * `supplier_cost_eur` e il margine che se ne ricava NON devono comparire
 * nel payload servito all'ospite, nemmeno se il componente non li
 * renderizza. Un oggetto passato da un Server Component a un Client
 * Component viene serializzato per intero nel payload RSC e finisce nel
 * sorgente della pagina: "non lo mostro" non è protezione, il dato è
 * comunque leggibile con Ispeziona.
 *
 * Difese, in ordine:
 *  1. `PublicService` non ha campi di costo — chi provasse ad
 *     aggiungerli romperebbe il tipo di ritorno.
 *  2. La query usa `.select({...})` con le colonne elencate a mano.
 *     Mai `.select()` senza argomento, che restituirebbe la riga intera.
 *  3. Un test verifica che nessuna chiave né valore di costo compaia
 *     nel JSON serializzato.
 */

export type PublicService = {
  id: string;
  slug: string;
  category: string;
  title: string;
  description: string | null;
  photoUrl: string | null;
  /** Prezzo di vendita in euro. null quando è "su richiesta". */
  priceEur: string | null;
  priceOnRequest: boolean;
  priceUnit: string | null;
  durationLabel: string | null;
  isFeatured: boolean;
  /** Deep link WhatsApp con testo precompilato. */
  whatsappUrl: string;
};

export type PublicCatalog = {
  propertyName: string;
  guestFirstName: string | null;
  language: 'it' | 'en';
  services: PublicService[];
};

/** Numero WhatsApp ufficiale della struttura, in formato wa.me. */
function buildWhatsappUrl(phoneE164: string, serviceTitle: string, language: 'it' | 'en'): string {
  const digits = phoneE164.replace(/[^0-9]/g, '');
  const text =
    language === 'it'
      ? `Ciao! Sono interessato a: ${serviceTitle}`
      : `Hi, I'm interested in: ${serviceTitle}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

function pickLang<T>(it: T, en: T, language: 'it' | 'en'): T {
  return language === 'it' ? it : en;
}

export type LoadCatalogResult =
  | { ok: true; catalog: PublicCatalog }
  | { ok: false; reason: 'booking_not_found' };

/**
 * Carica il catalogo pubblico per una prenotazione.
 *
 * @param whatsappNumberE164 numero ufficiale della struttura (env
 *        PROPERTY_WHATSAPP_NUMBER): passato dal chiamante invece di
 *        essere letto qui, così la funzione resta pura e testabile.
 */
export async function loadPublicCatalog(
  db: Database,
  bookingId: string,
  whatsappNumberE164: string,
): Promise<LoadCatalogResult> {
  // Proiezione esplicita anche qui: della prenotazione servono solo
  // nome e lingua, non l'intera riga (che contiene email, telefono,
  // importi e payout dell'host).
  const bookingRows = await db
    .select({
      propertyId: bookings.propertyId,
      guestFirstName: bookings.guestFirstName,
      guestLanguage: bookings.guestLanguage,
      propertyName: properties.name,
    })
    .from(bookings)
    .innerJoin(properties, eq(properties.id, bookings.propertyId))
    .where(eq(bookings.id, bookingId))
    .limit(1);

  const booking = bookingRows[0];
  if (!booking) return { ok: false, reason: 'booking_not_found' };

  const language: 'it' | 'en' = booking.guestLanguage?.toLowerCase().startsWith('it') ? 'it' : 'en';

  // ⚠️ Elenco esplicito delle colonne. NON sostituire con .select():
  // supplier_cost_eur e supplier_notes finirebbero nel payload RSC.
  const rows = await db
    .select({
      id: services.id,
      slug: services.slug,
      category: services.category,
      titleEn: services.titleEn,
      titleIt: services.titleIt,
      descriptionEn: services.descriptionEn,
      descriptionIt: services.descriptionIt,
      photoUrl: services.photoUrl,
      salePriceEur: services.salePriceEur,
      priceOnRequest: services.priceOnRequest,
      priceUnitEn: services.priceUnitEn,
      priceUnitIt: services.priceUnitIt,
      durationLabelEn: services.durationLabelEn,
      durationLabelIt: services.durationLabelIt,
      isFeatured: services.isFeatured,
      sortOrder: services.sortOrder,
    })
    .from(services)
    .where(and(eq(services.propertyId, booking.propertyId), eq(services.isActive, true)))
    .orderBy(asc(services.sortOrder));

  const catalog: PublicService[] = rows.map((r) => {
    const title = pickLang(r.titleIt ?? r.titleEn, r.titleEn, language);
    return {
      id: r.id,
      slug: r.slug,
      category: r.category,
      title,
      description: pickLang(r.descriptionIt ?? r.descriptionEn, r.descriptionEn, language),
      photoUrl: r.photoUrl,
      priceEur: r.priceOnRequest ? null : r.salePriceEur,
      priceOnRequest: r.priceOnRequest,
      priceUnit: pickLang(r.priceUnitIt ?? r.priceUnitEn, r.priceUnitEn, language),
      durationLabel: pickLang(r.durationLabelIt ?? r.durationLabelEn, r.durationLabelEn, language),
      isFeatured: r.isFeatured,
      whatsappUrl: buildWhatsappUrl(whatsappNumberE164, title, language),
    };
  });

  return {
    ok: true,
    catalog: {
      propertyName: booking.propertyName,
      guestFirstName: booking.guestFirstName,
      language,
      services: catalog,
    },
  };
}

/**
 * Trasforma una riga completa di `services` nella proiezione pubblica.
 *
 * Esportata per i test: consente di verificare, partendo da una riga
 * che CONTIENE il costo fornitore, che il risultato non lo porti con sé.
 */
export function toPublicService(
  row: Record<string, unknown>,
  whatsappNumberE164: string,
  language: 'it' | 'en',
): PublicService {
  const title = String(
    (language === 'it' ? (row.titleIt ?? row.titleEn) : row.titleEn) ?? '',
  );
  const priceOnRequest = Boolean(row.priceOnRequest);
  return {
    id: String(row.id ?? ''),
    slug: String(row.slug ?? ''),
    category: String(row.category ?? ''),
    title,
    description:
      (language === 'it'
        ? ((row.descriptionIt ?? row.descriptionEn) as string | null)
        : (row.descriptionEn as string | null)) ?? null,
    photoUrl: (row.photoUrl as string | null) ?? null,
    priceEur: priceOnRequest ? null : ((row.salePriceEur as string | null) ?? null),
    priceOnRequest,
    priceUnit:
      (language === 'it'
        ? ((row.priceUnitIt ?? row.priceUnitEn) as string | null)
        : (row.priceUnitEn as string | null)) ?? null,
    durationLabel:
      (language === 'it'
        ? ((row.durationLabelIt ?? row.durationLabelEn) as string | null)
        : (row.durationLabelEn as string | null)) ?? null,
    isFeatured: Boolean(row.isFeatured),
    whatsappUrl: buildWhatsappUrl(whatsappNumberE164, title, language),
  };
}
