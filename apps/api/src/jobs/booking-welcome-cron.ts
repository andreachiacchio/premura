import { type OutboundTrigger, composeBookingWelcome, reserveAndSend } from '@premura/agents';
import { bookings, createServerClient, hosts, properties } from '@premura/db';
import { checkOutboundCompliance } from '@premura/shared';
import { Cron } from 'croner';
import { and, eq, isNotNull, ne, sql } from 'drizzle-orm';
import pino from 'pino';

// Benvenuto per prenotazioni SENZA kit (go-live 1 agosto).
//
// Il cron welcome esistente (welcome-message-cron) parte dai KIT: cerca
// kit set_up con foto del cleaner. Una prenotazione attiva senza kit —
// Julian — non verrebbe mai raggiunta da quel percorso. Questo cron parte
// dalle PRENOTAZIONI: check-in oggi (Europe/Rome), attive, con numero.
//
// I due percorsi non possono doppiare lo stesso ospite: questo passa da
// reserveAndSend, che prenota lo slot outbound_sends (booking, 'welcome')
// con UNIQUE a livello di database. Chiunque arrivi secondo trova lo slot
// occupato ed esce.
//
// Tick: ogni 15 minuti tra le 08:00 e le 11:45 Europe/Rome. L'invio parte
// al primo tick con ora >= welcome_time_slot dell'host (default 08:00).
// NIENTE tick al boot, a differenza del cron iCal: qui si inviano
// messaggi a persone vere, un deploy delle 22 non deve salutare nessuno.

const logger = pino({
  name: 'booking-welcome-cron',
  level: process.env.LOG_LEVEL ?? 'info',
});

const TRIGGER: OutboundTrigger = 'welcome';

/** 'HH:MM' -> minuti da mezzanotte. Slot malformato = default 08:00. */
function slotToMinutes(slot: string | null): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(slot ?? '');
  if (!m) return 8 * 60;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Ora corrente in Europe/Rome come minuti da mezzanotte. */
function nowMinutesInRome(now: Date): number {
  const parts = new Intl.DateTimeFormat('it-IT', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Europe/Rome',
  }).formatToParts(now);
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const min = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return h * 60 + min;
}

export async function runBookingWelcomeTick(now: Date = new Date()): Promise<void> {
  const client = createServerClient();
  try {
    // Candidati: check-in OGGI in Europe/Rome, prenotazione attiva
    // (premura_active_at valorizzato = numero inserito e host d'accordo),
    // host con auto-send attivo. Il filtro sullo slot orario e' in-app.
    const candidates = await client.db
      .select({
        bookingId: bookings.id,
        guestFirstName: bookings.guestFirstName,
        guestFullName: bookings.guestFullName,
        guestLanguage: bookings.guestLanguage,
        checkinAt: bookings.checkinAt,
        propertyName: properties.name,
        welcomeTimeSlot: hosts.welcomeTimeSlot,
        welcomeAutoSend: hosts.welcomeAutoSend,
        aiDisclosureCustom: hosts.aiDisclosureCustom,
      })
      .from(bookings)
      .innerJoin(properties, eq(properties.id, bookings.propertyId))
      .innerJoin(hosts, eq(hosts.id, properties.hostId))
      .where(
        and(
          ne(bookings.status, 'cancelled'),
          isNotNull(bookings.premuraActiveAt),
          isNotNull(bookings.guestPhone),
          sql`(${bookings.checkinAt} at time zone 'Europe/Rome')::date = (now() at time zone 'Europe/Rome')::date`,
        ),
      );

    const nowMin = nowMinutesInRome(now);
    let sent = 0;
    let skipped = 0;

    for (const c of candidates) {
      if (!c.welcomeAutoSend) continue;
      if (nowMin < slotToMinutes(c.welcomeTimeSlot)) continue;

      const body = composeBookingWelcome({
        guestFirstName: c.guestFirstName,
        guestFullName: c.guestFullName,
        propertyName: c.propertyName,
        checkinAt: c.checkinAt,
        language: c.guestLanguage,
        guestAppUrl: process.env.WELCOME_GUEST_APP_URL?.trim() || null,
        aiDisclosureCustom: c.aiDisclosureCustom,
      });

      // Ultima riga di difesa AI Act: il composer mette la disclosure in
      // testa, ma se un refactor futuro la perdesse, qui l'invio si
      // ferma invece di partire non conforme.
      const verdict = checkOutboundCompliance({
        kind: 'free_form',
        body,
        language: c.guestLanguage,
        aiDisclosureSentAt: null,
        aiDisclosureCustom: c.aiDisclosureCustom,
      });
      if (!verdict.ok) {
        logger.error(
          { bookingId: c.bookingId, reason: verdict.reason },
          'benvenuto bloccato dalla guardia di conformita',
        );
        continue;
      }

      const result = await reserveAndSend(client.db, {
        bookingId: c.bookingId,
        trigger: TRIGGER,
        body,
        templateKey: 'booking_welcome_v1',
        language: c.guestLanguage ?? undefined,
      });

      if (result.status === 'sent') {
        sent++;
        logger.info(
          {
            bookingId: c.bookingId,
            dryRun: result.dryRun,
            providerMessageId: result.providerMessageId,
          },
          'benvenuto inviato',
        );
      } else {
        skipped++;
        // 'already_reserved' e' il caso normale dei tick successivi al
        // primo: lo slot UNIQUE ha gia' fatto il suo lavoro.
        logger.info({ bookingId: c.bookingId, result }, 'benvenuto non inviato');
      }
    }

    logger.info({ candidates: candidates.length, sent, skipped }, 'booking welcome tick done');
  } catch (err) {
    logger.error({ err }, 'booking welcome tick failed');
  } finally {
    await client.close();
  }
}

export function startBookingWelcomeCron(): Cron {
  return new Cron('*/15 8-11 * * *', { timezone: 'Europe/Rome' }, () => runBookingWelcomeTick());
}
