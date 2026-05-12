import { beforeEach, describe, expect, it, vi } from 'vitest';

// Slice I — POST /api/beta-request unit test.
// Mock @premura/db (insert + select) e @/lib/email-resend (Resend dispatch).

const mocks = vi.hoisted(() => ({
  selectLimit: vi.fn(),
  insertValues: vi.fn(),
  sendEmailViaResend: vi.fn(),
}));

vi.mock('@premura/db', () => ({
  createServerClient: vi.fn(() => ({
    db: {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () => mocks.selectLimit(),
          }),
        }),
      }),
      insert: () => ({
        values: (v: unknown) => mocks.insertValues(v),
      }),
    },
  })),
  waitlist: {},
}));

vi.mock('../lib/email-resend', () => ({
  sendEmailViaResend: (...args: unknown[]) => mocks.sendEmailViaResend(...args),
}));

import { POST } from '../app/api/beta-request/route';

function makeRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('https://premura.it/api/beta-request', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function validBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    email: 'andrea@example.com',
    fullName: 'Andrea Chiacchio',
    propertyCount: 2,
    privacyAccepted: true,
    ...overrides,
  };
}

describe('POST /api/beta-request', () => {
  let ipCounter = 0;

  beforeEach(() => {
    mocks.selectLimit.mockReset().mockResolvedValue([]);
    mocks.insertValues.mockReset().mockResolvedValue(undefined);
    mocks.sendEmailViaResend.mockReset().mockResolvedValue({ id: 'em_test' });
    process.env.RESEND_API_KEY = 'rs_test_fake';
    // Ogni test usa un IP diverso per evitare share del rate limit bucket.
    ipCounter++;
  });

  function nextHeaders(): Record<string, string> {
    return { 'x-forwarded-for': `10.0.0.${ipCounter}` };
  }

  it('body valido nuovo email → 200 + insert + 2 email dispatch', async () => {
    const res = await POST(makeRequest(validBody(), nextHeaders()));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true, duplicate: false });

    expect(mocks.insertValues).toHaveBeenCalledTimes(1);
    const inserted = mocks.insertValues.mock.calls[0]?.[0];
    expect(inserted.email).toBe('andrea@example.com');
    expect(inserted.fullName).toBe('Andrea Chiacchio');
    expect(inserted.propertyCount).toBe(2);
    expect(inserted.requestedBetaAccess).toBe(true);
    expect(inserted.source).toBe('landing_v2');

    // Email dispatch fire-and-forget: aspettiamo microtask
    await new Promise((r) => setTimeout(r, 0));
    expect(mocks.sendEmailViaResend).toHaveBeenCalledTimes(2);
  });

  it('cityAndType valorizzato → salvato in notes', async () => {
    await POST(
      makeRequest(validBody({ cityAndType: 'Bologna, 2 app centro storico' }), nextHeaders()),
    );
    const inserted = mocks.insertValues.mock.calls[0]?.[0];
    expect(inserted.notes).toBe('Città/tipo: Bologna, 2 app centro storico');
  });

  it('cityAndType assente → notes null', async () => {
    await POST(makeRequest(validBody(), nextHeaders()));
    const inserted = mocks.insertValues.mock.calls[0]?.[0];
    expect(inserted.notes).toBeNull();
  });

  it('email duplicata → 200 duplicate=true, no insert, no email', async () => {
    mocks.selectLimit.mockResolvedValueOnce([{ id: 'existing-uuid' }]);
    const res = await POST(makeRequest(validBody(), nextHeaders()));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true, duplicate: true });
    expect(mocks.insertValues).not.toHaveBeenCalled();
    await new Promise((r) => setTimeout(r, 0));
    expect(mocks.sendEmailViaResend).not.toHaveBeenCalled();
  });

  it('body JSON malformato → 400', async () => {
    const req = new Request('https://premura.it/api/beta-request', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...nextHeaders() },
      body: 'not json at all',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error).toBe('validation');
  });

  it('email invalida → 400 con messaggio', async () => {
    const res = await POST(makeRequest(validBody({ email: 'not-an-email' }), nextHeaders()));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('validation');
  });

  it('privacyAccepted false → 400', async () => {
    const res = await POST(makeRequest(validBody({ privacyAccepted: false }), nextHeaders()));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.message).toContain('privacy');
  });

  it('rate limit: 4° tentativo stesso IP → 429', async () => {
    const sameHeaders = { 'x-forwarded-for': '10.0.99.1' };
    for (let i = 0; i < 3; i++) {
      await POST(makeRequest(validBody({ email: `a${i}@example.com` }), sameHeaders));
    }
    const res = await POST(makeRequest(validBody({ email: 'a4@example.com' }), sameHeaders));
    expect(res.status).toBe(429);
    const json = await res.json();
    expect(json.error).toBe('rate_limit');
  });

  it('insert con unique constraint violation → 200 duplicate', async () => {
    mocks.insertValues.mockRejectedValueOnce(
      new Error('insert into "waitlist" violates unique constraint "waitlist_email_unique"'),
    );
    const res = await POST(makeRequest(validBody(), nextHeaders()));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true, duplicate: true });
  });

  it('DB error generico → 500', async () => {
    mocks.insertValues.mockRejectedValueOnce(new Error('connection refused'));
    const res = await POST(makeRequest(validBody(), nextHeaders()));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error).toBe('server');
  });

  it('senza RESEND_API_KEY → 200 ok ma nessuna email', async () => {
    // biome-ignore lint/performance/noDelete: process.env semantica
    delete process.env.RESEND_API_KEY;
    const res = await POST(makeRequest(validBody(), nextHeaders()));
    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 0));
    expect(mocks.sendEmailViaResend).not.toHaveBeenCalled();
  });
});
