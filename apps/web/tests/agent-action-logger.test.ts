import type { Database } from '@premura/db';
import { describe, expect, it, vi } from 'vitest';
import { calcCostUsd, logAgentAction } from '../lib/agent-action-logger';

describe('calcCostUsd', () => {
  it('Sonnet 4.6 - 1000 input + 200 output -> calcolato corretto', () => {
    const cost = calcCostUsd('claude-sonnet-4-6', {
      input_tokens: 1000,
      output_tokens: 200,
    });
    // (1000 * 3 + 200 * 15) / 1M = 0.003 + 0.003 = 0.006
    expect(cost).toBeCloseTo(0.006, 6);
  });

  it('Haiku 4.5 - 5000 input -> bassissimo costo', () => {
    const cost = calcCostUsd('claude-haiku-4-5-20251001', {
      input_tokens: 5000,
      output_tokens: 0,
    });
    // 5000 * 0.8 / 1M = 0.004
    expect(cost).toBeCloseTo(0.004, 6);
  });

  it('Opus 4.7 - 1000 input + 500 output -> costo alto', () => {
    const cost = calcCostUsd('claude-opus-4-7', {
      input_tokens: 1000,
      output_tokens: 500,
    });
    // (1000 * 15 + 500 * 75) / 1M = 0.015 + 0.0375 = 0.0525
    expect(cost).toBeCloseTo(0.0525, 6);
  });

  it('cache_read tokens contati al 10%', () => {
    const cost = calcCostUsd('claude-sonnet-4-6', {
      input_tokens: 0,
      output_tokens: 0,
      cache_read_input_tokens: 10000,
    });
    // 10000 * 3 * 0.1 / 1M = 0.003
    expect(cost).toBeCloseTo(0.003, 6);
  });

  it('cache_write tokens contati al 125%', () => {
    const cost = calcCostUsd('claude-sonnet-4-6', {
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: 1000,
    });
    // 1000 * 3 * 1.25 / 1M = 0.00375
    expect(cost).toBeCloseTo(0.00375, 6);
  });

  it('modello sconosciuto -> 0', () => {
    expect(calcCostUsd('unknown-model', { input_tokens: 1000 })).toBe(0);
  });

  it('usage undefined -> 0', () => {
    expect(calcCostUsd('claude-sonnet-4-6', undefined)).toBe(0);
  });
});

describe('logAgentAction', () => {
  function makeMockDb() {
    const inserts: Array<Record<string, unknown>> = [];
    const mock = {
      insert: () => ({
        values: (vals: Record<string, unknown>) => {
          inserts.push(vals);
          return {
            returning: () => Promise.resolve([{ id: `action-${inserts.length}` }]),
          };
        },
      }),
      update: () => ({
        set: () => ({ where: () => Promise.resolve() }),
      }),
    };
    return { db: mock as unknown as Database, inserts };
  }

  it('success -> insert row con status=success + cost calcolato', async () => {
    const { db, inserts } = makeMockDb();
    const fakeFn = vi.fn().mockResolvedValue({
      output: { decision: 'auto' },
      reasoning: 'guest seems happy',
      model: 'claude-sonnet-4-6',
      usage: { input_tokens: 100, output_tokens: 50 },
    });

    const r = await logAgentAction(db, {
      hostId: 'host-1',
      agent: 'guest_dna',
      actionType: 'extract_message_insights',
      bookingId: 'booking-1',
      messageId: 'msg-1',
      inputSummary: { body_length: 100 },
      fn: fakeFn,
    });

    expect(r.output).toEqual({ decision: 'auto' });
    expect(r.agentActionId).toBe('action-1');
    expect(r.costUsd).toBeGreaterThan(0);
    expect(r.latencyMs).toBeGreaterThanOrEqual(0);

    expect(inserts.length).toBe(1);
    const row = inserts[0];
    if (!row) throw new Error('expected at least one insert');
    expect(row.status).toBe('success');
    expect(row.agent).toBe('guest_dna');
    expect(row.actionType).toBe('extract_message_insights');
    expect(row.hostId).toBe('host-1');
    expect(row.bookingId).toBe('booking-1');
    expect(row.messageId).toBe('msg-1');
    expect(row.model).toBe('claude-sonnet-4-6');
    expect(row.inputTokens).toBe(100);
    expect(row.outputTokens).toBe(50);
    expect(row.errorMessage).toBeNull();
    expect(row.reasoning).toBe('guest seems happy');
  });

  it('fn throws -> insert row con status=error + errorMessage + re-throw', async () => {
    const { db, inserts } = makeMockDb();
    const fakeFn = vi.fn().mockRejectedValue(new Error('Anthropic timeout'));

    await expect(
      logAgentAction(db, {
        hostId: 'host-1',
        agent: 'guest_dna',
        actionType: 'extract',
        fn: fakeFn,
      }),
    ).rejects.toThrow('Anthropic timeout');

    expect(inserts.length).toBe(1);
    const row = inserts[0];
    if (!row) throw new Error('expected at least one insert');
    expect(row.status).toBe('error');
    expect(row.errorMessage).toBe('Anthropic timeout');
    expect(row.errorStack).toBeTruthy();
  });

  it('PII redaction: campo body redacted con length', async () => {
    const { db, inserts } = makeMockDb();
    await logAgentAction(db, {
      hostId: 'host-1',
      agent: 'guest_dna',
      actionType: 'classify',
      inputSummary: {
        body: 'Ciao, dove sono le chiavi?',
        body_length: 26,
        guest_phone: '+39 351 451 2070',
      },
      fn: async () => ({ output: { kind: 'info' } }),
    });

    const row = inserts[0];
    if (!row) throw new Error('expected at least one insert');
    const summary = row.inputSummary as Record<string, unknown>;
    expect(summary.body).toBe('[redacted:26ch]');
    expect(summary.guest_phone).toBe('[redacted:16ch]');
    expect(summary.body_length).toBe(26); // non PII, passa
  });

  it('truncation: stringa >500 char -> truncata con suffisso', async () => {
    const { db, inserts } = makeMockDb();
    const longString = 'x'.repeat(800);
    await logAgentAction(db, {
      hostId: 'host-1',
      agent: 'guest_dna',
      actionType: 'classify',
      inputSummary: { context_dump: longString },
      fn: async () => ({ output: {} }),
    });
    const row = inserts[0];
    if (!row) throw new Error('expected at least one insert');
    const summary = row.inputSummary as Record<string, unknown>;
    const truncated = summary.context_dump as string;
    expect(truncated.length).toBeLessThan(longString.length);
    expect(truncated).toContain('[truncated:800ch]');
  });

  it('agent system + actionType libero -> accettato', async () => {
    const { db, inserts } = makeMockDb();
    await logAgentAction(db, {
      hostId: 'host-1',
      agent: 'system',
      actionType: 'cron_ical_poll',
      fn: async () => ({ output: { polled: 5 } }),
    });
    const inserted = inserts[0];
    if (!inserted) throw new Error('expected at least one insert');
    expect(inserted.agent).toBe('system');
    expect(inserted.actionType).toBe('cron_ical_poll');
  });

  it('latency misurata correttamente', async () => {
    const { db } = makeMockDb();
    const r = await logAgentAction(db, {
      hostId: 'host-1',
      agent: 'guest_dna',
      actionType: 'slow_call',
      fn: async () => {
        await new Promise((res) => setTimeout(res, 50));
        return { output: { ok: true } };
      },
    });
    expect(r.latencyMs).toBeGreaterThanOrEqual(40);
    expect(r.latencyMs).toBeLessThan(500);
  });
});
