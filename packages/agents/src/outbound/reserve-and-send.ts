import {
  type Database,
  bookings,
  conversationHandover,
  guestConsentEvents,
  outboundSends,
  properties,
  providers,
} from '@premura/db';
import { checkNumberOnWhatsapp, isKillSwitchOn, sendImage, sendText } from '@premura/integrations';
import { findForbiddenPhone } from '@premura/shared';
import { and, desc, eq, gte, sql } from 'drizzle-orm';

// Prenotazione dello slot di invio + invio. Nessun messaggio automatico a
// un ospite deve partire senza passare di qui.
//
// L'ORDINE E' LA COSA IMPORTANTE.
//
// L'idempotenza che il progetto aveva prima (kits.welcome_message_sent_at,
// un timestamp nullable) e' check-then-write: due worker che partono nello
// stesso istante leggono entrambi NULL e mandano entrambi. Qui invece si
// prenota PRIMA il diritto di inviare, con un INSERT che il database
// rifiuta se lo slot e' gia' preso — UNIQUE(booking_id, trigger). Solo se
// l'INSERT passa si chiama WhatsApp.
//
// Prima si prenota, poi si invia. Mai il contrario. Se si invertisse, un
// crash tra invio e scrittura produrrebbe un secondo invio al retry:
// l'ospite riceve due volte il benvenuto e capisce che c'e' un robot.
//
// Un fallimento NON libera lo slot: la riga resta 'failed' e va sbloccata
// a mano. Cosi' un errore transitorio non innesca un ciclo di retry sul
// numero della villa, che e' il modo piu' rapido per farselo bannare.

export type OutboundTrigger = 'welcome' | 'midstay' | 'checkout' | 'guest_app_invite';

/**
 * Consenso richiesto per trigger (policy dichiarata in schema/enums.ts).
 *
 *  welcome          -> NO: comunicazione di servizio sulla prenotazione
 *  midstay          -> SI: contiene i link ai servizi, quindi commerciale
 *  checkout         -> NO: ringraziamento + richiesta recensione
 *  guest_app_invite -> NO: primo contatto di servizio (guida della casa),
 *                      stessa natura del welcome che gia' porta il link
 */
const CONSENT_REQUIRED: Record<OutboundTrigger, boolean> = {
  welcome: false,
  midstay: true,
  checkout: false,
  guest_app_invite: false,
};

/** Tetto giornaliero di invii REALI. Conta le righe con dry_run = false. */
function maxSendsPerDay(): number {
  const raw = Number.parseInt(process.env.WHATSAPP_MAX_SENDS_PER_DAY ?? '', 10);
  // Default volutamente basso: nel pilot ci sono 3 strutture, un numero
  // di invii a doppia cifra significa che qualcosa e' andato in loop.
  return Number.isFinite(raw) && raw > 0 ? raw : 20;
}

export type SkipReason =
  | 'already_reserved'
  | 'no_phone'
  | 'no_consent'
  | 'handover_active'
  | 'daily_cap_reached'
  | 'phone_not_on_whatsapp'
  | 'kill_switch'
  | 'provider_contact_leak';

export type ReserveAndSendResult =
  | { status: 'sent'; outboundSendId: string; providerMessageId: string | null; dryRun: boolean }
  | { status: 'skipped'; reason: SkipReason; outboundSendId: string | null }
  | { status: 'failed'; outboundSendId: string; error: string };

export type ReserveAndSendInput = {
  bookingId: string;
  trigger: OutboundTrigger;
  /** Corpo gia' composto e gia' passato dalla guardia di conformita'. */
  body: string;
  /** Se valorizzato, si manda un'immagine con il body come didascalia. */
  imageUrl?: string;
  templateKey?: string;
  language?: string;
};

/**
 * Handover: quando una persona vera ha risposto in chat, il bot tace.
 *
 * Il controllo e' sul NUMERO e non sulla prenotazione: l'ospite scrive
 * dallo stesso numero anche prima del check-in o dopo il check-out, e in
 * quei momenti il legame con la prenotazione puo' non esserci.
 */
async function isHandoverActive(db: Database, phoneE164: string, now: Date): Promise<boolean> {
  const [row] = await db
    .select({ until: conversationHandover.until })
    .from(conversationHandover)
    .where(eq(conversationHandover.phoneE164, phoneE164))
    .limit(1);
  return row ? row.until.getTime() > now.getTime() : false;
}

/** Stato consenso = evento piu' recente per quella prenotazione. */
async function hasActiveConsent(db: Database, bookingId: string): Promise<boolean> {
  const [last] = await db
    .select({ action: guestConsentEvents.action })
    .from(guestConsentEvents)
    .where(eq(guestConsentEvents.bookingId, bookingId))
    .orderBy(desc(guestConsentEvents.occurredAt))
    .limit(1);
  return last?.action === 'grant';
}

async function realSendsToday(db: Database, now: Date): Promise<number> {
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);

  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(outboundSends)
    .where(
      and(
        eq(outboundSends.dryRun, false),
        eq(outboundSends.status, 'sent'),
        gte(outboundSends.sentAt, startOfDay),
      ),
    );
  return row?.n ?? 0;
}

export async function reserveAndSend(
  db: Database,
  input: ReserveAndSendInput,
  now: Date = new Date(),
): Promise<ReserveAndSendResult> {
  const { bookingId, trigger } = input;

  // Kill switch controllato per primo: se e' acceso non si prenota
  // nemmeno lo slot, cosi' quando viene spento il trigger puo' ancora
  // partire (uno slot bruciato invece resterebbe occupato per sempre).
  if (isKillSwitchOn()) {
    return { status: 'skipped', reason: 'kill_switch', outboundSendId: null };
  }

  const [booking] = await db
    .select({
      guestPhone: bookings.guestPhone,
      premuraActiveAt: bookings.premuraActiveAt,
      propertyId: bookings.propertyId,
    })
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);

  if (!booking?.guestPhone) {
    return { status: 'skipped', reason: 'no_phone', outboundSendId: null };
  }
  const phoneE164 = booking.guestPhone;

  // REGOLA DI BUSINESS: i contatti dei fornitori non escono MAI verso
  // l'ospite (se ha il numero, ci scavalca — Premura E' il coordinatore).
  // Qualunque cosa abbia composto il testo — cron, bozza approvata,
  // codice futuro — se contiene il numero di un provider 'internal',
  // l'invio muore qui. Prima dello slot: quando il testo viene corretto,
  // il trigger deve poter ripartire.
  const providerPhones = await db
    .select({ phone: providers.phone })
    .from(providers)
    .innerJoin(properties, eq(properties.hostId, providers.hostId))
    .where(and(eq(properties.id, booking.propertyId), eq(providers.contactVisibility, 'internal')));
  const leakedPhone = findForbiddenPhone(
    input.body,
    providerPhones.map((p) => p.phone),
  );
  if (leakedPhone) {
    return { status: 'skipped', reason: 'provider_contact_leak', outboundSendId: null };
  }

  if (CONSENT_REQUIRED[trigger] && !(await hasActiveConsent(db, bookingId))) {
    return { status: 'skipped', reason: 'no_consent', outboundSendId: null };
  }

  if (await isHandoverActive(db, phoneE164, now)) {
    return { status: 'skipped', reason: 'handover_active', outboundSendId: null };
  }

  // Il dry-run si decide QUI e si congela nella riga: se qualcuno cambia
  // la variabile mentre l'invio e' in volo, l'audit deve dire cosa e'
  // successo davvero, non cosa dice l'ambiente adesso. La UI (feed home,
  // timeline check-in) etichetta "simulato" leggendo QUESTA colonna.
  const dryRun = (process.env.WHATSAPP_DRY_RUN ?? 'true').trim().toLowerCase() !== 'false';

  if (!dryRun && (await realSendsToday(db, now)) >= maxSendsPerDay()) {
    return { status: 'skipped', reason: 'daily_cap_reached', outboundSendId: null };
  }

  // ─── LA PRENOTAZIONE ──────────────────────────────────────────────
  // Se un altro worker ha gia' preso questo (booking, trigger), l'INSERT
  // non produce righe e usciamo. Non e' un errore: e' il lucchetto che
  // funziona.
  const [slot] = await db
    .insert(outboundSends)
    .values({
      bookingId,
      trigger,
      status: 'reserved',
      phoneE164,
      dryRun,
      templateKey: input.templateKey ?? null,
      language: input.language ?? null,
      reservedAt: now,
    })
    .onConflictDoNothing({ target: [outboundSends.bookingId, outboundSends.trigger] })
    .returning({ id: outboundSends.id });

  if (!slot) {
    return { status: 'skipped', reason: 'already_reserved', outboundSendId: null };
  }

  // Verifica che il numero esista su WhatsApp. Dopo la prenotazione, non
  // prima: lo slot deve restare occupato anche se il numero risulta
  // inesistente, altrimenti al tick successivo si riprova all'infinito.
  // In dry-run si salta: la simulazione non deve fare NESSUNA chiamata
  // di rete, nemmeno di sola lettura.
  const onWhatsapp = dryRun ? null : await checkNumberOnWhatsapp(phoneE164);
  if (onWhatsapp === false) {
    await db
      .update(outboundSends)
      .set({ status: 'skipped', phoneOnWhatsapp: false, lastError: 'numero non su WhatsApp' })
      .where(eq(outboundSends.id, slot.id));
    return { status: 'skipped', reason: 'phone_not_on_whatsapp', outboundSendId: slot.id };
  }

  try {
    const outcome = input.imageUrl
      ? await sendImage({ to: phoneE164, imageUrl: input.imageUrl, caption: input.body })
      : await sendText(phoneE164, input.body);

    // Caso limite: kill switch acceso DOPO il nostro primo controllo,
    // mentre eravamo tra prenotazione e invio. Il transport non ha
    // inviato: registrarlo come 'sent' sarebbe una bugia nell'audit.
    if (outcome.skippedReason) {
      await db
        .update(outboundSends)
        .set({ status: 'skipped', lastError: `bloccato da ${outcome.skippedReason}` })
        .where(eq(outboundSends.id, slot.id));
      return { status: 'skipped', reason: 'kill_switch', outboundSendId: slot.id };
    }

    await db
      .update(outboundSends)
      .set({
        status: 'sent',
        sentAt: new Date(),
        providerMessageId: outcome.messageId,
        phoneOnWhatsapp: onWhatsapp,
        jitterAppliedMs: outcome.jitterAppliedMs,
        attemptCount: 1,
        lastError: null,
      })
      .where(eq(outboundSends.id, slot.id));

    return {
      status: 'sent',
      outboundSendId: slot.id,
      providerMessageId: outcome.messageId,
      dryRun: outcome.dryRun,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Lo slot resta occupato con status 'failed'. Sbloccarlo richiede un
    // intervento esplicito: un retry automatico su un errore persistente
    // e' esattamente come si fa bannare il numero.
    await db
      .update(outboundSends)
      .set({ status: 'failed', lastError: message, attemptCount: 1, phoneOnWhatsapp: onWhatsapp })
      .where(eq(outboundSends.id, slot.id));
    return { status: 'failed', outboundSendId: slot.id, error: message };
  }
}
