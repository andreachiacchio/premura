'use server';

import { getCurrentHostId } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { type IcalProbeResult, probeIcalUrl } from '@/lib/ical-probe';
import { type IcalSource, properties } from '@premura/db';
import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

// Sezione "Calendari" di una struttura: piu' feed per property (Booking
// + Airbnb + channel manager) sull'array jsonb ical_sources. Il bottone
// "verifica feed" dice cio' che sappiamo ORA — il feed risponde e
// contiene N eventi — la sincronizzazione vera la fa il worker al
// prossimo giro.

async function requireOwnedProperty(propertyId: string) {
  const hostId = await getCurrentHostId();
  const { db } = await getDb();
  const [row] = await db
    .select({ id: properties.id, icalSources: properties.icalSources })
    .from(properties)
    .where(and(eq(properties.id, propertyId), eq(properties.hostId, hostId)))
    .limit(1);
  if (!row) throw new Error('struttura non trovata');
  return { db, row };
}

export async function verifyFeedAction(rawUrl: string): Promise<IcalProbeResult> {
  await getCurrentHostId();
  return probeIcalUrl(rawUrl);
}

const addFeedSchema = z.object({
  url: z.string().trim().url(),
  source: z.enum(['booking', 'airbnb', 'channel_manager']),
  channelManagerName: z.string().trim().max(80).optional(),
});

export type AddFeedResult = { ok: true } | { ok: false; error: string };

export async function addFeedAction(
  propertyId: string,
  formData: FormData,
): Promise<AddFeedResult> {
  const parsed = addFeedSchema.safeParse({
    url: formData.get('url'),
    source: formData.get('source'),
    channelManagerName: formData.get('channelManagerName') || undefined,
  });
  if (!parsed.success) return { ok: false, error: 'URL o piattaforma non validi.' };
  const payload = parsed.data;
  if (payload.source === 'channel_manager' && !payload.channelManagerName) {
    return { ok: false, error: 'Per un channel manager serve il nome (es. Smoobu).' };
  }

  const { db, row } = await requireOwnedProperty(propertyId);
  if (row.icalSources.some((s) => s.url === payload.url)) {
    return { ok: false, error: 'Questo feed è già collegato.' };
  }

  const next: IcalSource[] = [
    ...row.icalSources,
    {
      source: payload.source,
      url: payload.url,
      ...(payload.channelManagerName ? { channelManagerName: payload.channelManagerName } : {}),
    },
  ];
  await db.update(properties).set({ icalSources: next }).where(eq(properties.id, propertyId));
  revalidatePath(`/properties/${propertyId}/calendars`);
  revalidatePath('/properties');
  return { ok: true };
}

export async function removeFeedAction(propertyId: string, url: string): Promise<void> {
  const { db, row } = await requireOwnedProperty(propertyId);
  const next = row.icalSources.filter((s) => s.url !== url);
  if (next.length !== row.icalSources.length) {
    await db.update(properties).set({ icalSources: next }).where(eq(properties.id, propertyId));
    revalidatePath(`/properties/${propertyId}/calendars`);
    revalidatePath('/properties');
  }
}
