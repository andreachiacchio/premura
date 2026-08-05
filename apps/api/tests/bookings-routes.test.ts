import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import type { Database } from '@premura/db';
import { bookingsRoutes } from '../src/api/bookings';

// Test unit per le routes M2a.4 (complete-manual + skip-completion).
// Niente DB reale: mock Drizzle inline che espone solo i metodi usati dalle
// route (select.from.where.limit, update.set.where). Pattern Fastify .inject()
// per testare le route senza HTTP server.
//
// triggerWorkflow viene iniettato come spy per evitare di chiamare il vero
// onNewBooking (loadBookingFull e' uno stub che throw "Not implemented").

const BOOKING_ID = '00000000-0000-4000-8000-000000000001';

type SelectRow = { id: string; dataSource: string; premuraActiveAt?: Date | null };

// Fabbrica del mock db. selectRows determina cosa ritorna la prima query
// (lookup booking by id): array vuoto -> 404, una riga -> match. Lo spy
// updateValuesSpy ci permette di asserire i valori passati a .set(...).
function makeMockDb(opts: { selectRows?: SelectRow[] } = {}): {
  db: Database;
  updateValuesSpy: ReturnType<typeof vi.fn>;
} {
  const selectRows = opts.selectRows ?? [];
  const updateValuesSpy = vi.fn();

  const mock = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve(selectRows),
        }),
      }),
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => {
        updateValuesSpy(values);
        return {
          where: () => Promise.resolve(),
        };
      },
    }),
  };

  return { db: mock as unknown as Database, updateValuesSpy };
}

async function buildApp(opts: {
  selectRows?: SelectRow[];
  triggerWorkflow?: (bookingId: string) => Promise<void> | void;
}): Promise<{
  app: ReturnType<typeof Fastify>;
  updateValuesSpy: ReturnType<typeof vi.fn>;
  triggerSpy: ReturnType<typeof vi.fn>;
}> {
  const { db, updateValuesSpy } = makeMockDb({ selectRows: opts.selectRows });
  const triggerSpy = vi.fn(opts.triggerWorkflow ?? (() => Promise.resolve()));
  const app = Fastify({ logger: false });
  await app.register(bookingsRoutes, {
    prefix: '/api/bookings',
    db,
    triggerWorkflow: triggerSpy,
  });
  return { app, updateValuesSpy, triggerSpy };
}

describe('POST /api/bookings/:id/complete-manual', () => {
  it('booking incomplete (booking_ical_only) -> 200, dataSource booking_manual_filled, trigger chiamato 1 volta', async () => {
    const { app, updateValuesSpy, triggerSpy } = await buildApp({
      selectRows: [{ id: BOOKING_ID, dataSource: 'booking_ical_only' }],
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/bookings/${BOOKING_ID}/complete-manual`,
      payload: {
        guestFullName: 'Mario Rossi',
        guestPhone: '+393331234567',
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      success: true,
      bookingId: BOOKING_ID,
      dataSource: 'booking_manual_filled',
    });

    expect(updateValuesSpy).toHaveBeenCalledOnce();
    const updateValues = updateValuesSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(updateValues).toMatchObject({
      guestFullName: 'Mario Rossi',
      guestPhone: '+393331234567',
      guestLanguage: 'it',
      numGuests: 1,
      dataSource: 'booking_manual_filled',
    });

    // Lascio risolvere la microtask del fire-and-forget prima di asserire.
    await new Promise((resolve) => setImmediate(resolve));
    expect(triggerSpy).toHaveBeenCalledOnce();
    expect(triggerSpy).toHaveBeenCalledWith(BOOKING_ID);

    await app.close();
  });

  it('booking RICH (booking_manual_filled) -> 400 booking_not_incomplete', async () => {
    const { app, updateValuesSpy, triggerSpy } = await buildApp({
      selectRows: [{ id: BOOKING_ID, dataSource: 'booking_manual_filled' }],
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/bookings/${BOOKING_ID}/complete-manual`,
      payload: {
        guestFullName: 'Mario Rossi',
        guestPhone: '+393331234567',
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      error: 'booking_not_incomplete',
      message: 'booking is not in incomplete state',
    });
    expect(updateValuesSpy).not.toHaveBeenCalled();
    expect(triggerSpy).not.toHaveBeenCalled();

    await app.close();
  });

  it('booking inesistente -> 404 booking_not_found', async () => {
    const { app, updateValuesSpy, triggerSpy } = await buildApp({
      selectRows: [],
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/bookings/${BOOKING_ID}/complete-manual`,
      payload: {
        guestFullName: 'Mario Rossi',
        guestPhone: '+393331234567',
      },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: 'booking_not_found' });
    expect(updateValuesSpy).not.toHaveBeenCalled();
    expect(triggerSpy).not.toHaveBeenCalled();

    await app.close();
  });

  it('guestFullName vuoto -> 400 invalid_body (zod)', async () => {
    const { app, updateValuesSpy, triggerSpy } = await buildApp({
      selectRows: [{ id: BOOKING_ID, dataSource: 'booking_ical_only' }],
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/bookings/${BOOKING_ID}/complete-manual`,
      payload: {
        guestFullName: '   ',
        guestPhone: '+393331234567',
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'invalid_body' });
    expect(updateValuesSpy).not.toHaveBeenCalled();
    expect(triggerSpy).not.toHaveBeenCalled();

    await app.close();
  });

  it('guestPhone < 8 char -> 400 invalid_body (zod)', async () => {
    const { app, updateValuesSpy, triggerSpy } = await buildApp({
      selectRows: [{ id: BOOKING_ID, dataSource: 'booking_ical_only' }],
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/bookings/${BOOKING_ID}/complete-manual`,
      payload: {
        guestFullName: 'Mario Rossi',
        guestPhone: '12345',
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'invalid_body' });
    expect(updateValuesSpy).not.toHaveBeenCalled();
    expect(triggerSpy).not.toHaveBeenCalled();

    await app.close();
  });
});

describe('POST /api/bookings/:id/skip-completion', () => {
  it('booking incomplete -> 200 e hostSkippedCompletion=true nello UPDATE', async () => {
    const { app, updateValuesSpy } = await buildApp({
      selectRows: [{ id: BOOKING_ID, dataSource: 'booking_ical_only' }],
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/bookings/${BOOKING_ID}/skip-completion`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ success: true, bookingId: BOOKING_ID });

    expect(updateValuesSpy).toHaveBeenCalledOnce();
    const updateValues = updateValuesSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(updateValues).toMatchObject({ hostSkippedCompletion: true });

    await app.close();
  });

  it('booking RICH -> 400 booking_not_incomplete', async () => {
    const { app, updateValuesSpy } = await buildApp({
      selectRows: [{ id: BOOKING_ID, dataSource: 'airbnb_email_parsed' }],
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/bookings/${BOOKING_ID}/skip-completion`,
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'booking_not_incomplete' });
    expect(updateValuesSpy).not.toHaveBeenCalled();

    await app.close();
  });
});

// 05/08 — premura_active_at e' il gate di guest-app-invite-cron e
// booking-welcome-cron. Questo percorso scriveva il telefono ma non
// attivava: l'host compilava il form, la riga diventava completa, e
// l'agente non la raccoglieva mai. Questi test lo inchiodano.
describe('complete-manual: attivazione Premura', () => {
  it('attiva Premura quando la riga non era ancora attiva', async () => {
    const { app, updateValuesSpy } = await buildApp({
      selectRows: [{ id: BOOKING_ID, dataSource: 'booking_ical_only', premuraActiveAt: null }],
    });
    const res = await app.inject({
      method: 'POST',
      url: `/api/bookings/${BOOKING_ID}/complete-manual`,
      payload: { guestFullName: 'Giulia Rossi', guestPhone: '+393331234567' },
    });
    expect(res.statusCode).toBe(200);
    const values = updateValuesSpy.mock.calls[0]?.[0] ?? {};
    expect(values).toHaveProperty('premuraActiveAt');
    expect(values.guestPhoneSource).toBe('manual');
    await app.close();
  });

  it('NON riattiva una riga esclusa di proposito', async () => {
    const { app, updateValuesSpy } = await buildApp({
      selectRows: [
        {
          id: BOOKING_ID,
          dataSource: 'booking_ical_only',
          premuraActiveAt: new Date('2026-08-01T10:00:00Z'),
        },
      ],
    });
    const res = await app.inject({
      method: 'POST',
      url: `/api/bookings/${BOOKING_ID}/complete-manual`,
      payload: { guestFullName: 'Giulia Rossi', guestPhone: '+393331234567' },
    });
    expect(res.statusCode).toBe(200);
    const values = updateValuesSpy.mock.calls[0]?.[0] ?? {};
    expect(values).not.toHaveProperty('premuraActiveAt');
    await app.close();
  });
});
