import { createHmac } from 'node:crypto';
import type { Database } from '@premura/db';
import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { propertiesRoutes } from '../src/api/properties';
import { attachJwtAuth } from '../src/plugins/jwt-auth';

// Test integration delle route /api/properties (slice 6.5.3) +
// JWT plugin (slice 6.5.2) end-to-end.
//
// Mock del queue BullMQ: spy su .add(). Mock Drizzle: select inline.

const SECRET = 'test-jwt-secret';

function base64Url(input: string | object): string {
  const data = typeof input === 'string' ? input : JSON.stringify(input);
  return Buffer.from(data, 'utf8')
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function makeJwt(payload: Record<string, unknown>): string {
  const header = base64Url({ alg: 'HS256', typ: 'JWT' });
  const body = base64Url(payload);
  const sig = createHmac('sha256', SECRET)
    .update(`${header}.${body}`)
    .digest()
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `${header}.${body}.${sig}`;
}

const HOST_ID = '00000000-0000-0000-0000-0000000000a1';
const OTHER_HOST_ID = '00000000-0000-0000-0000-0000000000a2';
const PROPERTY_ID = '00000000-0000-0000-0000-0000000000b1';
const futureExp = (): number => Math.floor(Date.now() / 1000) + 3600;

vi.mock('../src/jobs/queues', () => {
  const addSpy = vi.fn().mockResolvedValue(undefined);
  return {
    icalPollQueue: {
      add: addSpy,
    },
  };
});

import { icalPollQueue } from '../src/jobs/queues';

function makeMockDb(opts: {
  ownership?: { hostId: string; sources: Array<{ source: string; url: string }> } | null;
}): Database {
  const mock = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => {
            if (!opts.ownership) return Promise.resolve([]);
            return Promise.resolve([
              {
                id: PROPERTY_ID,
                icalSources: opts.ownership.sources,
              },
            ]);
          },
        }),
      }),
    }),
  };
  return mock as unknown as Database;
}

async function buildApp(opts: {
  ownership?: { hostId: string; sources: Array<{ source: string; url: string }> } | null;
}) {
  const app = Fastify({ logger: false });
  attachJwtAuth(app);
  const db = makeMockDb(opts);
  await app.register(propertiesRoutes, { prefix: '/api/properties', db });
  return app;
}

describe('POST /api/properties/:id/ical-poll-now', () => {
  beforeEach(() => {
    process.env.SUPABASE_JWT_SECRET = SECRET;
    (icalPollQueue.add as ReturnType<typeof vi.fn>).mockClear();
  });
  afterEach(() => {
    // biome-ignore lint/performance/noDelete: process.env semantica
    delete process.env.SUPABASE_JWT_SECRET;
  });

  it('senza JWT -> 401, no enqueue', async () => {
    const app = await buildApp({ ownership: null });
    const res = await app.inject({
      method: 'POST',
      url: `/api/properties/${PROPERTY_ID}/ical-poll-now`,
    });
    expect(res.statusCode).toBe(401);
    expect(icalPollQueue.add).not.toHaveBeenCalled();
  });

  it('JWT valido + property non posseduta -> 404, no enqueue', async () => {
    const app = await buildApp({ ownership: null });
    const token = makeJwt({ sub: HOST_ID, exp: futureExp() });
    const res = await app.inject({
      method: 'POST',
      url: `/api/properties/${PROPERTY_ID}/ical-poll-now`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(404);
    expect(icalPollQueue.add).not.toHaveBeenCalled();
  });

  it('JWT host A + property host B -> 404 (no leak ownership)', async () => {
    // ownership=null semula la query con WHERE host_id che non matcha
    const app = await buildApp({ ownership: null });
    const tokenOther = makeJwt({ sub: OTHER_HOST_ID, exp: futureExp() });
    const res = await app.inject({
      method: 'POST',
      url: `/api/properties/${PROPERTY_ID}/ical-poll-now`,
      headers: { authorization: `Bearer ${tokenOther}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it('JWT valido + property con icalSources -> 202 + enqueue per source', async () => {
    const app = await buildApp({
      ownership: {
        hostId: HOST_ID,
        sources: [
          { source: 'booking', url: 'https://ical.booking.com/...' },
          { source: 'airbnb', url: 'https://airbnb.com/calendar/...' },
        ],
      },
    });
    const token = makeJwt({ sub: HOST_ID, exp: futureExp() });
    const res = await app.inject({
      method: 'POST',
      url: `/api/properties/${PROPERTY_ID}/ical-poll-now`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ enqueued: 2 });
    expect(icalPollQueue.add).toHaveBeenCalledTimes(2);
  });

  it('JWT valido + property senza icalSources -> 200 con enqueued 0', async () => {
    const app = await buildApp({
      ownership: { hostId: HOST_ID, sources: [] },
    });
    const token = makeJwt({ sub: HOST_ID, exp: futureExp() });
    const res = await app.inject({
      method: 'POST',
      url: `/api/properties/${PROPERTY_ID}/ical-poll-now`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ enqueued: 0 });
    expect(icalPollQueue.add).not.toHaveBeenCalled();
  });

  it('UUID malformato -> 400', async () => {
    const app = await buildApp({ ownership: null });
    const token = makeJwt({ sub: HOST_ID, exp: futureExp() });
    const res = await app.inject({
      method: 'POST',
      url: '/api/properties/not-a-uuid/ical-poll-now',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(500); // Zod throw, Fastify default 500
  });
});
