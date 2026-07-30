import type { VEvent } from 'node-ical';
import { describe, expect, it } from 'vitest';
import { mapIcalEventToBookingShell } from '../src/jobs/ical-event-mapper';

// Test del mapper VEVENT -> IcalBookingShell. Pure unit, niente I/O ne DB.
// I VEvent sono mock inline castati a VEvent: il tipo node-ical ha molti
// campi opzionali che non servono al mapper, quindi il cast `as unknown as
// VEvent` evita rumore di compilazione.

const PROPERTY_ID = '11111111-1111-1111-1111-111111111111';

function makeVEvent(overrides: Partial<VEvent> = {}): VEvent {
  return {
    type: 'VEVENT',
    uid: 'a90207a6098fea365fa0d9ebc4af632d@booking.com',
    start: new Date('2026-05-01T15:00:00Z'),
    end: new Date('2026-05-04T11:00:00Z'),
    // Summary neutra: dal 30/07 le summary di blocco ("CLOSED - Not
    // available", "(Not available)") vengono FILTRATE dal mapper — i
    // casi blocco hanno i loro test dedicati in fondo al file.
    summary: 'Reserved',
    ...overrides,
  } as unknown as VEvent;
}

describe('mapIcalEventToBookingShell - VEVENT validi', () => {
  it('source booking -> shell completa con dataSource=booking_ical_only e guestFullName="Booking Guest"', () => {
    const shell = mapIcalEventToBookingShell(makeVEvent(), PROPERTY_ID, 'booking');

    expect(shell).not.toBeNull();
    expect(shell).toMatchObject({
      propertyId: PROPERTY_ID,
      platform: 'booking',
      platformBookingRef: 'a90207a6098fea365fa0d9ebc4af632d@booking.com',
      bookingExternalCode: null,
      guestFullName: 'Booking Guest',
      numGuests: 1,
      numAdults: 1,
      numChildren: 0,
      status: 'confirmed',
      dataSource: 'booking_ical_only',
    });
  });

  it('source airbnb -> shell con dataSource=airbnb_ical_only e guestFullName="Reserved"', () => {
    const shell = mapIcalEventToBookingShell(
      makeVEvent({ uid: 'abc-123-airbnb-uid@airbnb.com' }),
      PROPERTY_ID,
      'airbnb',
    );

    expect(shell).not.toBeNull();
    expect(shell?.platform).toBe('airbnb');
    expect(shell?.guestFullName).toBe('Reserved');
    expect(shell?.dataSource).toBe('airbnb_ical_only');
    expect(shell?.platformBookingRef).toBe('abc-123-airbnb-uid@airbnb.com');
  });

  it('nights = giorni interi tra checkin e checkout (3 notti)', () => {
    const shell = mapIcalEventToBookingShell(makeVEvent(), PROPERTY_ID, 'booking');
    // 2026-05-01 15:00 UTC -> 2026-05-04 11:00 UTC = 2g 20h ~ 2.83 giorni -> round 3
    expect(shell?.nights).toBe(3);
  });

  it('nights = 7 per stay di una settimana', () => {
    const shell = mapIcalEventToBookingShell(
      makeVEvent({
        start: new Date('2026-06-01T15:00:00Z'),
        end: new Date('2026-06-08T11:00:00Z'),
      }),
      PROPERTY_ID,
      'booking',
    );
    expect(shell?.nights).toBe(7);
  });

  it('preserva checkinAt e checkoutAt come Date object', () => {
    const start = new Date('2026-07-15T16:00:00Z');
    const end = new Date('2026-07-17T10:00:00Z');
    const shell = mapIcalEventToBookingShell(makeVEvent({ start, end }), PROPERTY_ID, 'booking');
    expect(shell?.checkinAt).toEqual(start);
    expect(shell?.checkoutAt).toEqual(end);
  });
});

describe('mapIcalEventToBookingShell - skip cases (return null)', () => {
  it('non-VEVENT (VTIMEZONE) -> null senza warn', () => {
    const tz = makeVEvent({ type: 'VTIMEZONE' as VEvent['type'] });
    expect(mapIcalEventToBookingShell(tz, PROPERTY_ID, 'booking')).toBeNull();
  });

  it('UID mancante -> null', () => {
    const event = makeVEvent({ uid: undefined as unknown as string });
    expect(mapIcalEventToBookingShell(event, PROPERTY_ID, 'booking')).toBeNull();
  });

  it('UID stringa vuota -> null (cade nel ramo !event.uid)', () => {
    const event = makeVEvent({ uid: '' });
    expect(mapIcalEventToBookingShell(event, PROPERTY_ID, 'booking')).toBeNull();
  });

  it('start mancante -> null', () => {
    const event = makeVEvent({ start: undefined as unknown as VEvent['start'] });
    expect(mapIcalEventToBookingShell(event, PROPERTY_ID, 'booking')).toBeNull();
  });

  it('end mancante -> null', () => {
    const event = makeVEvent({ end: undefined as unknown as VEvent['end'] });
    expect(mapIcalEventToBookingShell(event, PROPERTY_ID, 'booking')).toBeNull();
  });
});

import { describe as describeBlocks, expect as expectBlocks, it as itBlocks } from 'vitest';
// Bug 30/07: blocchi calendario importati come prenotazioni. Booking
// esporta OGNI fascia occupata come "CLOSED - Not available" (mai un
// ospite via iCal); Airbnb distingue "Reserved" dai blocchi. Il mapper
// deve filtrare i blocchi in ingresso.
import {
  isCalendarBlockSummary,
  mapIcalEventToBookingShell as mapForBlocks,
} from '../src/jobs/ical-event-mapper';

describeBlocks('filtro blocchi calendario', () => {
  itBlocks('riconosce le summary di blocco di Booking e Airbnb', () => {
    expectBlocks(isCalendarBlockSummary('CLOSED - Not available')).toBe(true);
    expectBlocks(isCalendarBlockSummary('Airbnb (Not available)')).toBe(true);
    expectBlocks(isCalendarBlockSummary('Blocked')).toBe(true);
    expectBlocks(isCalendarBlockSummary('Reserved')).toBe(false);
    expectBlocks(isCalendarBlockSummary('Mario Rossi')).toBe(false);
    expectBlocks(isCalendarBlockSummary(undefined)).toBe(false);
  });

  itBlocks('un VEVENT di blocco non diventa una prenotazione', () => {
    const shell = mapForBlocks(
      {
        type: 'VEVENT',
        uid: 'b11dc36aa9ab73e9466a854d6360d3c0@booking.com',
        summary: 'CLOSED - Not available',
        start: new Date('2027-07-31'),
        end: new Date('2028-01-30'),
        // biome-ignore lint/suspicious/noExplicitAny: fixture VEvent minima
      } as any,
      'prop-1',
      'booking',
    );
    expectBlocks(shell).toBeNull();
  });

  itBlocks('un Reserved Airbnb resta una prenotazione', () => {
    const shell = mapForBlocks(
      {
        type: 'VEVENT',
        uid: 'x@airbnb.com',
        summary: 'Reserved',
        start: new Date('2026-09-16'),
        end: new Date('2026-09-19'),
        // biome-ignore lint/suspicious/noExplicitAny: fixture VEvent minima
      } as any,
      'prop-1',
      'airbnb',
    );
    expectBlocks(shell?.guestFullName).toBe('Reserved');
  });
});
