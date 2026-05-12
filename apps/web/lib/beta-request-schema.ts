import { z } from 'zod';

// Slice I — Schema condiviso client + server per richiesta accesso beta.
// Differenza con waitlist-schema:
//  - fullName richiesto (non più facoltativo)
//  - propertyCount richiesto
//  - cityAndType opzionale (textarea breve 1 riga)

export const MIN_PROPERTY_COUNT_BETA = 1;
export const MAX_PROPERTY_COUNT_BETA = 99;
export const MAX_CITY_TYPE_LENGTH = 240;

export const betaRequestBodySchema = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
  fullName: z.string().trim().min(1, 'Manca il nome.').max(255),
  propertyCount: z.number().int().min(MIN_PROPERTY_COUNT_BETA).max(MAX_PROPERTY_COUNT_BETA),
  cityAndType: z
    .string()
    .trim()
    .max(MAX_CITY_TYPE_LENGTH)
    .optional()
    .transform((v) => (v === undefined || v === '' ? undefined : v)),
  privacyAccepted: z.literal(true, {
    errorMap: () => ({ message: 'Devi accettare la privacy.' }),
  }),
});

export type BetaRequestBody = z.infer<typeof betaRequestBodySchema>;

export type BetaRequestSuccess = {
  ok: true;
  duplicate: boolean;
};

export type BetaRequestError = {
  ok: false;
  error: 'validation' | 'rate_limit' | 'server';
  message: string;
};

export type BetaRequestResponse = BetaRequestSuccess | BetaRequestError;
