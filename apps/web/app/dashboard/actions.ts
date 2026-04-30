"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  completeBookingManual,
  skipBookingCompletion,
} from "@/lib/api";
import { getCurrentHostId } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { findOwnership } from "@/lib/repositories/bookings";
import { createProperty } from "@/lib/repositories/properties";

// Server actions per la dashboard host (M2a.4 slice 5 sezione E).
//
// Le firme rispecchiano cio' che CompleteBookingDialog si aspetta via
// prop: completeBookingAction prende FormData (progressive enhancement
// nativo Next), skipBookingAction prende solo l'id.
//
// Validazione zod inline qui prima di inoltrare alle mutazioni HTTP
// dell'API Fastify (apps/api/src/api/bookings.ts). Schema duplicato
// rispetto al server: vedi docs/KNOWN-LIMITS.md sezione 20 per il debito
// tecnico (refactor proposto: estrarre in packages/shared).
//
// Slice 6 fase 6.5: pre-check ownership via findOwnership prima di
// inoltrare all'API. Difesa applicativa contro modifica booking
// altrui. Fix architetturale (JWT validation Fastify) in slice 6.5
// dedicato.

const idSchema = z.string().uuid();

// Errore generico volutamente identico per "booking non esiste" e
// "booking di altro host": evita di rivelare l'esistenza di booking
// altrui via 404 vs 403 differenziati.
const NOT_FOUND_MESSAGE = "Booking non trovata";

async function assertOwnership(bookingId: string): Promise<void> {
  const currentHostId = await getCurrentHostId();
  const { db } = await getDb();
  const ownership = await findOwnership({ db, bookingId });
  if (!ownership || ownership.hostId !== currentHostId) {
    throw new Error(NOT_FOUND_MESSAGE);
  }
}

const completePayloadSchema = z.object({
  guestFullName: z.string().trim().min(2),
  guestPhone: z.string().trim().min(8),
  guestLanguage: z.string().trim().min(2).max(8),
  numGuests: z.coerce.number().int().min(1).max(20).optional(),
});

export async function completeBookingAction(formData: FormData): Promise<void> {
  const bookingId = idSchema.parse(formData.get("bookingId"));
  const rawNum = formData.get("numGuests");
  const payload = completePayloadSchema.parse({
    guestFullName: formData.get("guestFullName"),
    guestPhone: formData.get("guestPhone"),
    guestLanguage: formData.get("guestLanguage"),
    numGuests: rawNum === null || rawNum === "" ? undefined : rawNum,
  });

  await assertOwnership(bookingId);
  await completeBookingManual(bookingId, payload);
  revalidatePath("/dashboard");
}

export async function skipBookingAction(bookingId: string): Promise<void> {
  const id = idSchema.parse(bookingId);
  await assertOwnership(id);
  await skipBookingCompletion(id);
  revalidatePath("/dashboard");
}

// Slice 6 fase 6: creazione prima property dall'EmptyOnboardingState.
// host_id deriva dalla sessione Supabase (getCurrentHostId), niente
// trust del client. Schema zod allineato a quello di AddPropertyDialog,
// stesso debito di duplicazione gia' tracciato in KNOWN-LIMITS sezione 20
// (refactor proposto: schema condiviso in packages/shared).
const createPropertyPayloadSchema = z.object({
  name: z.string().trim().min(2).max(255),
  city: z.string().trim().min(2).max(128),
  icalBookingUrl: z
    .string()
    .trim()
    .refine(
      (v) => v === "" || z.string().url().safeParse(v).success,
      { message: "URL non valido" },
    )
    .optional(),
});

export async function createPropertyAction(formData: FormData): Promise<void> {
  const hostId = await getCurrentHostId();
  const rawIcal = formData.get("icalBookingUrl");
  const payload = createPropertyPayloadSchema.parse({
    name: formData.get("name"),
    city: formData.get("city"),
    icalBookingUrl: rawIcal === null ? undefined : rawIcal,
  });

  const { db } = await getDb();
  await createProperty({
    db,
    hostId,
    name: payload.name,
    city: payload.city,
    icalBookingUrl:
      payload.icalBookingUrl && payload.icalBookingUrl.length > 0
        ? payload.icalBookingUrl
        : undefined,
  });

  revalidatePath("/dashboard");
}
