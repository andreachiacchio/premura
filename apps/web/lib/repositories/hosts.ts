import { type Database, hosts } from '@premura/db';
import { eq } from 'drizzle-orm';

// Repository helpers per la tabella hosts. Slice 7a.3 espone solo
// findHostWaNumber per la deflection draft. Altri helper arriveranno
// con onboarding host (Fase 3.2 roadmap).

// Numero WhatsApp dell'host. Per il pilot Andrea questo e' il numero
// Business migrato a Cloud API (vedi docs/META-WEBHOOK-SETUP.md §7).
// Per host #2+ sara' il numero LBA dedicato provisioned al signup.
//
// Schema: oggi il numero "phone" host e' usato anche come WA number
// (per il pilot e' lo stesso). Quando faremo split (host phone personale
// vs host WA business) aggiungeremo una colonna `whatsapp_number`
// dedicata. Per slice 7a.3 leggiamo `phone`.
export async function findHostWaNumber(db: Database, hostId: string): Promise<string | null> {
  const [row] = await db
    .select({ phone: hosts.phone })
    .from(hosts)
    .where(eq(hosts.id, hostId))
    .limit(1);
  return row?.phone ?? null;
}
