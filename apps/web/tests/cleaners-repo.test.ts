import type { Database } from '@premura/db';
import { describe, expect, it, vi } from 'vitest';
import {
  countActiveCleanersForHost,
  listPropertiesForCleaner,
} from '../lib/repositories/cleaners';

// Slice F — Test repository cleaners (mock DB chain).

describe('countActiveCleanersForHost', () => {
  function makeDb(count: number): Database {
    const limit = () =>
      Promise.resolve(count > 0 ? [{ count }] : [{ count: 0 }]);
    const where = () => ({ limit });
    return {
      select: () => ({
        from: () => ({
          where,
        }),
      }),
    } as unknown as Database;
  }

  it('ritorna count cleaners attive', async () => {
    const dbMock: Database = {
      select: vi.fn(() => ({
        from: () => ({
          where: () =>
            Promise.resolve([{ count: 3 }]),
        }),
      })),
    } as unknown as Database;
    const n = await countActiveCleanersForHost(dbMock, 'host-uuid');
    expect(n).toBe(3);
  });

  it('ritorna 0 se nessuna cleaner', async () => {
    const dbMock: Database = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([{ count: 0 }]),
        }),
      }),
    } as unknown as Database;
    const n = await countActiveCleanersForHost(dbMock, 'host-uuid');
    expect(n).toBe(0);
  });

  it('ritorna 0 se row mancante', async () => {
    const dbMock: Database = {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([]),
        }),
      }),
    } as unknown as Database;
    const n = await countActiveCleanersForHost(dbMock, 'host-uuid');
    expect(n).toBe(0);
  });
});

describe('listPropertiesForCleaner', () => {
  it('ritorna properties assegnate ordinate per name', async () => {
    const rows = [
      { id: 'p1', name: 'Alfa', addressLine: 'via 1' },
      { id: 'p2', name: 'Beta', addressLine: null },
    ];
    const dbMock: Database = {
      select: () => ({
        from: () => ({
          where: () => ({
            orderBy: () => Promise.resolve(rows),
          }),
        }),
      }),
    } as unknown as Database;
    const out = await listPropertiesForCleaner(dbMock, 'cleaner-uuid', 'host-uuid');
    expect(out).toEqual(rows);
  });

  it('ritorna array vuoto se nessuna assegnazione', async () => {
    const dbMock: Database = {
      select: () => ({
        from: () => ({
          where: () => ({
            orderBy: () => Promise.resolve([]),
          }),
        }),
      }),
    } as unknown as Database;
    const out = await listPropertiesForCleaner(dbMock, 'cleaner-uuid', 'host-uuid');
    expect(out).toEqual([]);
  });
});
