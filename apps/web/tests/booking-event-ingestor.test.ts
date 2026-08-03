import type { ServerClient } from '@premura/db';
import { describe, expect, it } from 'vitest';
import type { ClassifiedBookingEmail } from '../lib/booking-email-classifier';
import { ingestBookingEvent } from '../lib/booking-event-ingestor';

// Blocco 3 (03/08) — unit test del match in due passi (codice → data)
// e della promozione. Fake db posizionale: la PRIMA select del flusso e'
// sempre la lookup per codice, la SECONDA (se arriva) quella per data.
// Fixture: subject reali di aprile (booking_email_events).

type Captured = { table: string; values: Record<string, unknown> };

function makeDb(opts: {
  codeMatches?: Array<{ id: string }>;
  dateMatches?: Array<{ id: string }>;
}) {
  const updates: Captured[] = [];
  const auditRows: Array<Record<string, unknown>> = [];
  let selectCount = 0;
  const db = {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          where: () => ({
            limit: () => {
              selectCount++;
              if (selectCount === 1) return Promise.resolve(opts.codeMatches ?? []);
              return Promise.resolve(opts.dateMatches ?? []);
            },
          }),
        }),
      }),
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: () => {
          updates.push({ table: 'bookings', values });
          return Promise.resolve();
        },
      }),
    }),
    insert: () => ({
      values: (values: Record<string, unknown>) => ({
        onConflictDoNothing: () => ({
          returning: () => {
            auditRows.push(values);
            return Promise.resolve([{ id: 'evt-1' }]);
          },
        }),
      }),
    }),
  };
  return { serverClient: { db } as unknown as Pick<ServerClient, 'db'>, updates, auditRows };
}

function classified(
  eventType: ClassifiedBookingEmail['eventType'],
  code: string | null,
  checkinDateIso: string | null,
): ClassifiedBookingEmail {
  return {
    eventType,
    bookingExternalCode: code,
    checkinDateIso,
    rawSubject: `Booking.com - test (${code ?? ''}, ${checkinDateIso ?? ''})`,
  };
}

const BASE = {
  hostId: 'host-1',
  emailId: 'gmail-msg-1',
  emailReceivedAt: new Date('2026-04-26T15:15:39Z'),
};

describe('ingestBookingEvent — match per data e promozione', () => {
  it('cancellazione con match unico per data -> cancelled + codice timbrato + flag 2-poll azzerati', async () => {
    const { serverClient, updates, auditRows } = makeDb({
      codeMatches: [],
      dateMatches: [{ id: 'b-goccia' }],
    });
    const r = await ingestBookingEvent(serverClient, {
      ...BASE,
      classified: classified('cancellation', '5009228445', '2026-04-18'),
    });

    expect(r.status).toBe('updated');
    expect(r.bookingId).toBe('b-goccia');
    expect(updates.length).toBe(1);
    const set = updates[0]!.values;
    expect(set.status).toBe('cancelled');
    expect(set.bookingExternalCode).toBe('5009228445');
    expect(set.possibleCancellationAt).toBeNull();
    expect(set.feedMissingCount).toBe(0);
    expect(auditRows[0]!.ingestionStatus).toBe('matched');
    expect(String(auditRows[0]!.ingestionReason)).toContain('matched_by_date');
  });

  it('nuova prenotazione con match per data -> codice timbrato (promozione), status intatto', async () => {
    const { serverClient, updates } = makeDb({
      codeMatches: [],
      dateMatches: [{ id: 'b-1' }],
    });
    const r = await ingestBookingEvent(serverClient, {
      ...BASE,
      classified: classified('new_booking', '5575765766', '2027-07-15'),
    });
    expect(r.status).toBe('updated');
    const set = updates[0]!.values;
    expect(set.bookingExternalCode).toBe('5575765766');
    expect(set.status).toBeUndefined();
  });

  it('match per data AMBIGUO (2 fasce stesso check-in) -> unmatched esplicito, nessun update', async () => {
    const { serverClient, updates, auditRows } = makeDb({
      codeMatches: [],
      dateMatches: [{ id: 'b-1' }, { id: 'b-2' }],
    });
    const r = await ingestBookingEvent(serverClient, {
      ...BASE,
      classified: classified('new_booking', '111', '2026-08-20'),
    });
    expect(r.status).toBe('unmatched');
    expect(r.reason).toContain('ambiguo: 2');
    expect(updates.length).toBe(0);
    expect(auditRows[0]!.ingestionStatus).toBe('unmatched');
  });

  it('nessuna candidata (ne codice ne data) -> unmatched "iCal not yet polled"', async () => {
    const { serverClient, updates } = makeDb({ codeMatches: [], dateMatches: [] });
    const r = await ingestBookingEvent(serverClient, {
      ...BASE,
      classified: classified('cancellation', '999', '2026-12-01'),
    });
    expect(r.status).toBe('unmatched');
    expect(r.reason).toBe('iCal not yet polled');
    expect(updates.length).toBe(0);
  });

  it('codice gia timbrato -> match diretto per codice, lookup per data mai eseguita', async () => {
    const { serverClient, updates, auditRows } = makeDb({
      codeMatches: [{ id: 'b-noto' }],
      // dateMatches volutamente ambiguo: se venisse consultato, il test
      // fallirebbe con unmatched.
      dateMatches: [{ id: 'x' }, { id: 'y' }],
    });
    const r = await ingestBookingEvent(serverClient, {
      ...BASE,
      classified: classified('new_booking', '5009228445', '2026-04-18'),
    });
    expect(r.status).toBe('updated');
    expect(updates.length).toBe(1);
    expect(String(auditRows[0]!.ingestionReason)).toContain('matched_by_code');
  });

  it('senza data nel subject e senza match per codice -> unmatched, niente lookup per data', async () => {
    const { serverClient } = makeDb({ codeMatches: [], dateMatches: [{ id: 'trappola' }] });
    const r = await ingestBookingEvent(serverClient, {
      ...BASE,
      classified: classified('new_booking', '777', null),
    });
    // dateMatches avrebbe matchato: se il risultato e' unmatched la
    // lookup per data non e' stata consultata (comportamento voluto).
    expect(r.status).toBe('unmatched');
  });
});
