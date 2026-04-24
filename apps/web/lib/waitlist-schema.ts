import { z } from "zod";

// Schema condiviso tra client (form validation pre-submit) e server
// (route handler validation post-body). Tenere un solo file evita drift.
//
// Regole:
// - email: richiesta, RFC5322 via zod, max 255 (matcha colonna DB)
// - fullName: opzionale, trim, max 255
// - propertyCount: opzionale, 1..99
// - source: settato server-side da ?ref=, NON accettato dal body
// - referrer: letto server-side dall'header Referer, NON accettato dal body

export const MIN_PROPERTY_COUNT = 1;
export const MAX_PROPERTY_COUNT = 99;

export const waitlistBodySchema = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
  fullName: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  propertyCount: z
    .number()
    .int()
    .min(MIN_PROPERTY_COUNT)
    .max(MAX_PROPERTY_COUNT)
    .optional(),
});

export type WaitlistBody = z.infer<typeof waitlistBodySchema>;

// Whitelist regex per ?ref=<slug>. Se non matcha, lato server scartiamo
// e usiamo "direct".
export const SOURCE_REF_REGEX = /^[a-z0-9-]{1,64}$/;

export type WaitlistSuccess = {
  ok: true;
  duplicate: boolean;
};

export type WaitlistError = {
  ok: false;
  error: "validation" | "rate_limit" | "server";
  message: string;
};

export type WaitlistResponse = WaitlistSuccess | WaitlistError;
