"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  completeBookingManual,
  skipBookingCompletion,
} from "@/lib/api";

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

const idSchema = z.string().uuid();

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

  await completeBookingManual(bookingId, payload);
  revalidatePath("/dashboard");
}

export async function skipBookingAction(bookingId: string): Promise<void> {
  const id = idSchema.parse(bookingId);
  await skipBookingCompletion(id);
  revalidatePath("/dashboard");
}
