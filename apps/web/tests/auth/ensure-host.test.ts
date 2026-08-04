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
  const executed: unknown[] = [];
  let selectCount = 0;
  const db = {
    execute: (q: unknown) => {
      executed.push(q);
      return Promise.resolve([]);
    },
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
  return { db, inserted, updated, executed };
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

  it('email di una riga COLLEGATA ad altro utente -> host NUOVO, mai takeover', async () => {
    // Sicurezza (ordine Andrea 04/08): chi si registra con l'email di
    // un host esistente NON deve prenderne l'account. La riga altrui
    // non viene mai ricollegata; si riallinea solo la sua email stale
    // (via SQL con auth.users) e si crea un host nuovo.
    const { db, inserted, updated, executed } = makeDb({
      byAuthId: [],
      byEmail: [
        {
          id: 'host-altrui',
          authUserId: 'altro-utente',
          onboardingCompleted: true,
          onboardingStep: 'completed',
        },
      ],
      afterInsert: [{ id: 'host-nuovo', onboardingCompleted: false, onboardingStep: 'welcome' }],
    });
    const got = await ensureHostForAuthUser(db, USER);
    expect(got.id).toBe('host-nuovo');
    // La riga altrui non e' MAI stata ricollegata via update Drizzle.
    expect(updated.length).toBe(0);
    // Il riallineamento email stale e' partito (raw SQL su auth.users).
    expect(executed.length).toBe(1);
    // E l'host nuovo appartiene all'utente che ha fatto login.
    expect(inserted[0]).toMatchObject({ authUserId: 'auth-user-1', email: 'nuovo@esempio.it' });
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
