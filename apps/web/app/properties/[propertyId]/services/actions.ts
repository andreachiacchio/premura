'use server';

import { getCurrentHostId } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { createService, setServiceActive, updateService } from '@/lib/repositories/services';
import { serviceFormSchema } from '@/lib/services-form';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

// Server actions sezione Servizi (30/07). Ownership verificata nel
// repository (join property -> host); qui solo validazione input e
// revalidate della pagina.

const idSchema = z.string().uuid();

export type ServiceActionResult = { ok: true } | { ok: false; error: string };

function firstError(err: z.ZodError): string {
  return err.issues[0]?.message ?? 'Dati non validi';
}

export async function createServiceAction(
  propertyId: string,
  raw: unknown,
): Promise<ServiceActionResult> {
  const hostId = await getCurrentHostId();
  const propId = idSchema.safeParse(propertyId);
  if (!propId.success) return { ok: false, error: 'Struttura non valida' };
  const values = serviceFormSchema.safeParse(raw);
  if (!values.success) return { ok: false, error: firstError(values.error) };

  const { db } = await getDb();
  const result = await createService(db, hostId, propId.data, values.data);
  if (!result.ok) return { ok: false, error: 'Salvataggio fallito, riprova' };
  revalidatePath(`/properties/${propId.data}/services`);
  return { ok: true };
}

export async function updateServiceAction(
  serviceId: string,
  propertyId: string,
  raw: unknown,
): Promise<ServiceActionResult> {
  const hostId = await getCurrentHostId();
  const svcId = idSchema.safeParse(serviceId);
  const propId = idSchema.safeParse(propertyId);
  if (!svcId.success || !propId.success) return { ok: false, error: 'Servizio non valido' };
  const values = serviceFormSchema.safeParse(raw);
  if (!values.success) return { ok: false, error: firstError(values.error) };

  const { db } = await getDb();
  const result = await updateService(db, hostId, svcId.data, values.data);
  if (!result.ok) return { ok: false, error: 'Salvataggio fallito, riprova' };
  revalidatePath(`/properties/${propId.data}/services`);
  return { ok: true };
}

export async function toggleServiceActiveAction(
  serviceId: string,
  propertyId: string,
  isActive: boolean,
): Promise<ServiceActionResult> {
  const hostId = await getCurrentHostId();
  const svcId = idSchema.safeParse(serviceId);
  const propId = idSchema.safeParse(propertyId);
  if (!svcId.success || !propId.success) return { ok: false, error: 'Servizio non valido' };

  const { db } = await getDb();
  const result = await setServiceActive(db, hostId, svcId.data, isActive);
  if (!result.ok) return { ok: false, error: 'Operazione fallita' };
  revalidatePath(`/properties/${propId.data}/services`);
  return { ok: true };
}
