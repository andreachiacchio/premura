import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { bookings, type Database } from '@premura/db';
import { isIncompleteDataSource } from '@premura/shared';
import { onNewBooking } from '../workflows/on-new-booking';

// TODO slice 6: auth via JWT host (Supabase Auth) + verifica ownership property
// Per ora endpoint accettano qualsiasi richiesta - solo per dev/staging.

/**
 * Routes per il flusso M2a.4 di completamento manuale prenotazioni Booking
 * data-poor. L'host vede in dashboard una card "complete the data on this
 * Booking reservation" e puo':
 *  - compilare il form (POST /:id/complete-manual) -> data_source diventa
 *    'booking_manual_filled' (RICH) e il workflow agente AI parte
 *  - cliccare "Salta" (POST /:id/skip-completion) -> la card sparisce dal
 *    conteggio top, ma il badge resta sulla riga in lista prenotazioni
 *
 * Vedi docs/m2a4-spec.md sezione 3 (endpoint) e sezione 4 (workflow).
 */

export type BookingsRoutesOptions = {
  db: Database;
  // Override per test: trigger fire-and-forget del workflow agente AI dopo
  // complete-manual. Default = onNewBooking. In test mockiamo per evitare
  // di toccare loadBookingFull (stub non implementato).
  triggerWorkflow?: (bookingId: string) => Promise<void> | void;
};

const completeManualBodySchema = z.object({
  guestFullName: z.string().trim().min(1, 'guestFullName non puo essere vuoto'),
  guestPhone: z.string().trim().min(8, 'guestPhone deve essere almeno 8 caratteri'),
  guestLanguage: z.string().trim().min(2).max(8).optional(),
  numGuests: z.number().int().min(1).optional(),
});

const idParamsSchema = z.object({
  id: z.string().uuid('id deve essere un UUID valido'),
});

export const bookingsRoutes: FastifyPluginAsync<BookingsRoutesOptions> = async (app, opts) => {
  const { db } = opts;
  const triggerWorkflow =
    opts.triggerWorkflow ?? ((bookingId: string) => onNewBooking({ bookingId }));

  app.post('/:id/complete-manual', async (req, reply) => {
    const params = idParamsSchema.safeParse(req.params);
    if (!params.success) {
      return reply.code(400).send({ error: 'invalid_id', issues: params.error.issues });
    }

    const body = completeManualBodySchema.safeParse(req.body);
    if (!body.success) {
      return reply.code(400).send({ error: 'invalid_body', issues: body.error.issues });
    }

    const [existing] = await db
      .select({
        id: bookings.id,
        dataSource: bookings.dataSource,
        premuraActiveAt: bookings.premuraActiveAt,
      })
      .from(bookings)
      .where(eq(bookings.id, params.data.id))
      .limit(1);

    if (!existing) {
      return reply.code(404).send({ error: 'booking_not_found' });
    }

    if (!isIncompleteDataSource(existing.dataSource)) {
      return reply.code(400).send({
        error: 'booking_not_incomplete',
        message: 'booking is not in incomplete state',
      });
    }

    // premura_active_at e' il gate di TUTTE le pipeline a valle
    // (guest-app-invite-cron, booking-welcome-cron). Finora questo
    // percorso scriveva il telefono ma non attivava: l'host compilava
    // il form, la riga diventava completa, e l'agente non la
    // raccoglieva mai. Attiviamo solo se non era gia' attiva, per non
    // riaccendere una riga esclusa di proposito (stessa regola di
    // setBookingGuestPhone).
    const attivaOra = !existing.premuraActiveAt;

    await db
      .update(bookings)
      .set({
        guestFullName: body.data.guestFullName,
        guestPhone: body.data.guestPhone,
        guestLanguage: body.data.guestLanguage ?? 'it',
        numGuests: body.data.numGuests ?? 1,
        dataSource: 'booking_manual_filled',
        manualCompletionAt: sql`NOW()`,
        ...(attivaOra
          ? { premuraActiveAt: sql`NOW()`, guestPhoneSource: 'manual' as const }
          : {}),
        updatedAt: sql`NOW()`,
      })
      .where(eq(bookings.id, params.data.id));

    // Fire-and-forget del workflow agente AI: non blocchiamo la response
    // dell'host. Errori loggati ma non propagati - il booking e' comunque
    // arricchito a DB e un eventuale retry/cron successivo puo' rilanciarlo.
    void Promise.resolve(triggerWorkflow(params.data.id)).catch((err) => {
      req.log.error(
        { err, bookingId: params.data.id },
        'on-new-booking trigger failed after complete-manual',
      );
    });

    return reply.code(200).send({
      success: true,
      bookingId: params.data.id,
      dataSource: 'booking_manual_filled',
    });
  });

  app.post('/:id/skip-completion', async (req, reply) => {
    const params = idParamsSchema.safeParse(req.params);
    if (!params.success) {
      return reply.code(400).send({ error: 'invalid_id', issues: params.error.issues });
    }

    const [existing] = await db
      .select({ id: bookings.id, dataSource: bookings.dataSource })
      .from(bookings)
      .where(eq(bookings.id, params.data.id))
      .limit(1);

    if (!existing) {
      return reply.code(404).send({ error: 'booking_not_found' });
    }

    if (!isIncompleteDataSource(existing.dataSource)) {
      return reply.code(400).send({
        error: 'booking_not_incomplete',
        message: 'booking is not in incomplete state',
      });
    }

    await db
      .update(bookings)
      .set({
        hostSkippedCompletion: true,
        updatedAt: sql`NOW()`,
      })
      .where(eq(bookings.id, params.data.id));

    return reply.code(200).send({
      success: true,
      bookingId: params.data.id,
    });
  });
};
