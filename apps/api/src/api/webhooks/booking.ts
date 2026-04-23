import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

/**
 * Webhook endpoint for Booking.com new reservations.
 *
 * Booking.com Connectivity sends reservation updates via XML push to a URL
 * registered with them during onboarding. We normalize to JSON and enqueue
 * a new-booking job for async processing.
 *
 * Docs: https://developers.booking.com/connectivity/docs
 *
 * NOTE: This is a stub. Real implementation needs:
 *  - HMAC signature verification (Booking-specific header)
 *  - XML parsing (Booking sends XML, not JSON)
 *  - Idempotency (store reservation IDs, skip duplicates)
 *  - Retry with exponential backoff
 */

const bookingReservationSchema = z.object({
  reservation_id: z.string(),
  property_id: z.string(),
  guest: z.object({
    first_name: z.string(),
    last_name: z.string(),
    country_code: z.string().length(2).optional(),
    email: z.string().email().optional(),
  }),
  checkin: z.string(), // ISO date
  checkout: z.string(),
  num_adults: z.number().int().min(1),
  num_children: z.number().int().min(0).default(0),
  total_price_eur: z.number().optional(),
  guest_note: z.string().optional(),
  status: z.enum(['new', 'modified', 'cancelled']),
});

export const bookingWebhooksRoutes: FastifyPluginAsync = async (app) => {
  app.post('/webhooks/booking', async (req, reply) => {
    // TODO: verify HMAC signature from Booking
    // const signature = req.headers['x-booking-signature'];

    const parsed = bookingReservationSchema.safeParse(req.body);
    if (!parsed.success) {
      req.log.warn({ issues: parsed.error.issues }, 'Invalid Booking webhook payload');
      return reply.code(400).send({ error: 'invalid_payload' });
    }

    const reservation = parsed.data;

    // Idempotency check (skip if we already processed this reservation)
    // const existing = await db.query.bookings.findFirst({...})
    // if (existing) return reply.code(200).send({ skipped: true });

    if (reservation.status === 'cancelled') {
      // await cancelBookingFlow(reservation.reservation_id);
      return reply.code(200).send({ ok: true, action: 'cancelled' });
    }

    // Persist normalized booking, then enqueue workflow
    // const booking = await persistBooking({...});
    // await queue.add('new-booking', { bookingId: booking.id });

    req.log.info({ reservationId: reservation.reservation_id }, 'Booking received');
    return reply.code(200).send({ ok: true });
  });
};
