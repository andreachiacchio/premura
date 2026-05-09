import {
  type Database,
  type KitItem,
  bookings,
  cleaners,
  hosts,
  kits,
  properties,
  propertyKnowledge,
} from '@premura/db';
import { sendText } from '@premura/integrations';
import { and, eq, isNotNull, isNull } from 'drizzle-orm';

// Slice C — WA brief Karen.
//
// Composer + sender della brief WhatsApp alla cleaner quando il founder
// clicca "Tutto ordinato" sulla pagina /dashboard/kits/[id]/execute.
//
// Lingua: SOLO italiano (Karen e' italiana, no detection).
// Side effect: sets kits.cleanerBriefedAt = now() dopo invio OK.
//
// Reply detection: handleCleanerReplyForKitAcceptance() viene chiamato dal
// webhook WA inbound. Riceve fromPhone + db, trova il kit briefed piu'
// recente per quel cleaner senza acceptedAt e lo marca.
// ─────────────────────────────────────────────────────────────

export type ComposeBriefInput = {
  property: { name: string };
  booking: { checkinAt: Date; guestFullName: string };
  cleaner: { fullName: string };
  items: KitItem[];
  cardMessage: string; // it/en gia' selezionato code-side per la lingua del guest
  cardLanguage: 'it' | 'en';
  amazonLockerAddress: string | null;
  arrivalEta: Date | null;
  defaultPlacement: string | null; // override property_knowledge.kit_default_placement
};

export function composeCleanerBrief(input: ComposeBriefInput): string {
  const checkinFmt = formatCheckin(input.booking.checkinAt);

  const amazonItems = input.items.filter((it) => it.fonte === 'amazon');
  const glovoItems = input.items.filter((it) => it.fonte === 'glovo');
  const manualItems = input.items.filter(
    (it) => it.fonte === 'manual_print' || it.fonte === 'manual_write',
  );

  const lines: string[] = [];

  lines.push(`Ciao ${input.cleaner.fullName} 👋`);
  lines.push(`Kit per ${input.property.name} - check-in ${checkinFmt}`);
  lines.push('');

  // ─── Sezione RITIRO ──────────────────────────────────────────
  lines.push('📦 RITIRO:');
  if (amazonItems.length > 0) {
    const locker = input.amazonLockerAddress ?? '[indirizzo locker da configurare]';
    const eta = input.arrivalEta ? formatEta(input.arrivalEta) : 'data in conferma';
    lines.push(`- Amazon Locker ${locker} dal ${eta}`);
  }
  if (glovoItems.length > 0) {
    lines.push('- Mattina check-in ordino io Glovo a casa tua');
  }
  if (amazonItems.length === 0 && glovoItems.length === 0) {
    lines.push('- Solo manuali (vedi sotto)');
  }
  lines.push('');

  // ─── Sezione SETUP ──────────────────────────────────────────
  lines.push(`🎯 SETUP RICHIESTO (${input.property.name}):`);
  for (const it of input.items) {
    if (it.fonte === 'manual_write') {
      // Biglietto manoscritto: la cleaner scrive il testo a mano.
      const cardLabel = input.cardLanguage === 'en' ? 'Card message' : 'Biglietto manoscritto';
      lines.push(
        `- ${cardLabel}: scrivi a mano "${input.cardMessage}" sul biglietto pre-stampato`,
      );
    } else {
      const desc = it.specificDescription ?? it.taxonomyKey ?? 'item';
      lines.push(`- ${desc}`);
    }
  }
  if (manualItems.every((m) => m.fonte !== 'manual_write')) {
    // Se nessun manual_write esplicito, aggiungi comunque la card line
    // (caso edge: agent dimentica di emettere biglietto_manoscritto).
    if (input.cardMessage) {
      lines.push(
        `- Biglietto manoscritto: scrivi a mano "${input.cardMessage}" sul biglietto pre-stampato`,
      );
    }
  }
  lines.push('');

  // ─── Sezione DOVE LASCIARE ──────────────────────────────────
  const placement = input.defaultPlacement ?? 'tavolo cucina';
  lines.push(`📋 DOVE LASCIARE: ${placement}`);
  lines.push('');

  // ─── Foto ────────────────────────────────────────────────────
  lines.push('📸 PRIMA di uscire: foto del setup completo + carica nell\'app Premura');
  lines.push('');

  // ─── Pagamento ───────────────────────────────────────────────
  lines.push('💰 €2 cumulativo a fine mese');
  lines.push('');

  lines.push('Tutto chiaro? Confermami con 👍');

  return lines.join('\n');
}

function formatCheckin(d: Date): string {
  // DD/MM HH:mm
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatEta(d: Date): string {
  // DD/MM
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
}

// ─────────────────────────────────────────────────────────────
// Sender: fetch context + compose + send + mark briefed.
// ─────────────────────────────────────────────────────────────

export type SendBriefResult =
  | { status: 'sent'; messageId: string }
  | { status: 'skipped_already_briefed' }
  | { status: 'skipped_no_kit' }
  | { status: 'skipped_no_cleaner' }
  | { status: 'send_error'; error: string };

export async function sendCleanerBrief(
  db: Database,
  kitId: string,
  options: { amazonLockerAddress?: string | null; arrivalEta?: Date | null } = {},
): Promise<SendBriefResult> {
  const [row] = await db
    .select({
      kitId: kits.id,
      kitItems: kits.items,
      kitCardIt: kits.cardMessage,
      kitCardEn: kits.cardMessageEn,
      kitGuestLanguage: kits.guestLanguage,
      kitCleanerBriefedAt: kits.cleanerBriefedAt,
      bookingCheckinAt: bookings.checkinAt,
      bookingGuestFullName: bookings.guestFullName,
      propertyName: properties.name,
      propertyId: properties.id,
      cleanerId: properties.cleanerId,
    })
    .from(kits)
    .innerJoin(bookings, eq(kits.bookingId, bookings.id))
    .innerJoin(properties, eq(bookings.propertyId, properties.id))
    .where(eq(kits.id, kitId))
    .limit(1);

  if (!row) return { status: 'skipped_no_kit' };
  if (row.kitCleanerBriefedAt) return { status: 'skipped_already_briefed' };
  if (!row.cleanerId) return { status: 'skipped_no_cleaner' };

  const [cleanerRow] = await db
    .select({
      fullName: cleaners.fullName,
      whatsappNumber: cleaners.whatsappNumber,
    })
    .from(cleaners)
    .where(eq(cleaners.id, row.cleanerId))
    .limit(1);
  if (!cleanerRow) return { status: 'skipped_no_cleaner' };

  // property_knowledge.kit_default_placement (override)
  const [knowledgeRow] = await db
    .select({ kitDefaultPlacement: propertyKnowledge.kitDefaultPlacement })
    .from(propertyKnowledge)
    .where(eq(propertyKnowledge.propertyId, row.propertyId))
    .limit(1);

  const cardLanguage: 'it' | 'en' = row.kitGuestLanguage === 'en' ? 'en' : 'it';
  const cardMessage = (cardLanguage === 'en' ? row.kitCardEn : row.kitCardIt) ?? '';

  const brief = composeCleanerBrief({
    property: { name: row.propertyName },
    booking: {
      checkinAt: row.bookingCheckinAt,
      guestFullName: row.bookingGuestFullName,
    },
    cleaner: { fullName: cleanerRow.fullName },
    items: row.kitItems,
    cardMessage,
    cardLanguage,
    amazonLockerAddress: options.amazonLockerAddress ?? null,
    arrivalEta: options.arrivalEta ?? null,
    defaultPlacement: knowledgeRow?.kitDefaultPlacement ?? null,
  });

  let messageId: string;
  try {
    const res = await sendText(cleanerRow.whatsappNumber, brief);
    messageId = res.messageId;
  } catch (err) {
    return {
      status: 'send_error',
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const now = new Date();
  await db
    .update(kits)
    .set({ cleanerBriefedAt: now, status: 'ordering', updatedAt: now })
    .where(eq(kits.id, kitId));

  return { status: 'sent', messageId };
}

// ─────────────────────────────────────────────────────────────
// Reply detection — chiamata dal webhook WA inbound.
//
// Quando un messaggio inbound arriva, se il from match un cleaner del
// nostro DB e c'e' un kit briefed (cleanerBriefedAt NOT NULL,
// cleanerAcceptedAt NULL) per uno dei suoi properties, marca acceptedAt.
// Limitiamo al kit piu' recente non-acceptato per quel cleaner.
// ─────────────────────────────────────────────────────────────

export type ReplyHandleResult =
  | { status: 'accepted'; kitId: string }
  | { status: 'no_cleaner_match' }
  | { status: 'no_pending_kit' };

export async function handleCleanerReplyForKitAcceptance(
  db: Database,
  fromPhone: string,
): Promise<ReplyHandleResult> {
  const normalized = normalizeForLookup(fromPhone);
  // Match cleaner: confronto su last 9 digit (gestisce '+39' o no).
  const allCleaners = await db
    .select({ id: cleaners.id, whatsappNumber: cleaners.whatsappNumber })
    .from(cleaners)
    .where(eq(cleaners.isActive, true));
  const matched = allCleaners.find(
    (c) => normalizeForLookup(c.whatsappNumber).slice(-9) === normalized.slice(-9),
  );
  if (!matched) return { status: 'no_cleaner_match' };

  // Trova il kit piu' recente briefed-non-acceptato per qualsiasi
  // property di questo cleaner.
  const [pendingKit] = await db
    .select({ kitId: kits.id, briefedAt: kits.cleanerBriefedAt })
    .from(kits)
    .innerJoin(bookings, eq(kits.bookingId, bookings.id))
    .innerJoin(properties, eq(bookings.propertyId, properties.id))
    .where(
      and(
        eq(properties.cleanerId, matched.id),
        isNotNull(kits.cleanerBriefedAt),
        isNull(kits.cleanerAcceptedAt),
      ),
    )
    .orderBy(kits.cleanerBriefedAt)
    .limit(1);
  if (!pendingKit) return { status: 'no_pending_kit' };

  const now = new Date();
  await db
    .update(kits)
    .set({ cleanerAcceptedAt: now, updatedAt: now })
    .where(eq(kits.id, pendingKit.kitId));

  return { status: 'accepted', kitId: pendingKit.kitId };
}

function normalizeForLookup(raw: string): string {
  return raw.replace(/\D/g, '');
}

// Helper per UI/email: "amazon ordina entro X" date.
export function computeAmazonOrderByDate(checkinAt: Date): Date {
  // 2 giorni prima del check-in (Amazon Business 2-day lead time).
  const d = new Date(checkinAt);
  d.setDate(d.getDate() - 2);
  return d;
}

// Lookup inverso usato dalla UI execute per costruire i link search.
export function buildAmazonSearchUrl(query: string): string {
  // amazon.it/s con marketplace italiano. Business marketplace condivide
  // catalogo, link compatibili.
  const q = encodeURIComponent(query);
  return `https://www.amazon.it/s?k=${q}`;
}

export function buildGlovoSearchUrl(query: string): string {
  // Glovo non ha deeplink stabili per search. Fallback web napoli.
  const q = encodeURIComponent(query);
  return `https://glovoapp.com/it/it/napoli/s/?query=${q}`;
}

// Hosts info per email.
export type KitNotificationContext = {
  kitId: string;
  bookingId: string;
  hostId: string;
  hostFullName: string | null;
  hostEmail: string;
  guestFullName: string;
  propertyName: string;
  checkinAt: Date;
  nights: number;
  budgetTargetEur: string;
  itemsTotalEur: string | null;
  storyteller: string | null; // storytelling preview 1-line
  status: string;
};

export async function loadKitNotificationContext(
  db: Database,
  kitId: string,
): Promise<KitNotificationContext | null> {
  const [row] = await db
    .select({
      kitId: kits.id,
      bookingId: kits.bookingId,
      hostId: hosts.id,
      hostFullName: hosts.fullName,
      hostEmail: hosts.email,
      guestFullName: bookings.guestFullName,
      propertyName: properties.name,
      checkinAt: bookings.checkinAt,
      nights: bookings.nights,
      budgetEur: kits.budgetEur,
      itemsTotalEur: kits.itemsTotalEur,
      storytellingIt: kits.storytellingIt,
      storytellingEn: kits.storytellingEn,
      guestLanguage: kits.guestLanguage,
      status: kits.status,
    })
    .from(kits)
    .innerJoin(bookings, eq(kits.bookingId, bookings.id))
    .innerJoin(properties, eq(bookings.propertyId, properties.id))
    .innerJoin(hosts, eq(properties.hostId, hosts.id))
    .where(eq(kits.id, kitId))
    .limit(1);
  if (!row) return null;

  const storytelling =
    row.guestLanguage === 'en' ? row.storytellingEn ?? null : row.storytellingIt ?? null;

  return {
    kitId: row.kitId,
    bookingId: row.bookingId,
    hostId: row.hostId,
    hostFullName: row.hostFullName,
    hostEmail: row.hostEmail,
    guestFullName: row.guestFullName,
    propertyName: row.propertyName,
    checkinAt: row.checkinAt,
    nights: row.nights,
    budgetTargetEur: row.budgetEur,
    itemsTotalEur: row.itemsTotalEur,
    storyteller: storytelling ? storytelling.split('\n')[0]?.slice(0, 200) ?? null : null,
    status: row.status,
  };
}
