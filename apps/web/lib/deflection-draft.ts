import { type Database, bookings, messages, pendingDrafts, properties } from '@premura/db';
import { and, eq, sql } from 'drizzle-orm';

// Deflection draft (slice 7a.3): nudge proattivo da inviare in-platform
// (Booking inbox / Airbnb inbox) per spostare la conversazione su
// WhatsApp.
//
// Strategia conferma da Andrea (vedi
// docs/SLICE7-RESEARCH-MESSAGE-SOURCES.md §3.C):
//   - Niente automazione invio in-platform in V1: rischio [link removed]
//     o numero bloccato dalla piattaforma + host non se ne accorge.
//   - Host approva manualmente: card dashboard con preview + bottone
//     "Copia" (clipboard) + bottone "Apri Booking/Airbnb inbox".
//   - Quando host clicka "Copia", persistiamo un message outbound con
//     metadata.deflection_attempt=true per misurare conversion rate
//     in slice 8+.
//
// Idempotenza: una sola pending_draft di kind='deflection_wa_invite'
// per booking. La server action getOrCreateDeflectionDraft fa
// lookup-or-insert.

export const DEFLECTION_KIND = 'deflection_wa_invite' as const;
export const DEFLECTION_DEFAULT_TTL_DAYS = 14;

// Genera il body deflection per una prenotazione. Lingua determinata
// dal booking.guestLanguage (fallback italiano). Firma con nome
// struttura (mai brand Premura — anti-disintermediazione).
export function buildDeflectionBody(input: {
  guestFirstName: string;
  propertyName: string;
  hostWaNumber: string;
  language: string | null;
}): string {
  const lang = (input.language ?? 'it').toLowerCase().slice(0, 2);
  const greeting = greetByLanguage(lang, input.guestFirstName);
  const cta = ctaByLanguage(lang, input.hostWaNumber);
  const sign = `— ${input.propertyName}`;
  return `${greeting}\n\n${cta}\n\n${sign}`;
}

function greetByLanguage(lang: string, firstName: string): string {
  switch (lang) {
    case 'en':
      return `Hi ${firstName},`;
    case 'es':
      return `Hola ${firstName},`;
    case 'fr':
      return `Bonjour ${firstName},`;
    case 'de':
      return `Hallo ${firstName},`;
    default:
      return `Ciao ${firstName},`;
  }
}

function ctaByLanguage(lang: string, waNumber: string): string {
  switch (lang) {
    case 'en':
      return `for the practical info on your stay (keys, Wi-Fi, parking) you can write me on WhatsApp at ${waNumber}. I check it more often than this inbox.`;
    case 'es':
      return `para la info practica del alojamiento (llaves, Wi-Fi, aparcamiento) puedes escribirme por WhatsApp al ${waNumber}. Lo miro mas a menudo que este buzon.`;
    case 'fr':
      return `pour les infos pratiques sur le sejour (cles, Wi-Fi, parking) vous pouvez m'ecrire sur WhatsApp au ${waNumber}. Je le consulte plus souvent que cette messagerie.`;
    case 'de':
      return `für die praktischen Infos zum Aufenthalt (Schluessel, WLAN, Parken) kannst du mir auf WhatsApp unter ${waNumber} schreiben. Ich schaue dort haeufiger nach als hier.`;
    default:
      return `per le info pratiche del soggiorno (chiavi, Wi-Fi, parcheggio) puoi scrivermi su WhatsApp al ${waNumber}. Lo controllo piu' spesso di questa casella.`;
  }
}

export type DeflectionDraftStatus = 'pending' | 'approved' | 'rejected' | 'modified' | 'expired';

export type DeflectionDraftRow = {
  id: string;
  bookingId: string;
  hostId: string;
  draftResponse: string;
  status: DeflectionDraftStatus;
  metadata: Record<string, unknown>;
  createdAt: Date;
  expiresAt: Date;
};

// Lookup esistente o crea: cerca pending_draft kind=deflection_wa_invite
// per quel booking. Se trovato, ritorna; altrimenti genera il body e lo
// inserisce.
//
// Restituisce null se la booking non e' eligible (es. canale non
// platform-based, o gia' deflectata da host manualmente).
export async function getOrCreateDeflectionDraft(
  db: Database,
  bookingId: string,
  hostWaNumber: string,
): Promise<DeflectionDraftRow | null> {
  // Step 1: lookup booking + property.
  const [bookingRow] = await db
    .select({
      id: bookings.id,
      platform: bookings.platform,
      guestFullName: bookings.guestFullName,
      guestFirstName: bookings.guestFirstName,
      guestLanguage: bookings.guestLanguage,
      checkoutAt: bookings.checkoutAt,
      propertyName: properties.name,
      hostId: properties.hostId,
    })
    .from(bookings)
    .innerJoin(properties, eq(bookings.propertyId, properties.id))
    .where(eq(bookings.id, bookingId))
    .limit(1);

  if (!bookingRow) return null;

  // Solo per piattaforme che hanno una inbox interna (Booking, Airbnb).
  if (bookingRow.platform !== 'booking' && bookingRow.platform !== 'airbnb') {
    return null;
  }

  // Step 2: lookup esistente.
  const [existing] = await db
    .select()
    .from(pendingDrafts)
    .where(and(eq(pendingDrafts.bookingId, bookingId), eq(pendingDrafts.kind, DEFLECTION_KIND)))
    .limit(1);

  if (existing) {
    return {
      id: existing.id,
      bookingId: existing.bookingId,
      hostId: existing.hostId,
      draftResponse: existing.draftResponse,
      status: existing.status,
      metadata: existing.metadata,
      createdAt: existing.createdAt,
      expiresAt: existing.expiresAt,
    };
  }

  // Step 3: genera body + insert.
  const guestFirstName =
    bookingRow.guestFirstName ?? bookingRow.guestFullName.split(/\s+/)[0] ?? 'Ospite';
  const draftBody = buildDeflectionBody({
    guestFirstName,
    propertyName: bookingRow.propertyName,
    hostWaNumber,
    language: bookingRow.guestLanguage,
  });

  // TTL: alla data di checkout (oltre, il deflection non ha piu' senso).
  // Se checkout e' nel passato (improbabile per slice 7a.3 ma robusto),
  // TTL minimo 14 giorni dal now.
  const now = new Date();
  const ttlFromCheckout = bookingRow.checkoutAt;
  const ttlMin = new Date(now.getTime() + DEFLECTION_DEFAULT_TTL_DAYS * 24 * 60 * 60 * 1000);
  const expiresAt = ttlFromCheckout > now ? ttlFromCheckout : ttlMin;

  const [inserted] = await db
    .insert(pendingDrafts)
    .values({
      kind: DEFLECTION_KIND,
      bookingId: bookingRow.id,
      hostId: bookingRow.hostId,
      draftResponse: draftBody,
      reasoning:
        'Deflection automatica: invita ospite su WhatsApp per content rich + escalation rapida.',
      suggestedAction: `Copia il testo e incollalo nella inbox ${bookingRow.platform === 'booking' ? 'Booking' : 'Airbnb'}.`,
      metadata: {
        target_channel: bookingRow.platform === 'booking' ? 'booking_inbox' : 'airbnb_inbox',
        source_booking_id: bookingRow.id,
        wa_number: hostWaNumber,
        deflection_attempt: false, // diventa true quando host clicka "Copia"
      },
      expiresAt,
    })
    .returning();

  if (!inserted) {
    throw new Error('[deflection-draft] insert returned no row');
  }

  return {
    id: inserted.id,
    bookingId: inserted.bookingId,
    hostId: inserted.hostId,
    draftResponse: inserted.draftResponse,
    status: inserted.status,
    metadata: inserted.metadata,
    createdAt: inserted.createdAt,
    expiresAt: inserted.expiresAt,
  };
}

// Marca deflection come "tentata": host ha cliccato Copia nel UI. Il
// draft passa a status='approved' (l'host ha effettivamente preso
// l'azione) e viene insert una row in messages con
// channel=booking_inbox/airbnb_inbox, direction=outbound,
// fromEntity=host, metadata.deflection_attempt=true.
//
// Idempotente: clic multipli non duplicano.
export async function markDeflectionSent(
  db: Database,
  draftId: string,
): Promise<{ status: 'marked' | 'already_marked' | 'not_found'; messageId?: string }> {
  const [draft] = await db
    .select()
    .from(pendingDrafts)
    .where(and(eq(pendingDrafts.id, draftId), eq(pendingDrafts.kind, DEFLECTION_KIND)))
    .limit(1);

  if (!draft) return { status: 'not_found' };
  if (draft.status === 'approved') return { status: 'already_marked' };

  const targetChannel =
    (draft.metadata.target_channel as 'booking_inbox' | 'airbnb_inbox' | undefined) ??
    'booking_inbox';

  const now = new Date();

  await db
    .update(pendingDrafts)
    .set({
      status: 'approved',
      approvedAt: now,
      finalResponseSent: draft.draftResponse,
      metadata: sql`jsonb_set(${pendingDrafts.metadata}, '{deflection_attempt}', 'true'::jsonb)`,
    })
    .where(eq(pendingDrafts.id, draftId));

  const [insertedMsg] = await db
    .insert(messages)
    .values({
      bookingId: draft.bookingId,
      conversationId: null, // Booking/Airbnb inbox: no conversation tracking server-side
      channel: targetChannel,
      direction: 'outbound',
      fromEntity: 'host',
      toEntity: 'guest',
      body: draft.draftResponse,
      sentAt: now,
      metadata: {
        deflection_attempt: true,
        deflection_draft_id: draftId,
        host_clicked_at: now.toISOString(),
        wa_number: draft.metadata.wa_number,
      },
    })
    .returning({ id: messages.id });

  return { status: 'marked', messageId: insertedMsg?.id };
}
