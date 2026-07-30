import { z } from 'zod';

// Parte PURA della sezione Servizi (30/07): schema di validazione,
// categorie, etichette e slug. Vive separata dal repository perche'
// la importa anche il client component — il repository trascina
// @premura/db (e quindi postgres/net) che non puo' entrare nel bundle
// browser.

export const SERVICE_CATEGORIES = [
  'boat_tour',
  'transfer',
  'chef',
  'cleaning',
  'wellness',
  'rental',
  'food_delivery',
  'other',
] as const;

export const CATEGORY_LABELS: Record<(typeof SERVICE_CATEGORIES)[number], string> = {
  boat_tour: 'Tour in barca',
  transfer: 'Transfer',
  chef: 'Chef privato',
  cleaning: 'Pulizia extra',
  wellness: 'Benessere',
  rental: 'Noleggio',
  food_delivery: 'Cibo a domicilio',
  other: 'Altro',
};

// Validazione input del form. Il prezzo viaggia come stringa ("120" o
// "120,50") perche' decimal in Drizzle e' string-typed; la coerenza
// numerica la garantisce la regex.
export const serviceFormSchema = z.object({
  titleEn: z.string().trim().min(2, "Il nome (inglese) serve: è quello che vede l'ospite"),
  titleIt: z.string().trim().max(160).optional().or(z.literal('')),
  category: z.enum(SERVICE_CATEGORIES),
  descriptionEn: z.string().trim().max(4000).optional().or(z.literal('')),
  descriptionIt: z.string().trim().max(4000).optional().or(z.literal('')),
  photoUrl: z.string().trim().url('URL foto non valido').optional().or(z.literal('')),
  salePriceEur: z
    .string()
    .trim()
    .regex(/^\d{1,7}([.,]\d{1,2})?$/, 'Prezzo non valido (es. 120 o 120,50)')
    .optional()
    .or(z.literal('')),
  priceOnRequest: z.boolean().default(false),
  providerId: z.string().uuid().optional().or(z.literal('')),
});

export type ServiceFormValues = z.infer<typeof serviceFormSchema>;

/** "Boat tour Full Day" -> "boat-tour-full-day" */
export function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'servizio'
  );
}

export type ServiceRow = {
  id: string;
  slug: string;
  category: string;
  titleEn: string;
  titleIt: string | null;
  descriptionEn: string | null;
  descriptionIt: string | null;
  photoUrl: string | null;
  salePriceEur: string | null;
  priceOnRequest: boolean;
  providerId: string | null;
  providerName: string | null;
  isActive: boolean;
  sortOrder: number;
};
