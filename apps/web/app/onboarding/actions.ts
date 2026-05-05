'use server';

import { getCurrentHostId } from '@/lib/auth';
import { getDb } from '@/lib/db';
import {
  type OnboardingStep,
  completeOnboarding,
  nextStep,
  setHostInfo,
  setOnboardingStep,
  urlForStep,
} from '@/lib/onboarding';
import { createProperty } from '@/lib/repositories/properties';
import { redirect } from 'next/navigation';
import { z } from 'zod';

// Slice 9 prep — server actions per il flusso onboarding.

const welcomePayloadSchema = z.object({
  fullName: z.string().trim().min(2).max(255),
  locale: z.enum(['it-IT', 'en-US']),
});

export async function submitWelcomeAction(formData: FormData): Promise<void> {
  const payload = welcomePayloadSchema.parse({
    fullName: formData.get('fullName'),
    locale: formData.get('locale'),
  });
  const hostId = await getCurrentHostId();
  const { db } = await getDb();
  await setHostInfo(db, hostId, payload);
  await setOnboardingStep(db, hostId, 'property');
  redirect(urlForStep('property'));
}

const propertyPayloadSchema = z.object({
  name: z.string().trim().min(2).max(255),
  city: z.string().trim().min(2).max(128),
  icalBookingUrl: z
    .string()
    .trim()
    .refine((v) => v === '' || z.string().url().safeParse(v).success, {
      message: 'URL non valido',
    })
    .optional(),
});

export async function submitFirstPropertyAction(formData: FormData): Promise<void> {
  const rawIcal = formData.get('icalBookingUrl');
  const payload = propertyPayloadSchema.parse({
    name: formData.get('name'),
    city: formData.get('city'),
    icalBookingUrl: rawIcal === null ? undefined : rawIcal,
  });
  const hostId = await getCurrentHostId();
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
  await setOnboardingStep(db, hostId, 'gmail');
  redirect(urlForStep('gmail'));
}

// Step gmail: il vero OAuth flow vive in /connect-gmail (M2a.3 fase 1).
// Qui registriamo solo l'avanzamento di step (utente clicca "Connetti
// Gmail" -> redirect a /connect-gmail; quando torna successful, torna
// qui con ?from=gmail per avanzare).
export async function advanceFromGmailAction(): Promise<void> {
  const hostId = await getCurrentHostId();
  const { db } = await getDb();
  await setOnboardingStep(db, hostId, 'whatsapp');
  redirect(urlForStep('whatsapp'));
}

// Step whatsapp: placeholder informativo (Meta WA Business non
// ancora self-service per host #2+, vedi docs/META-WEBHOOK-SETUP.md).
// Il bottone "ho capito, prosegui" chiama questa action che marca
// l'onboarding completato.
export async function completeOnboardingAction(): Promise<void> {
  const hostId = await getCurrentHostId();
  const { db } = await getDb();
  await completeOnboarding(db, hostId);
  redirect('/dashboard');
}

// Helper navigation: restituisce lo step seguente di uno step dato.
// Esposto come server action per UI che vuole "skip step".
export async function skipToNextStepAction(currentStep: OnboardingStep): Promise<void> {
  const hostId = await getCurrentHostId();
  const { db } = await getDb();
  const next = nextStep(currentStep);
  if (next === 'completed') {
    await completeOnboarding(db, hostId);
    redirect('/dashboard');
  } else {
    await setOnboardingStep(db, hostId, next);
    redirect(urlForStep(next));
  }
}
