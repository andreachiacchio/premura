import {
  type OutboundTrigger,
  composeGuestAppInvite,
  guestAppInviteDisclosures,
  reserveAndSend,
} from '@premura/agents';
import { bookings, createServerClient, hosts, outboundSends, properties } from '@premura/db';
import { checkOutboundCompliance } from '@premura/shared';
import { Cron } from 'croner';
import { and, eq, gte, isNotNull, isNull, ne } from 'drizzle-orm';
import pino from 'pino';

// Invito guest app APPENA COMPARE IL NUMERO (flusso canonico §2b,
// punti 2-3): l'ospite lascia il numero (guest app L1, parser email o
// inserimento manuale dell'host) e Premura manda la guida della casa.
// Presenza subito dopo la prenotazione = prevenire la cancellazione.
//
// Guardie, nell'ordine:
//  - solo prenotazioni ATTIVE (premura_active_at: numero presente e
//    host d'accordo) di strutture con guest_app_url configurato — mai
//    link rotti
//  - solo check-in a PIU' di 2 giorni: chi arriva prima riceve gia' il
//    benvenuto del giorno di check-in (che contiene lo stesso link) e
//    due messaggi ravvicinati leggono da robot. Julian (1 ago) resta
//    fuori: il suo primo contatto e' il benvenuto approvato parola per
//    parola.
//  - una volta sola per prenotazione: slot outbound_sends
//    (booking, 'guest_app_invite') con UNIQUE a livello di database
//  - tutto il resto (kill switch, dry-run, handover, tetto giornaliero,
//    contatti fornitori) lo fa reserveAndSend, come per ogni outbound.
//
// Tick ogni 10 minuti, solo in orario umano (08-21 Europe/Rome): un
// numero inserito a mezzanotte genera l'invito la mattina dopo.

const logger = pino({
  name: 'guest-app-invite-cron',
  level: process.env.LOG_LEVEL ?? 'info',
});

const TRIGGER: OutboundTrigger = 'guest_app_invite';

/** Check-in a piu' di N giorni INTERI da oggi. BUG 30/07: la soglia a
 *  startOfToday+2 con gt() lasciava passare le prenotazioni del giorno
 *  +2 con orario reale (Julian, 1/8 ore 15: 1/8 15:00 > 1/8 00:00) —
 *  esattamente chi doveva restare fuori. La soglia giusta e' l'INIZIO
 *  del giorno +3: tutto cio' che arriva nei prossimi 2 giorni interi
 *  (oggi compreso) resta al benvenuto del check-in. */
export const MIN_FULL_DAYS_BEFORE_CHECKIN = 2;

export function checkinThreshold(now: Date): Date {
  const t = new Date(now);
  t.setHours(0, 0, 0, 0);
  t.setDate(t.getDate() + MIN_FULL_DAYS_BEFORE_CHECKIN + 1);
  return t;
}

export async function runGuestAppInviteTick(now: Date = new Date()): Promise<void> {
  const client = createServerClient();
  try {
    const candidates = await client.db
      .select({
        bookingId: bookings.id,
        guestFirstName: bookings.guestFirstName,
        guestFullName: bookings.guestFullName,
        guestLanguage: bookings.guestLanguage,
        propertyName: properties.name,
        guestAppUrl: properties.guestAppUrl,
        aiDisclosureCustom: hosts.aiDisclosureCustom,
      })
      .from(bookings)
      .innerJoin(properties, eq(properties.id, bookings.propertyId))
      .innerJoin(hosts, eq(hosts.id, properties.hostId))
      .leftJoin(
        outboundSends,
        and(eq(outboundSends.bookingId, bookings.id), eq(outboundSends.trigger, TRIGGER)),
      )
      .where(
        and(
          ne(bookings.status, 'cancelled'),
          eq(bookings.isCalendarBlock, false),
          isNotNull(bookings.premuraActiveAt),
          isNotNull(bookings.guestPhone),
          isNotNull(properties.guestAppUrl),
          gte(bookings.checkinAt, checkinThreshold(now)),
          // Mai due volte: se lo slot esiste (sent, skipped o failed),
          // questa prenotazione ha gia' avuto il suo turno.
          isNull(outboundSends.id),
        ),
      );

    let sent = 0;
    let skipped = 0;

    for (const c of candidates) {
      if (!c.guestAppUrl) continue;

      const body = composeGuestAppInvite({
        guestFirstName: c.guestFirstName,
        guestFullName: c.guestFullName,
        propertyName: c.propertyName,
        language: c.guestLanguage,
        guestAppUrl: c.guestAppUrl,
        aiDisclosureCustom: c.aiDisclosureCustom,
      });

      // Ultima riga di difesa AI Act: la disclosure confrontata e' la
      // STESSA (per struttura) che il composer ha messo in testa.
      const verdict = checkOutboundCompliance({
        kind: 'free_form',
        body,
        language: c.guestLanguage,
        aiDisclosureSentAt: null,
        aiDisclosureCustom: guestAppInviteDisclosures(c.propertyName, c.aiDisclosureCustom),
      });
      if (!verdict.ok) {
        logger.error(
          { bookingId: c.bookingId, reason: verdict.reason },
          'invito guest app bloccato dalla guardia di conformita',
        );
        continue;
      }

      const result = await reserveAndSend(client.db, {
        bookingId: c.bookingId,
        trigger: TRIGGER,
        body,
        templateKey: 'guest_app_invite_v1',
        language: c.guestLanguage ?? undefined,
      });

      if (result.status === 'sent') {
        sent++;
        logger.info(
          { bookingId: c.bookingId, dryRun: result.dryRun },
          'invito guest app inviato',
        );
      } else {
        skipped++;
        logger.info({ bookingId: c.bookingId, result }, 'invito guest app non inviato');
      }
    }

    logger.info({ candidates: candidates.length, sent, skipped }, 'guest app invite tick done');
  } catch (err) {
    logger.error({ err }, 'guest app invite tick failed');
  } finally {
    await client.close();
  }
}

export function startGuestAppInviteCron(): Cron {
  // Orario umano: mai svegliare un ospite alle 3 per un link.
  return new Cron('*/10 8-21 * * *', { timezone: 'Europe/Rome' }, () => runGuestAppInviteTick());
}
