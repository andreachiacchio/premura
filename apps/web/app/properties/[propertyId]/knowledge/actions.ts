'use server';

import { getCurrentHostId } from '@/lib/auth';
import { getDb } from '@/lib/db';
import {
  type PropertyKnowledgePatch,
  isPropertyOwnedByHost,
  upsertPropertyKnowledge,
} from '@/lib/repositories/property-knowledge';
import {
  type Bucket,
  deletePhotoFromBucket,
  extractPathFromPublicUrl,
  uploadPhotoToBucket,
} from '@/lib/storage';
import { getPropertyKnowledge, parseKnowledgeFromText } from '@premura/agents';
import { properties } from '@premura/db';
import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

// Slice 12 — Server actions per property knowledge form.
//
// Auto-save: ogni sezione invoca la sua action al blur. Atomicita'
// per sezione: solo i campi della sezione vengono passati nel patch.
// Pre-check ownership pattern slice 6 fase 6.5.

const idSchema = z.string().uuid();
const NOT_FOUND_MESSAGE = 'Property non trovata';

async function assertOwnership(propertyId: string): Promise<string> {
  const hostId = await getCurrentHostId();
  const { db } = await getDb();
  const ok = await isPropertyOwnedByHost(db, propertyId, hostId);
  if (!ok) throw new Error(NOT_FOUND_MESSAGE);
  return hostId;
}

const keyboxSchema = z.object({
  code: z.string().trim().max(64).optional(),
  instructions: z.string().trim().max(2000).optional(),
});

export async function saveKeyboxAction(propertyId: string, formData: FormData): Promise<void> {
  const id = idSchema.parse(propertyId);
  const hostId = await assertOwnership(id);
  const payload = keyboxSchema.parse({
    code: formData.get('code') ?? undefined,
    instructions: formData.get('instructions') ?? undefined,
  });
  const { db } = await getDb();
  await upsertPropertyKnowledge(db, id, hostId, {
    keybox: payload.code || payload.instructions ? payload : null,
  });
  revalidatePath(`/properties/${id}/knowledge`);
}

const wifiSchema = z.object({
  ssid: z.string().trim().max(64).optional(),
  password: z.string().trim().max(64).optional(),
  notes: z.string().trim().max(500).optional(),
});

export async function saveWifiAction(propertyId: string, formData: FormData): Promise<void> {
  const id = idSchema.parse(propertyId);
  const hostId = await assertOwnership(id);
  const payload = wifiSchema.parse({
    ssid: formData.get('ssid') ?? undefined,
    password: formData.get('password') ?? undefined,
    notes: formData.get('notes') ?? undefined,
  });
  const { db } = await getDb();
  const isEmpty = !payload.ssid && !payload.password && !payload.notes;
  await upsertPropertyKnowledge(db, id, hostId, {
    wifi: isEmpty ? null : payload,
  });
  revalidatePath(`/properties/${id}/knowledge`);
}

const parkingSchema = z.object({
  available: z.boolean().optional(),
  type: z.enum(['street', 'garage', 'private', 'paid', 'none']).optional(),
  instructions: z.string().trim().max(2000).optional(),
});

export async function saveParkingAction(propertyId: string, formData: FormData): Promise<void> {
  const id = idSchema.parse(propertyId);
  const hostId = await assertOwnership(id);
  const rawAvailable = formData.get('available');
  const payload = parkingSchema.parse({
    available: rawAvailable === 'true' ? true : rawAvailable === 'false' ? false : undefined,
    type: (formData.get('type') as string) ?? undefined,
    instructions: formData.get('instructions') ?? undefined,
  });
  const { db } = await getDb();
  const isEmpty = payload.available === undefined && !payload.type && !payload.instructions;
  await upsertPropertyKnowledge(db, id, hostId, {
    parking: isEmpty ? null : payload,
  });
  revalidatePath(`/properties/${id}/knowledge`);
}

const houseRulesSchema = z.object({
  quietHoursStart: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional()
    .or(z.literal('')),
  quietHoursEnd: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional()
    .or(z.literal('')),
  smokingAllowed: z.boolean().optional(),
  petsAllowed: z.boolean().optional(),
  additionalNotes: z.string().trim().max(2000).optional(),
});

export async function saveHouseRulesAction(propertyId: string, formData: FormData): Promise<void> {
  const id = idSchema.parse(propertyId);
  const hostId = await assertOwnership(id);
  const payload = houseRulesSchema.parse({
    quietHoursStart: formData.get('quietHoursStart') ?? undefined,
    quietHoursEnd: formData.get('quietHoursEnd') ?? undefined,
    smokingAllowed:
      formData.get('smokingAllowed') === 'on' || formData.get('smokingAllowed') === 'true',
    petsAllowed: formData.get('petsAllowed') === 'on' || formData.get('petsAllowed') === 'true',
    additionalNotes: formData.get('additionalNotes') ?? undefined,
  });
  const cleaned = {
    quietHoursStart: payload.quietHoursStart || undefined,
    quietHoursEnd: payload.quietHoursEnd || undefined,
    smokingAllowed: payload.smokingAllowed,
    petsAllowed: payload.petsAllowed,
    additionalNotes: payload.additionalNotes,
  };
  const { db } = await getDb();
  const isEmpty =
    !cleaned.quietHoursStart &&
    !cleaned.quietHoursEnd &&
    !cleaned.additionalNotes &&
    cleaned.smokingAllowed === undefined &&
    cleaned.petsAllowed === undefined;
  await upsertPropertyKnowledge(db, id, hostId, {
    houseRules: isEmpty ? null : cleaned,
  });
  revalidatePath(`/properties/${id}/knowledge`);
}

const emergencyContactsSchema = z.array(
  z.object({
    name: z.string().trim().min(1).max(128),
    phone: z.string().trim().min(1).max(64),
    role: z.string().trim().min(1).max(64),
  }),
);

export async function saveEmergencyContactsAction(
  propertyId: string,
  contacts: unknown,
): Promise<void> {
  const id = idSchema.parse(propertyId);
  const hostId = await assertOwnership(id);
  const parsed = emergencyContactsSchema.parse(contacts);
  const { db } = await getDb();
  await upsertPropertyKnowledge(db, id, hostId, { emergencyContacts: parsed });
  revalidatePath(`/properties/${id}/knowledge`);
}

const nearbyEssentialsSchema = z.array(
  z.object({
    category: z.enum(['pharmacy', 'supermarket', 'restaurant', 'transport', 'other']),
    name: z.string().trim().min(1).max(128),
    address: z.string().trim().max(255).optional(),
    distanceM: z.coerce.number().int().min(0).max(50000).optional(),
  }),
);

export async function saveNearbyEssentialsAction(
  propertyId: string,
  essentials: unknown,
): Promise<void> {
  const id = idSchema.parse(propertyId);
  const hostId = await assertOwnership(id);
  const parsed = nearbyEssentialsSchema.parse(essentials);
  const { db } = await getDb();
  await upsertPropertyKnowledge(db, id, hostId, { nearbyEssentials: parsed });
  revalidatePath(`/properties/${id}/knowledge`);
}

const additionalInfoSchema = z.string().trim().max(5000).optional();

export async function saveAdditionalInfoAction(
  propertyId: string,
  formData: FormData,
): Promise<void> {
  const id = idSchema.parse(propertyId);
  const hostId = await assertOwnership(id);
  const value = additionalInfoSchema.parse(formData.get('additionalInfo') ?? undefined);
  const { db } = await getDb();
  await upsertPropertyKnowledge(db, id, hostId, {
    additionalInfo: value && value.length > 0 ? value : null,
  });
  revalidatePath(`/properties/${id}/knowledge`);
}

// ─────────────────────────────────────────────────────────────
// Slice G — sezioni nuove.
// ─────────────────────────────────────────────────────────────

const checkInOutSchema = z.object({
  checkInInstructions: z.string().trim().max(2000).optional(),
  checkOutInstructions: z.string().trim().max(2000).optional(),
});

export async function saveCheckInOutInstructionsAction(
  propertyId: string,
  formData: FormData,
): Promise<void> {
  const id = idSchema.parse(propertyId);
  const hostId = await assertOwnership(id);
  const payload = checkInOutSchema.parse({
    checkInInstructions: formData.get('checkInInstructions') ?? undefined,
    checkOutInstructions: formData.get('checkOutInstructions') ?? undefined,
  });
  const { db } = await getDb();
  await upsertPropertyKnowledge(db, id, hostId, {
    checkInInstructions: payload.checkInInstructions || null,
    checkOutInstructions: payload.checkOutInstructions || null,
  });
  revalidatePath(`/properties/${id}/knowledge`);
}

const localTipSchema = z.object({
  category: z.enum([
    'pasticceria',
    'ristorante',
    'bar',
    'panorama',
    'shopping',
    'farmacia',
    'altro',
  ]),
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(280).optional(),
  address: z.string().trim().max(200).optional(),
  distanceMin: z.coerce.number().int().min(0).max(120).optional(),
});

const localTipsArraySchema = z.array(localTipSchema).max(20);

export async function saveLocalTipsAction(propertyId: string, tips: unknown): Promise<void> {
  const id = idSchema.parse(propertyId);
  const hostId = await assertOwnership(id);
  const parsed = localTipsArraySchema.parse(tips);
  // Normalize: rimuovi description/address vuoti
  const cleaned = parsed.map((t) => ({
    category: t.category,
    name: t.name,
    description: t.description || undefined,
    address: t.address || undefined,
    distanceMin: t.distanceMin,
  }));
  const { db } = await getDb();
  await upsertPropertyKnowledge(db, id, hostId, { localTipsCuratedHost: cleaned });
  revalidatePath(`/properties/${id}/knowledge`);
}

const placementSchema = z.string().trim().max(200).optional();

export async function saveKitDefaultPlacementAction(
  propertyId: string,
  formData: FormData,
): Promise<void> {
  const id = idSchema.parse(propertyId);
  const hostId = await assertOwnership(id);
  const value = placementSchema.parse(formData.get('kitDefaultPlacement') ?? undefined);
  const { db } = await getDb();
  await upsertPropertyKnowledge(db, id, hostId, {
    kitDefaultPlacement: value && value.length > 0 ? value : null,
  });
  revalidatePath(`/properties/${id}/knowledge`);
}

const languageDefaultSchema = z.enum(['it', 'en']);

export async function saveLanguageDefaultAction(
  propertyId: string,
  formData: FormData,
): Promise<void> {
  const id = idSchema.parse(propertyId);
  const hostId = await assertOwnership(id);
  // BUG 2 (07/08). Prima era `formData.get('languageDefault') ?? 'it'`:
  // se il campo non arrivava, il fallback scriveva 'it' e l'azione
  // riportava successo. Selezionavi English, premevi Salva, e la pagina
  // ti diceva di sì mentre salvava italiano.
  //
  // Un campo che non arriva e' un form rotto, non una preferenza per
  // l'italiano. Adesso lancia: meglio un errore visibile di un valore
  // sbagliato scritto in silenzio.
  const raw = formData.get('languageDefault');
  if (raw === null) {
    throw new Error('Campo lingua mancante dal form: nulla e stato salvato');
  }
  const value = languageDefaultSchema.parse(raw);
  const { db } = await getDb();
  await upsertPropertyKnowledge(db, id, hostId, { languageDefault: value });
  revalidatePath(`/properties/${id}/knowledge`);
}

// ─── Foto upload ──────────────────────────────────────────────────
const MAX_PHOTOS_PER_PROPERTY = 10;

export type UploadHousePhotoResult =
  | { ok: true; url: string }
  | {
      ok: false;
      reason: 'too_many' | 'invalid_mime' | 'too_large' | 'upload_error' | 'no_file';
      detail?: string;
    };

export async function uploadHousePhotoAction(
  propertyId: string,
  formData: FormData,
): Promise<UploadHousePhotoResult> {
  const id = idSchema.parse(propertyId);
  const hostId = await assertOwnership(id);
  const file = formData.get('photo');
  if (!(file instanceof File)) {
    return { ok: false, reason: 'no_file' };
  }
  const { db } = await getDb();
  const knowledge = await getPropertyKnowledge(db, id);
  const existing = knowledge?.housePhotos ?? [];
  if (existing.length >= MAX_PHOTOS_PER_PROPERTY) {
    return { ok: false, reason: 'too_many', detail: `max ${MAX_PHOTOS_PER_PROPERTY}` };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await uploadPhotoToBucket('property-photos', buffer, file.type, {
    folder: id,
  });
  if (!result.ok) {
    return { ok: false, reason: result.reason, detail: result.detail };
  }

  await upsertPropertyKnowledge(db, id, hostId, {
    housePhotos: [...existing, result.url],
  });
  revalidatePath(`/properties/${id}/knowledge`);
  return { ok: true, url: result.url };
}

export type DeleteHousePhotoResult = { ok: true } | { ok: false; reason: 'not_found' };

export async function deleteHousePhotoAction(
  propertyId: string,
  url: string,
): Promise<DeleteHousePhotoResult> {
  const id = idSchema.parse(propertyId);
  const hostId = await assertOwnership(id);
  const { db } = await getDb();
  const knowledge = await getPropertyKnowledge(db, id);
  const existing = knowledge?.housePhotos ?? [];
  if (!existing.includes(url)) return { ok: false, reason: 'not_found' };

  const path = extractPathFromPublicUrl('property-photos' as Bucket, url);
  if (path) {
    await deletePhotoFromBucket('property-photos', path).catch(() => {
      // Best-effort: cancellazione DB anche se Storage delete fallisce.
    });
  }

  await upsertPropertyKnowledge(db, id, hostId, {
    housePhotos: existing.filter((u) => u !== url),
  });
  revalidatePath(`/properties/${id}/knowledge`);
  return { ok: true };
}

// ─── AI parser knowledge ──────────────────────────────────────────
export type ParseKnowledgeResult =
  | {
      ok: true;
      parsed: Awaited<ReturnType<typeof parseKnowledgeFromText>>['parsed'];
      costUsd: number;
      agentVersion: string;
    }
  | { ok: false; reason: 'invalid_text' | 'parser_error'; detail?: string };

const parseTextSchema = z.string().trim().min(20).max(15000);

export async function parseKnowledgeAction(
  propertyId: string,
  text: string,
): Promise<ParseKnowledgeResult> {
  const id = idSchema.parse(propertyId);
  await assertOwnership(id);
  let cleanText: string;
  try {
    cleanText = parseTextSchema.parse(text);
  } catch {
    return { ok: false, reason: 'invalid_text', detail: 'min 20, max 15000 char' };
  }
  try {
    const result = await parseKnowledgeFromText({ text: cleanText });
    return {
      ok: true,
      parsed: result.parsed,
      costUsd: result.costUsd,
      agentVersion: result.agentVersion,
    };
  } catch (err) {
    return {
      ok: false,
      reason: 'parser_error',
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

// applyParsedKnowledge — applica patch confermato dall'host (UI mostra
// preview prima di salvare). Patch può essere parziale: tutto opzionale.
const applyParsedSchema = z.object({
  wifi: z
    .object({
      ssid: z.string().max(80).optional(),
      password: z.string().max(80).optional(),
      notes: z.string().max(500).optional(),
    })
    .optional(),
  keybox: z
    .object({
      code: z.string().max(40).optional(),
      instructions: z.string().max(2000).optional(),
    })
    .optional(),
  parking: z
    .object({
      available: z.boolean().optional(),
      type: z.enum(['street', 'garage', 'private', 'paid', 'none']).optional(),
      instructions: z.string().max(2000).optional(),
    })
    .optional(),
  checkInInstructions: z.string().max(2000).optional(),
  checkOutInstructions: z.string().max(2000).optional(),
  emergencyContacts: z
    .array(
      z.object({
        name: z.string().min(1).max(128),
        phone: z.string().min(1).max(64),
        role: z.string().min(1).max(64),
      }),
    )
    .max(10)
    .optional(),
  localTipsCuratedHost: z
    .array(
      z.object({
        category: z.enum([
          'pasticceria',
          'ristorante',
          'bar',
          'panorama',
          'shopping',
          'farmacia',
          'altro',
        ]),
        name: z.string().min(1).max(100),
        description: z.string().max(280).optional(),
        address: z.string().max(200).optional(),
        distanceMin: z.number().int().min(0).max(120).optional(),
      }),
    )
    .max(20)
    .optional(),
  languageDefault: z.enum(['it', 'en']).optional(),
  additionalInfo: z.string().max(5000).optional(),
});

export type ApplyParsedKnowledgeResult =
  | { ok: true }
  | { ok: false; reason: 'invalid_payload'; detail?: string };

export async function applyParsedKnowledgeAction(
  propertyId: string,
  patch: unknown,
): Promise<ApplyParsedKnowledgeResult> {
  const id = idSchema.parse(propertyId);
  const hostId = await assertOwnership(id);
  let parsed: z.infer<typeof applyParsedSchema>;
  try {
    parsed = applyParsedSchema.parse(patch);
  } catch (err) {
    return {
      ok: false,
      reason: 'invalid_payload',
      detail: err instanceof Error ? err.message : 'invalid',
    };
  }
  const { db } = await getDb();
  const update: PropertyKnowledgePatch = {};
  if (parsed.wifi) update.wifi = parsed.wifi;
  if (parsed.keybox) update.keybox = parsed.keybox;
  if (parsed.parking) update.parking = parsed.parking;
  if (parsed.checkInInstructions !== undefined)
    update.checkInInstructions = parsed.checkInInstructions || null;
  if (parsed.checkOutInstructions !== undefined)
    update.checkOutInstructions = parsed.checkOutInstructions || null;
  if (parsed.emergencyContacts) update.emergencyContacts = parsed.emergencyContacts;
  if (parsed.localTipsCuratedHost) update.localTipsCuratedHost = parsed.localTipsCuratedHost;
  if (parsed.languageDefault) update.languageDefault = parsed.languageDefault;
  if (parsed.additionalInfo !== undefined) update.additionalInfo = parsed.additionalInfo || null;

  await upsertPropertyKnowledge(db, id, hostId, update);
  revalidatePath(`/properties/${id}/knowledge`);
  return { ok: true };
}

export type { PropertyKnowledgePatch };

// ─── Link della guida ospite ──────────────────────────────────────
//
// 07/08. Prima questo valore NON esisteva come campo: veniva scritto
// una volta sola alla creazione della struttura, leggendo
// WELCOME_GUEST_APP_URL — una variabile d'ambiente GLOBALE.
//
// Con una casa funzionava per coincidenza. Con due, la seconda
// ereditava il link della prima, e l'ospite riceveva la guida di
// un'altra casa: un errore che non compare in nessun log e si scopre
// da un ospite confuso. Ora e' un campo per struttura, e la variabile
// d'ambiente non viene piu' letta.
//
// Vuoto = nessun link. L'invito guest app non parte affatto invece di
// partire monco: meglio un messaggio che manca di uno che manda
// altrove.
const guestAppUrlSchema = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v === '' || /^https:\/\/\S+$/.test(v), {
    message: 'Deve essere un indirizzo https://',
  });

export async function saveGuestAppUrlAction(
  propertyId: string,
  formData: FormData,
): Promise<void> {
  const id = idSchema.parse(propertyId);
  const hostId = await assertOwnership(id);
  const raw = guestAppUrlSchema.parse(formData.get('guestAppUrl') ?? '');
  const { db } = await getDb();
  await db
    .update(properties)
    .set({ guestAppUrl: raw === '' ? null : raw, updatedAt: new Date() })
    .where(and(eq(properties.id, id), eq(properties.hostId, hostId)));
  revalidatePath(`/properties/${id}/knowledge`);
}
