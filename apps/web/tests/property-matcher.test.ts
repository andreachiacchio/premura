import { describe, it, expect, vi } from 'vitest';
import { matchProperty, _internals } from '../lib/property-matcher';
import type { Database } from '@premura/db';

// Test del property-matcher con DB mockato (nessun Postgres reale).
// I test integration con DB veri li facciamo nell'orchestrator.

function mockDb(rows: Array<{ id: string; name: string }>): Database {
  // Drizzle chain: db.select(...).from(...).where(...) → Promise<rows[]>.
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn(async () => rows),
  };
  return {
    select: vi.fn(() => chain),
  } as unknown as Database;
}

describe('matchProperty', () => {
  it('exact match: "La Goccia" stesso nome → confidence 1.0', async () => {
    const db = mockDb([
      { id: 'uuid-1', name: 'La Goccia' },
      { id: 'uuid-2', name: 'Villa Cristina' },
    ]);
    const got = await matchProperty(db, 'host-1', 'La Goccia');
    expect(got).not.toBeNull();
    expect(got!.propertyId).toBe('uuid-1');
    expect(got!.confidence).toBeCloseTo(1.0, 2);
  });

  it('fuzzy match Airbnb format: "[Jacuzzi - Centro Storico] La goccia di S.Gennaro" → "La Goccia"', async () => {
    const db = mockDb([
      { id: 'uuid-1', name: 'La Goccia' },
      { id: 'uuid-2', name: 'La Napoli Sotterranea' },
      { id: 'uuid-3', name: 'Villa Cristina' },
    ]);
    const emailName = '[Jacuzzi - Centro Storico] La goccia di S.Gennaro';
    const got = await matchProperty(db, 'host-1', emailName);
    expect(got).not.toBeNull();
    expect(got!.propertyId).toBe('uuid-1');
    // Substring boost: "la goccia" è dentro il nome email → score ≥ 0.5
    expect(got!.confidence).toBeGreaterThanOrEqual(0.5);
  });

  it('no match: nome email completamente diverso → null', async () => {
    const db = mockDb([
      { id: 'uuid-1', name: 'La Goccia' },
      { id: 'uuid-2', name: 'Villa Cristina' },
    ]);
    const got = await matchProperty(db, 'host-1', 'Apartamento Madrid Centro');
    expect(got).toBeNull();
  });

  it('host senza property → null', async () => {
    const db = mockDb([]);
    const got = await matchProperty(db, 'host-no-property', 'qualunque nome');
    expect(got).toBeNull();
  });

  it('emailPropertyName vuoto/whitespace → null senza query DB', async () => {
    const db = mockDb([{ id: 'uuid-1', name: 'La Goccia' }]);
    expect(await matchProperty(db, 'host-1', '')).toBeNull();
    expect(await matchProperty(db, 'host-1', '   ')).toBeNull();
  });

  it('threshold custom alto disabilita match weak', async () => {
    const db = mockDb([{ id: 'uuid-1', name: 'La Goccia' }]);
    // "Goc" è troppo corto per match alto → confidence bassa, threshold 0.95 → null.
    const got = await matchProperty(db, 'host-1', 'Goc', { threshold: 0.95 });
    expect(got).toBeNull();
  });

  it('normalize stripa accenti e punteggiatura', () => {
    expect(_internals.normalize('La Góccia di S.Gennaro')).toBe('la goccia di s gennaro');
    expect(_internals.normalize('Villa-Crístina (Praiano)')).toBe('villa cristina praiano');
  });
});
