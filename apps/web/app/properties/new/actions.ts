'use server';

import { getCurrentHostId } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { geocodeAddress } from '@/lib/geocode';
import { upsertPropertyKnowledge } from '@/lib/repositories/property-knowledge';
import { type ListingImportData, extractListingData } from '@premura/agents';
import { properties } from '@premura/db';
import { normalizeLanguage } from '@premura/shared';
import { redirect } from 'next/navigation';
import { z } from 'zod';

// Server actions del wizard "Aggiungi struttura" con import da annuncio.
//
// Fonte dell'import: l'HOST — incolla il testo del proprio annuncio o
// carica screenshot. Niente scraping server-side di Booking/Airbnb
// (bloccano i datacenter, lo vietano nei ToS). Claude estrae, il wizard
// precompila, l'host corregge. Mai inventare: campo assente = vuoto.

export type ImportResult = { ok: true; data: ListingImportData } | { ok: false; error: string };

const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const);
type AllowedImageType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';

export async function importListingAction(formData: FormData): Promise<ImportResult> {
  await getCurrentHostId(); // solo host autenticati: la chiamata Claude costa

  const text = String(formData.get('listingText') ?? '').trim();
  const files = formData.getAll('screenshots').filter((f): f is File => f instanceof File);

  if (!text && files.length === 0) {
    return { ok: false, error: "Incolla il testo dell'annuncio o carica almeno uno screenshot." };
  }
  if (files.length > 3) {
    return { ok: false, error: 'Massimo 3 screenshot.' };
  }

  const images: Array<{ mediaType: AllowedImageType; base64: string }> = [];
  for (const file of files) {
    if (!ALLOWED_IMAGE_TYPES.has(file.type as AllowedImageType)) {
      return { ok: false, error: `Formato non supportato: ${file.type || 'sconosciuto'}.` };
    }
    if (file.size > MAX_SCREENSHOT_BYTES) {
      return { ok: false, error: `Screenshot troppo grande (max 5 MB): ${file.name}` };
    }
    const buf = Buffer.from(await file.arrayBuffer());
    images.push({ mediaType: file.type as AllowedImageType, base64: buf.toString('base64') });
  }

  try {
    const result = await extractListingData({ text: text || undefined, images });
    return { ok: true, data: result.data };
  } catch (err) {
    console.error('[wizard] import annuncio fallito', err);
    return {
      ok: false,
      error: "Non sono riuscito a leggere l'annuncio. Riprova, o compila i campi a mano.",
    };
  }
}

export type GeocodeResult =
  | { ok: true; latitude: number; longitude: number; displayName: string }
  | { ok: false; error: string };

export async function geocodeAddressAction(query: string): Promise<GeocodeResult> {
  await getCurrentHostId();
  const q = query.trim();
  if (q.length < 5) return { ok: false, error: 'Indirizzo troppo corto per la verifica.' };
  try {
    const hit = await geocodeAddress(q);
    if (!hit) return { ok: false, error: 'Indirizzo non trovato. Prova ad aggiungere la città.' };
    return { ok: true, ...hit };
  } catch (err) {
    console.error('[wizard] geocoding fallito', err);
    return { ok: false, error: 'Verifica non riuscita, riprova tra poco.' };
  }
}

const createPayloadSchema = z.object({
  nome: z.string().trim().min(2).max(255),
  citta: z.string().trim().min(2).max(128),
  indirizzo: z.string().trim().max(500).optional(),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  bookingListingId: z.string().trim().max(32).optional(),
  tipo: z.string().trim().max(80).optional(),
  postiLetto: z.string().trim().max(4).optional(),
  descrizione: z.string().trim().max(4000).optional(),
  dotazioni: z.string().trim().max(4000).optional(),
  regole: z.string().trim().max(4000).optional(),
  checkin: z.string().trim().max(120).optional(),
  checkout: z.string().trim().max(120).optional(),
  quartiere: z.string().trim().max(160).optional(),
  lingua: z.string().trim().max(8).optional(),
});

function nonEmptyLines(block: string | undefined): string[] {
  return (block ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export async function createPropertyFromWizardAction(formData: FormData): Promise<void> {
  const raw: Record<string, unknown> = {};
  for (const key of Object.keys(createPayloadSchema.shape)) {
    const value = formData.get(key);
    if (value !== null && value !== '') raw[key] = value;
  }
  const payload = createPayloadSchema.parse(raw);

  const hostId = await getCurrentHostId();
  const { db } = await getDb();

  // Coordinate solo in coppia e solo se l'host ha verificato l'indirizzo:
  // il form le invia come hidden field valorizzati dal geocoding.
  const hasCoords = payload.latitude !== undefined && payload.longitude !== undefined;

  const [inserted] = await db
    .insert(properties)
    .values({
      hostId,
      name: payload.nome,
      city: payload.citta,
      addressLine: payload.indirizzo ?? null,
      latitude: hasCoords ? String(payload.latitude) : null,
      longitude: hasCoords ? String(payload.longitude) : null,
      bookingListingId: payload.bookingListingId ?? null,
    })
    .returning({ id: properties.id });
  if (!inserted) throw new Error('creazione property fallita');

  // Il resto dell'annuncio va nella knowledge: e' cio' che l'agente usa
  // per rispondere agli ospiti. Assemblare != inventare: qui si
  // etichettano dati che l'host ha appena confermato nel form.
  const infoParts: string[] = [];
  if (payload.tipo) infoParts.push(`Tipo: ${payload.tipo}`);
  if (payload.postiLetto) infoParts.push(`Posti letto: ${payload.postiLetto}`);
  if (payload.quartiere) infoParts.push(`Quartiere: ${payload.quartiere}`);
  if (payload.descrizione) infoParts.push(payload.descrizione);
  const dotazioni = nonEmptyLines(payload.dotazioni);
  if (dotazioni.length > 0) infoParts.push(`Dotazioni: ${dotazioni.join(', ')}`);
  const regole = nonEmptyLines(payload.regole);

  const knowledgePatch = {
    ...(infoParts.length > 0 ? { additionalInfo: infoParts.join('\n\n') } : {}),
    ...(regole.length > 0 ? { houseRules: { additionalNotes: regole.join('\n') } } : {}),
    ...(payload.checkin ? { checkInInstructions: `Check-in: ${payload.checkin}` } : {}),
    ...(payload.checkout ? { checkOutInstructions: `Check-out: ${payload.checkout}` } : {}),
    ...(payload.lingua ? { languageDefault: normalizeLanguage(payload.lingua) } : {}),
  };
  if (Object.keys(knowledgePatch).length > 0) {
    await upsertPropertyKnowledge(db, inserted.id, hostId, knowledgePatch);
  }

  // Prossimo passo naturale: collegare i calendari.
  redirect(`/properties/${inserted.id}/calendars?created=1`);
}
