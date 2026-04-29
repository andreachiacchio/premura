import { describe, it, expect } from 'vitest';
import type { VEvent } from 'node-ical';
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
    summary: 'CLOSED - Not available',
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
    const shell = mapIcalEventToBookingShell(
      makeVEvent({ start, end }),
      PROPERTY_ID,
      'booking',
    );
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
