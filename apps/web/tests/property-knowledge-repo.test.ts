import type { Database } from '@premura/db';
import { describe, expect, it } from 'vitest';
import {
  type PropertyKnowledgePatch,
  getPropertyKnowledge,
  isPropertyOwnedByHost,
  upsertPropertyKnowledge,
} from '../lib/repositories/property-knowledge';

// Test repo property_knowledge (slice 12) con Drizzle mock inline.
// Pattern stesso di altri repo unit test.

function makeMockDb(opts: {
  existing?: Record<string, unknown> | null;
  ownsProperty?: boolean;
}) {
  const inserts: Array<Record<string, unknown>> = [];
  const updates: Array<Record<string, unknown>> = [];
  let limitCount = 0;

  const mock = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => {
            limitCount++;
            if (limitCount === 1) {
              return Promise.resolve(opts.existing ? [opts.existing] : []);
            }
            // Second select (isPropertyOwnedByHost path).
            return Promise.resolve(opts.ownsProperty ? [{ id: 'p-1' }] : []);
          },
        }),
      }),
    }),
    insert: () => ({
      values: (vals: Record<string, unknown>) => {
        inserts.push(vals);
        return Promise.resolve();
      },
    }),
    update: () => ({
      set: (vals: Record<string, unknown>) => {
        updates.push(vals);
        return {
          where: () => ({
            returning: () => Promise.resolve(opts.existing ? [{ id: 'pk-1' }] : []),
          }),
        };
      },
    }),
  };

  return { db: mock as unknown as Database, inserts, updates };
}

describe('getPropertyKnowledge', () => {
  it('row inesistente -> null', async () => {
    const { db } = makeMockDb({ existing: null });
    const r = await getPropertyKnowledge(db, '00000000-0000-0000-0000-000000000001');
    expect(r).toBeNull();
  });

  it('row esistente -> view normalizzata', async () => {
    const now = new Date('2026-05-05T10:00:00Z');
    const { db } = makeMockDb({
      existing: {
        propertyId: 'prop-1',
        keybox: { code: '1234', instructions: 'sopra al campanello' },
        wifi: null,
        parking: null,
        houseRules: null,
        emergencyContacts: [],
        nearbyEssentials: [],
        additionalInfo: null,
        updatedAt: now,
      },
    });
    const r = await getPropertyKnowledge(db, 'prop-1');
    expect(r?.keybox?.code).toBe('1234');
    expect(r?.emergencyContacts).toEqual([]);
    expect(r?.updatedAt).toBe(now);
  });
});

describe('isPropertyOwnedByHost', () => {
  it('property posseduta -> true', async () => {
    // isPropertyOwnedByHost fa un solo select (e' la prima call).
    // Il mock al limitCount=1 ritorna `existing`. Settiamo existing
    // come row di properties (non null) per simulare ownership.
    const { db } = makeMockDb({ existing: { id: 'p-1' } });
    expect(await isPropertyOwnedByHost(db, 'prop-1', 'host-1')).toBe(true);
  });

  it('property non posseduta -> false', async () => {
    const { db } = makeMockDb({ existing: null });
    expect(await isPropertyOwnedByHost(db, 'prop-other', 'host-1')).toBe(false);
  });
});

describe('upsertPropertyKnowledge', () => {
  it('row esistente -> update con set values', async () => {
    const { db, updates, inserts } = makeMockDb({
      existing: { id: 'pk-1' },
    });
    const patch: PropertyKnowledgePatch = {
      keybox: { code: '5678' },
      wifi: { ssid: 'Premura', password: 'topsecret' },
    };
    const r = await upsertPropertyKnowledge(db, 'prop-1', 'host-1', patch);
    expect(r.inserted).toBe(false);
    expect(updates.length).toBe(1);
    const u = updates[0];
    expect(u?.keybox).toEqual({ code: '5678' });
    expect(u?.wifi).toEqual({ ssid: 'Premura', password: 'topsecret' });
    expect(u?.updatedBy).toBe('host-1');
    expect(inserts.length).toBe(0);
  });

  it('row inesistente -> insert', async () => {
    const { db, inserts } = makeMockDb({ existing: null });
    const patch: PropertyKnowledgePatch = {
      additionalInfo: 'Note iniziali',
    };
    const r = await upsertPropertyKnowledge(db, 'prop-1', 'host-1', patch);
    expect(r.inserted).toBe(true);
    expect(inserts.length).toBe(1);
    expect(inserts[0]?.additionalInfo).toBe('Note iniziali');
    expect(inserts[0]?.propertyId).toBe('prop-1');
    expect(inserts[0]?.emergencyContacts).toEqual([]);
  });

  it('patch parziale -> solo i campi del patch nel set', async () => {
    const { db, updates } = makeMockDb({ existing: { id: 'pk-1' } });
    await upsertPropertyKnowledge(db, 'prop-1', 'host-1', { keybox: { code: '99' } });
    const u = updates[0];
    expect(u?.keybox).toEqual({ code: '99' });
    expect(u?.wifi).toBeUndefined();
    expect(u?.parking).toBeUndefined();
  });

  it('patch con keybox=null -> set keybox null (clear)', async () => {
    const { db, updates } = makeMockDb({ existing: { id: 'pk-1' } });
    await upsertPropertyKnowledge(db, 'prop-1', 'host-1', { keybox: null });
    expect(updates[0]?.keybox).toBeNull();
  });
});
