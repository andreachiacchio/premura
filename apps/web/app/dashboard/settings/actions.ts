'use server';

import { getCurrentHostId } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { hosts } from '@premura/db';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

// Slice E — Settings host (agent toggles).

const timeSlotSchema = z
  .string()
  .regex(/^\d{2}:\d{2}$/)
  .refine((s) => {
    const h = Number(s.slice(0, 2));
    const m = Number(s.slice(3, 5));
    return h >= 8 && h <= 11 && (m === 0 || m === 30);
  }, 'Time slot tra 08:00 e 11:30, step 30 min');

const settingsSchema = z.object({
  welcomeAutoSend: z.enum(['on', 'off']),
  welcomeTimeSlot: timeSlotSchema,
});

export async function saveWelcomeSettingsAction(formData: FormData): Promise<void> {
  const payload = settingsSchema.parse({
    welcomeAutoSend: formData.get('welcomeAutoSend') === 'on' ? 'on' : 'off',
    welcomeTimeSlot: formData.get('welcomeTimeSlot') ?? '08:00',
  });
  const hostId = await getCurrentHostId();
  const { db } = await getDb();
  await db
    .update(hosts)
    .set({
      welcomeAutoSend: payload.welcomeAutoSend === 'on',
      welcomeTimeSlot: payload.welcomeTimeSlot,
      updatedAt: new Date(),
    })
    .where(eq(hosts.id, hostId));
  revalidatePath('/dashboard/settings');
}
