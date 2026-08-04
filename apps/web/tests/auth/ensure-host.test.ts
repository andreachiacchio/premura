import type { Database } from '@premura/db';
import { describe, expect, it } from 'vitest';
import { ensureHostForAuthUser } from '../../lib/auth';

// Parte A (04/08): la riga hosts nasce al primo accesso, idempotente.
// Fake db posizionale: select 1 = lookup per auth_user_id, select 2 =
// lookup per email; insert/update catturati per assert.

type Row = Record<string, unknown>;

function makeDb(opts: {
  byAuthId?: Row[];
  byEmail?: Row[];
  afterInsert?: Row[];
}) {
  const inserted: Row[] = [];
  const updated: Row[] = [];
  let selectCount = 0;
  const db = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => {
            selectCount++;
            if (selectCount === 1) return Promise.resolve(opts.byAuthId ?? []);
            if (selectCount === 2) return Promise.resolve(opts.byEmail ?? []);
            return Promise.resolve(opts.afterInsert ?? []);
          },
        }),
      }),
    }),
    insert: () => ({
      values: (v: Row) => ({
        onConflictDoNothing: () => {
          inserted.push(v);
          return Promise.resolve();
        },
      }),
    }),
    update: () => ({
      set: (v: Row) => ({
        where: () => {
          updated.push(v);
          return Promise.resolve();
        },
      }),
    }),
  } as unknown as Database;
  return { db, inserted, updated };
}

const USER = {
  id: 'auth-user-1',
  email: 'Nuovo@Esempio.IT',
  user_metadata: { full_name: 'Nuovo Host' },
};

describe('ensureHostForAuthUser', () => {
  it('host gia collegato -> ritorna senza scrivere nulla', async () => {
    const { db, inserted, updated } = makeDb({
      byAuthId: [{ id: 'host-1', onboardingCompleted: true, onboardingStep: 'completed' }],
    });
    const got = await ensureHostForAuthUser(db, USER);
    expect(got.id).toBe('host-1');
    expect(inserted.length).toBe(0);
    expect(updated.length).toBe(0);
  });

  it('primo accesso -> INSERT con email normalizzata e full name dai metadata', async () => {
    const { db, inserted } = makeDb({
      byAuthId: [],
      byEmail: [],
      afterInsert: [{ id: 'host-nuovo', onboardingCompleted: false, onboardingStep: 'welcome' }],
    });
    const got = await ensureHostForAuthUser(db, USER);
    expect(got.id).toBe('host-nuovo');
    expect(got.onboardingCompleted).toBe(false);
    expect(inserted.length).toBe(1);
    expect(inserted[0]).toMatchObject({
      authUserId: 'auth-user-1',
      email: 'nuovo@esempio.it',
      fullName: 'Nuovo Host',
    });
  });

  it('riga con stessa email non collegata -> ADOZIONE (set auth_user_id), niente insert', async () => {
    const { db, inserted, updated } = makeDb({
      byAuthId: [],
      byEmail: [
        {
          id: 'host-storico',
          authUserId: null,
          onboardingCompleted: true,
          onboardingStep: 'completed',
        },
      ],
    });
    const got = await ensureHostForAuthUser(db, USER);
    expect(got.id).toBe('host-storico');
    expect(inserted.length).toBe(0);
    expect(updated).toEqual([{ authUserId: 'auth-user-1' }]);
  });

  it('email gia collegata a un ALTRO utente auth -> throw, mai sovrascrivere', async () => {
    const { db } = makeDb({
      byAuthId: [],
      byEmail: [
        {
          id: 'host-x',
          authUserId: 'altro-utente',
          onboardingCompleted: false,
          onboardingStep: 'welcome',
        },
      ],
    });
    await expect(ensureHostForAuthUser(db, USER)).rejects.toThrow('intervento manuale');
  });

  it('utente senza email -> throw (mai host anonimi)', async () => {
    const { db } = makeDb({ byAuthId: [] });
    await expect(
      ensureHostForAuthUser(db, { id: 'u', email: undefined, user_metadata: {} }),
    ).rejects.toThrow('senza email');
  });

  it('insert in corsa persa (ON CONFLICT DO NOTHING) -> rilegge e ritorna la riga vinta', async () => {
    const { db } = makeDb({
      byAuthId: [],
      byEmail: [],
      afterInsert: [{ id: 'host-concorrente', onboardingCompleted: false, onboardingStep: 'welcome' }],
    });
    const got = await ensureHostForAuthUser(db, USER);
    expect(got.id).toBe('host-concorrente');
  });
});
