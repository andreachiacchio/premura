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
import { normalizePhone } from '@/lib/phone-normalize';
import { createCleaner } from '@/lib/repositories/cleaners';
import {
  createProperty,
  findByHostId as findPropertiesByHostId,
} from '@/lib/repositories/properties';
import { upsertPropertyKnowledge } from '@/lib/repositories/property-knowledge';
import { properties } from '@premura/db';
import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { z } from 'zod';

// Slice 9 + Slice H — server actions per il flusso onboarding.
//
// Slice H ridefinisce a 5 step (welcome → property → calendar → knowledge
// → cleaner → completed). Le action legacy advanceFromGmail /
// completeOnboarding restano per host pre-slice-H.

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
});

export async function submitFirstPropertyAction(formData: FormData): Promise<void> {
  const payload = propertyPayloadSchema.parse({
    name: formData.get('name'),
    city: formData.get('city'),
  });
  const hostId = await getCurrentHostId();
  const { db } = await getDb();
  await createProperty({
    db,
    hostId,
    name: payload.name,
    city: payload.city,
  });
  await setOnboardingStep(db, hostId, 'calendar');
  redirect(urlForStep('calendar'));
}

// ─── Slice H — calendar step ──────────────────────────────────────

export type IcalTestResult =
  | { ok: true; eventsFound: number }
  | { ok: false; reason: 'invalid_url' | 'fetch_failed' | 'parse_failed'; detail?: string };

export async function testIcalUrlAction(rawUrl: string): Promise<IcalTestResult> {
  const url = rawUrl.trim();
  if (!url) return { ok: false, reason: 'invalid_url', detail: 'URL vuoto' };
  try {
    new URL(url);
  } catch {
    return { ok: false, reason: 'invalid_url', detail: 'URL malformato' };
  }
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'Premura/1.0 iCal probe' },
    });
    if (!res.ok) {
      return { ok: false, reason: 'fetch_failed', detail: `HTTP ${res.status}` };
    }
    const text = await res.text();
    if (!text.includes('BEGIN:VCALENDAR')) {
      return { ok: false, reason: 'parse_failed', detail: "Non e' un iCal valido" };
    }
    const matches = text.match(/BEGIN:VEVENT/g);
    return { ok: true, eventsFound: matches?.length ?? 0 };
  } catch (err) {
    return {
      ok: false,
      reason: 'fetch_failed',
      detail: err instanceof Error ? err.message : 'Errore rete',
    };
  }
}

const calendarPayloadSchema = z.object({
  icalBookingUrl: z
    .string()
    .trim()
    .refine((v) => v === '' || z.string().url().safeParse(v).success, {
      message: 'URL non valido',
    })
    .optional(),
});

export async function submitCalendarAction(formData: FormData): Promise<void> {
  const payload = calendarPayloadSchema.parse({
    icalBookingUrl: formData.get('icalBookingUrl') ?? undefined,
  });
  const hostId = await getCurrentHostId();
  const { db } = await getDb();

  if (payload.icalBookingUrl && payload.icalBookingUrl.length > 0) {
    const props = await findPropertiesByHostId({ db, hostId });
    const first = props[0];
    if (first) {
      await db
        .update(properties)
        .set({
          icalSources: [{ source: 'booking', url: payload.icalBookingUrl }],
        })
        .where(eq(properties.id, first.id));
    }
  }

  await setOnboardingStep(db, hostId, 'knowledge');
  redirect(urlForStep('knowledge'));
}

// ─── Slice H — knowledge step (synthetic essentials) ──────────────

type TipCat = 'pasticceria' | 'ristorante' | 'bar' | 'panorama' | 'shopping' | 'farmacia' | 'altro';

const ALLOWED_TIP_CATEGORIES = new Set<TipCat>([
  'pasticceria',
  'ristorante',
  'bar',
  'panorama',
  'shopping',
  'farmacia',
  'altro',
]);

const knowledgePayloadSchema = z.object({
  wifiSsid: z.string().trim().max(80).optional(),
  wifiPassword: z.string().trim().max(80).optional(),
  keyboxCode: z.string().trim().max(40).optional(),
  keyboxInstructions: z.string().trim().max(500).optional(),
  tipName1: z.string().trim().max(100).optional(),
  tipCategory1: z.string().trim().max(40).optional(),
  tipName2: z.string().trim().max(100).optional(),
  tipCategory2: z.string().trim().max(40).optional(),
  tipName3: z.string().trim().max(100).optional(),
  tipCategory3: z.string().trim().max(40).optional(),
});

function toTip(category: string, name: string): { category: TipCat; name: string } {
  const cat = ALLOWED_TIP_CATEGORIES.has(category as TipCat) ? (category as TipCat) : 'altro';
  return { category: cat, name };
}

export async function submitKnowledgeAction(formData: FormData): Promise<void> {
  const payload = knowledgePayloadSchema.parse({
    wifiSsid: formData.get('wifiSsid') ?? undefined,
    wifiPassword: formData.get('wifiPassword') ?? undefined,
    keyboxCode: formData.get('keyboxCode') ?? undefined,
    keyboxInstructions: formData.get('keyboxInstructions') ?? undefined,
    tipName1: formData.get('tipName1') ?? undefined,
    tipCategory1: formData.get('tipCategory1') ?? undefined,
    tipName2: formData.get('tipName2') ?? undefined,
    tipCategory2: formData.get('tipCategory2') ?? undefined,
    tipName3: formData.get('tipName3') ?? undefined,
    tipCategory3: formData.get('tipCategory3') ?? undefined,
  });
  const hostId = await getCurrentHostId();
  const { db } = await getDb();
  const props = await findPropertiesByHostId({ db, hostId });
  const first = props[0];
  if (first) {
    const wifi =
      payload.wifiSsid || payload.wifiPassword
        ? { ssid: payload.wifiSsid || undefined, password: payload.wifiPassword || undefined }
        : null;
    const keybox =
      payload.keyboxCode || payload.keyboxInstructions
        ? {
            code: payload.keyboxCode || undefined,
            instructions: payload.keyboxInstructions || undefined,
          }
        : null;
    const tips = [
      payload.tipName1 && payload.tipCategory1
        ? toTip(payload.tipCategory1, payload.tipName1)
        : null,
      payload.tipName2 && payload.tipCategory2
        ? toTip(payload.tipCategory2, payload.tipName2)
        : null,
      payload.tipName3 && payload.tipCategory3
        ? toTip(payload.tipCategory3, payload.tipName3)
        : null,
    ].filter((t): t is { category: TipCat; name: string } => t !== null);

    await upsertPropertyKnowledge(db, first.id, hostId, {
      wifi,
      keybox,
      localTipsCuratedHost: tips,
    });
  }
  await setOnboardingStep(db, hostId, 'cleaner');
  redirect(urlForStep('cleaner'));
}

// ─── Slice H — cleaner step ───────────────────────────────────────

const cleanerPayloadSchema = z.object({
  fullName: z.string().trim().max(255).optional(),
  whatsappNumber: z.string().trim().max(64).optional(),
  deliveryAddress: z.string().trim().max(500).optional(),
  perKitFeeEur: z.string().trim().max(10).optional(),
});

export async function submitCleanerAction(formData: FormData): Promise<void> {
  const payload = cleanerPayloadSchema.parse({
    fullName: formData.get('fullName') ?? undefined,
    whatsappNumber: formData.get('whatsappNumber') ?? undefined,
    deliveryAddress: formData.get('deliveryAddress') ?? undefined,
    perKitFeeEur: formData.get('perKitFeeEur') ?? undefined,
  });
  const hostId = await getCurrentHostId();
  const { db } = await getDb();
  const hasData = !!(payload.fullName && payload.whatsappNumber && payload.deliveryAddress);
  if (hasData) {
    const phone = normalizePhone(payload.whatsappNumber || '');
    if (phone.ok) {
      await createCleaner(db, hostId, {
        fullName: (payload.fullName || '').trim(),
        whatsappNumber: phone.e164,
        deliveryAddress: (payload.deliveryAddress || '').trim(),
        perKitFeeEur: payload.perKitFeeEur || '2.00',
        languagePreferred: 'it',
      });
    }
  }
  await completeOnboarding(db, hostId);
  redirect('/onboarding/done');
}

// ─── Legacy compat ────────────────────────────────────────────────

export async function advanceFromGmailAction(): Promise<void> {
  const hostId = await getCurrentHostId();
  const { db } = await getDb();
  await setOnboardingStep(db, hostId, 'calendar');
  redirect(urlForStep('calendar'));
}

export async function completeOnboardingAction(): Promise<void> {
  const hostId = await getCurrentHostId();
  const { db } = await getDb();
  await completeOnboarding(db, hostId);
  redirect('/dashboard');
}

export async function skipToNextStepAction(currentStep: OnboardingStep): Promise<void> {
  const hostId = await getCurrentHostId();
  const { db } = await getDb();
  const next = nextStep(currentStep);
  if (next === 'completed') {
    await completeOnboarding(db, hostId);
    redirect('/onboarding/done');
  } else {
    await setOnboardingStep(db, hostId, next);
    redirect(urlForStep(next));
  }
}
