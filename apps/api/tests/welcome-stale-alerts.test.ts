import type { Database } from '@premura/db';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Slice E — Unit test welcome stale alerts (08:00 + 09:00 edge cases).
// Mocka findStaleSetups + sendText + Resend.

const mockFindStale = vi.fn();
vi.mock('@premura/agents', async () => {
  const actual = (await vi.importActual('@premura/agents')) as Record<string, unknown>;
  return {
    ...actual,
    findStaleSetups: (...args: unknown[]) => mockFindStale(...args),
  };
});

const mockSendText = vi.fn();
vi.mock('@premura/integrations', () => ({
  sendText: (...args: unknown[]) => mockSendText(...args),
}));

const mockResendSend = vi.fn().mockResolvedValue({ id: 'email-123' });
vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: mockResendSend },
  })),
}));

const { runEarlyStaleCheck, runEscalationCheck } = await import('../src/jobs/welcome-stale-alerts');

const fakeDb = {} as Database;

const baseStaleItem = {
  kitId: 'kit-1',
  bookingId: 'booking-1',
  hostId: 'host-1',
  propertyName: 'La Goccia',
  propertyId: 'prop-1',
  cleanerName: 'Karen',
  cleanerPhone: '+39 333 1112222',
  guestFirstName: 'Lena',
  checkinAt: new Date('2026-05-15T14:00:00Z'),
  kitStatus: 'picked_up_by_cleaner',
  photoUploaded: false,
};

describe('runEarlyStaleCheck (08:00)', () => {
  const originalKey = process.env.RESEND_API_KEY;

  beforeEach(() => {
    mockFindStale.mockReset();
    mockSendText.mockReset();
    mockResendSend.mockClear();
    process.env.RESEND_API_KEY = 're_test_fake';
  });

  afterEach(() => {
    if (originalKey !== undefined) {
      process.env.RESEND_API_KEY = originalKey;
    } else {
      // biome-ignore lint/performance/noDelete: process.env semantica
      delete process.env.RESEND_API_KEY;
    }
  });

  it('no stale → no notifications', async () => {
    mockFindStale.mockResolvedValueOnce([]);
    const res = await runEarlyStaleCheck(fakeDb);
    expect(res.candidates).toBe(0);
    expect(res.cleanerAlerted).toBe(0);
    expect(res.founderNotified).toBe(false);
    expect(mockSendText).not.toHaveBeenCalled();
    expect(mockResendSend).not.toHaveBeenCalled();
  });

  it('stale items → WA reminder cleaner + email founder', async () => {
    mockFindStale.mockResolvedValueOnce([baseStaleItem]);
    mockSendText.mockResolvedValueOnce({ messageId: 'wamid-1' });
    const res = await runEarlyStaleCheck(fakeDb);
    expect(res.candidates).toBe(1);
    expect(res.cleanerAlerted).toBe(1);
    expect(res.founderNotified).toBe(true);
    expect(mockSendText).toHaveBeenCalledWith('+39 333 1112222', expect.stringContaining('Lena'));
    expect(mockSendText).toHaveBeenCalledWith(
      '+39 333 1112222',
      expect.stringContaining('La Goccia'),
    );
    expect(mockResendSend).toHaveBeenCalledTimes(1);
    const emailArg = mockResendSend.mock.calls[0]?.[0];
    expect(emailArg.subject).toContain('Foto setup mancante');
    expect(emailArg.html).toContain('La Goccia');
  });

  it('skip cleaner WA se phone null', async () => {
    mockFindStale.mockResolvedValueOnce([{ ...baseStaleItem, cleanerPhone: null }]);
    const res = await runEarlyStaleCheck(fakeDb);
    expect(res.candidates).toBe(1);
    expect(res.cleanerAlerted).toBe(0);
    expect(mockSendText).not.toHaveBeenCalled();
  });

  it('WA send error → continua e email founder lo stesso', async () => {
    mockFindStale.mockResolvedValueOnce([baseStaleItem]);
    mockSendText.mockRejectedValueOnce(new Error('WA boom'));
    const res = await runEarlyStaleCheck(fakeDb);
    expect(res.candidates).toBe(1);
    expect(res.cleanerAlerted).toBe(0);
    expect(res.founderNotified).toBe(true);
  });

  it('senza RESEND_API_KEY → founderNotified=false', async () => {
    // biome-ignore lint/performance/noDelete: process.env semantica
    delete process.env.RESEND_API_KEY;
    mockFindStale.mockResolvedValueOnce([baseStaleItem]);
    mockSendText.mockResolvedValueOnce({ messageId: 'wamid-1' });
    const res = await runEarlyStaleCheck(fakeDb);
    expect(res.candidates).toBe(1);
    expect(res.cleanerAlerted).toBe(1);
    expect(res.founderNotified).toBe(false);
  });
});

describe('runEscalationCheck (09:00)', () => {
  beforeEach(() => {
    mockFindStale.mockReset();
    mockSendText.mockReset();
    mockResendSend.mockClear();
    process.env.RESEND_API_KEY = 're_test_fake';
  });

  it('stale items → email escalation', async () => {
    mockFindStale.mockResolvedValueOnce([{ ...baseStaleItem, kitStatus: 'picked_up_by_cleaner' }]);
    const res = await runEscalationCheck(fakeDb);
    expect(res.candidates).toBe(1);
    expect(res.founderNotified).toBe(true);
    expect(mockSendText).not.toHaveBeenCalled();
    const emailArg = mockResendSend.mock.calls[0]?.[0];
    expect(emailArg.subject).toContain('Kit incompleto');
    expect(emailArg.html).toContain('Escalation');
  });

  it('no stale → no email', async () => {
    mockFindStale.mockResolvedValueOnce([]);
    const res = await runEscalationCheck(fakeDb);
    expect(res.candidates).toBe(0);
    expect(res.founderNotified).toBe(false);
    expect(mockResendSend).not.toHaveBeenCalled();
  });
});
