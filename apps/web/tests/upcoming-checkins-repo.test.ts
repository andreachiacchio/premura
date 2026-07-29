import type { Database } from '@premura/db';
import { describe, expect, it } from 'vitest';
import {
  clearBookingGuestPhone,
  derivePremuraState,
  setBookingGuestPhone,
  setBookingPremuraActive,
} from '../lib/repositories/upcoming-checkins';

// Slice A — Test repository setBookingGuestPhone + clearBookingGuestPhone.
// Drizzle mock semplice: select pre-check ownership, poi update.

type MockState = {
  ownerHostId: string | null;
  currentPhone?: string | null;
  currentPremuraActiveAt: Date | null;
  currentAddedByHostId: string | null;
  updates: Array<Record<string, unknown>>;
};

function makeMockDb(state: MockState): Database {
  return {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          where: () => ({
            limit: () =>
              Promise.resolve(
                state.ownerHostId === null
                  ? []
                  : [
                      {
                        bookingId: 'b1',
                        ownerHostId: state.ownerHostId,
                        // Il mock serve sia setBookingGuestPhone sia
                        // setBookingPremuraActive: espone entrambe le viste.
                        currentPhone: state.currentPhone ?? null,
                        guestPhone: state.currentPhone ?? null,
                        premuraActiveAt: state.currentPremuraActiveAt,
                        currentPremuraActiveAt: state.currentPremuraActiveAt,
                        currentAddedByHostId: state.currentAddedByHostId,
                      },
                    ],
              ),
          }),
        }),
      }),
    }),
    update: () => ({
      set: (vals: Record<string, unknown>) => ({
        where: () => {
          state.updates.push(vals);
          return Promise.resolve();
        },
      }),
    }),
  } as unknown as Database;
}

describe('setBookingGuestPhone', () => {
  it('booking inesistente -> not_found', async () => {
    const state: MockState = {
      ownerHostId: null,
      currentPremuraActiveAt: null,
      currentAddedByHostId: null,
      updates: [],
    };
    const r = await setBookingGuestPhone(makeMockDb(state), 'b1', 'host-1', '+393331234567');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('not_found');
    expect(state.updates).toHaveLength(0);
  });

  it('booking di altro host -> wrong_host', async () => {
    const state: MockState = {
      ownerHostId: 'host-other',
      currentPremuraActiveAt: null,
      currentAddedByHostId: null,
      updates: [],
    };
    const r = await setBookingGuestPhone(makeMockDb(state), 'b1', 'host-1', '+393331234567');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('wrong_host');
    expect(state.updates).toHaveLength(0);
  });

  it('prima volta: setta guest_phone + premura_active_at + added_by_host_id', async () => {
    const state: MockState = {
      ownerHostId: 'host-1',
      currentPremuraActiveAt: null,
      currentAddedByHostId: null,
      updates: [],
    };
    const r = await setBookingGuestPhone(makeMockDb(state), 'b1', 'host-1', '+393331234567');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.bookingId).toBe('b1');
      expect(r.premuraActiveAt).toBeInstanceOf(Date);
    }
    expect(state.updates).toHaveLength(1);
    const u = state.updates[0] as Record<string, unknown>;
    expect(u.guestPhone).toBe('+393331234567');
    expect(u.premuraActiveAt).toBeInstanceOf(Date);
    expect(u.guestPhoneAddedByHostId).toBe('host-1');
    expect(u.guestPhoneSource).toBe('manual');
  });

  it('seconda volta (numero cambiato): preserva premura_active_at + added_by_host_id originali', async () => {
    const originalActiveAt = new Date('2026-05-01T10:00:00Z');
    const state: MockState = {
      ownerHostId: 'host-1',
      currentPremuraActiveAt: originalActiveAt,
      currentAddedByHostId: 'host-1',
      updates: [],
    };
    const r = await setBookingGuestPhone(makeMockDb(state), 'b1', 'host-1', '+393339999999');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.premuraActiveAt).toBe(originalActiveAt);
    const u = state.updates[0] as Record<string, unknown>;
    expect(u.premuraActiveAt).toBe(originalActiveAt);
    expect(u.guestPhoneAddedByHostId).toBe('host-1');
    expect(u.guestPhone).toBe('+393339999999');
  });
});

describe('clearBookingGuestPhone', () => {
  it('booking inesistente -> not_found', async () => {
    const state: MockState = {
      ownerHostId: null,
      currentPremuraActiveAt: null,
      currentAddedByHostId: null,
      updates: [],
    };
    const r = await clearBookingGuestPhone(makeMockDb(state), 'b1', 'host-1');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('not_found');
  });

  it('wrong host -> wrong_host', async () => {
    const state: MockState = {
      ownerHostId: 'host-other',
      currentPremuraActiveAt: new Date(),
      currentAddedByHostId: 'host-other',
      updates: [],
    };
    const r = await clearBookingGuestPhone(makeMockDb(state), 'b1', 'host-1');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('wrong_host');
  });

  it('happy: setta guest_phone + premura_active_at a null, lascia audit', async () => {
    const state: MockState = {
      ownerHostId: 'host-1',
      currentPremuraActiveAt: new Date(),
      currentAddedByHostId: 'host-1',
      updates: [],
    };
    const r = await clearBookingGuestPhone(makeMockDb(state), 'b1', 'host-1');
    expect(r.ok).toBe(true);
    const u = state.updates[0] as Record<string, unknown>;
    expect(u.guestPhone).toBeNull();
    expect(u.premuraActiveAt).toBeNull();
    expect(u.guestPhoneAddedByHostId).toBeUndefined();
    expect(u.guestPhoneSource).toBeUndefined();
  });
});

describe('setBookingGuestPhone su riga esclusa', () => {
  it('correggere il numero NON revoca l esclusione', async () => {
    // Riga esclusa = numero presente + premura_active_at NULL, per scelta
    // dell'host. Un fix del typo non deve riattivare l'agente di nascosto.
    const state: MockState = {
      ownerHostId: 'host-1',
      currentPhone: '+48730720125',
      currentPremuraActiveAt: null,
      currentAddedByHostId: 'host-1',
      updates: [],
    };
    const r = await setBookingGuestPhone(makeMockDb(state), 'b1', 'host-1', '+48730720126');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.premuraActiveAt).toBeNull();
    const u = state.updates[0] as Record<string, unknown>;
    expect(u.guestPhone).toBe('+48730720126');
    expect(u.premuraActiveAt).toBeNull();
  });
});

describe('setBookingPremuraActive', () => {
  it('esclude una riga attiva mantenendo il numero', async () => {
    const state: MockState = {
      ownerHostId: 'host-1',
      currentPhone: '+4748356805',
      currentPremuraActiveAt: new Date('2026-07-29T10:00:00Z'),
      currentAddedByHostId: 'host-1',
      updates: [],
    };
    const r = await setBookingPremuraActive(makeMockDb(state), 'b1', 'host-1', false);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.premuraActiveAt).toBeNull();
    const u = state.updates[0] as Record<string, unknown>;
    expect(u.premuraActiveAt).toBeNull();
    // Il numero non compare nell'update: escludere non e' cancellare.
    expect(u.guestPhone).toBeUndefined();
  });

  it('riattiva una riga esclusa', async () => {
    const state: MockState = {
      ownerHostId: 'host-1',
      currentPhone: '+4748356805',
      currentPremuraActiveAt: null,
      currentAddedByHostId: 'host-1',
      updates: [],
    };
    const r = await setBookingPremuraActive(makeMockDb(state), 'b1', 'host-1', true);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.premuraActiveAt).toBeInstanceOf(Date);
  });

  it('riattivare una riga gia attiva conserva il timestamp originale', async () => {
    const original = new Date('2026-07-01T08:00:00Z');
    const state: MockState = {
      ownerHostId: 'host-1',
      currentPhone: '+4748356805',
      currentPremuraActiveAt: original,
      currentAddedByHostId: 'host-1',
      updates: [],
    };
    const r = await setBookingPremuraActive(makeMockDb(state), 'b1', 'host-1', true);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.premuraActiveAt).toBe(original);
  });

  it('rifiuta di attivare senza numero', async () => {
    const state: MockState = {
      ownerHostId: 'host-1',
      currentPhone: null,
      currentPremuraActiveAt: null,
      currentAddedByHostId: null,
      updates: [],
    };
    const r = await setBookingPremuraActive(makeMockDb(state), 'b1', 'host-1', true);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('no_phone');
    expect(state.updates).toHaveLength(0);
  });
});

describe('derivePremuraState', () => {
  it('mappa le tre combinazioni', () => {
    expect(derivePremuraState(null, null)).toBe('missing_phone');
    expect(derivePremuraState(null, new Date())).toBe('missing_phone');
    expect(derivePremuraState('+39333', new Date())).toBe('active');
    expect(derivePremuraState('+39333', null)).toBe('excluded');
  });
});
