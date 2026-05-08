import type { Database } from '@premura/db';
import type { Job } from 'bullmq';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Slice 7a.4 — Unit test del handler draft-generation (puro, no Redis).
// Mocka triggerDraftGeneration per non chiamare Sonnet vero.

const mockTrigger = vi.fn();
vi.mock('@premura/agents', async () => {
  const actual = (await vi.importActual('@premura/agents')) as Record<string, unknown>;
  return {
    ...actual,
    triggerDraftGeneration: (...args: unknown[]) => mockTrigger(...args),
  };
});

const { processDraftGenerationJob } = await import('../src/jobs/draft-generation-handler');

function makeMockDb(messageRow: Record<string, unknown> | null): Database {
  return {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          innerJoin: () => ({
            where: () => ({
              limit: () => Promise.resolve(messageRow ? [messageRow] : []),
            }),
          }),
        }),
      }),
    }),
  } as unknown as Database;
}

function makeJob(messageId: string): Job<{ messageId: string }> {
  return {
    data: { messageId },
    id: `draft:${messageId}`,
    name: 'generate',
  } as unknown as Job<{ messageId: string }>;
}

describe('processDraftGenerationJob', () => {
  beforeEach(() => {
    mockTrigger.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('happy path: messaggio inbound guest -> chiama triggerDraftGeneration e ritorna status generated', async () => {
    const db = makeMockDb({
      bookingId: 'b1',
      body: 'A che ora il check-in?',
      direction: 'inbound',
      fromEntity: 'guest',
      hostId: 'host-1',
    });
    mockTrigger.mockResolvedValue({
      status: 'generated',
      draftId: 'pd-1',
      routing: 'notify_host',
      confidence: 0.9,
    });

    const result = await processDraftGenerationJob(db, makeJob('m1'));

    expect(result.status).toBe('generated');
    expect(result.draftId).toBe('pd-1');
    expect(mockTrigger).toHaveBeenCalledOnce();
    expect(mockTrigger).toHaveBeenCalledWith(db, {
      messageId: 'm1',
      bookingId: 'b1',
      body: 'A che ora il check-in?',
      hostId: 'host-1',
    });
  });

  it('messaggio non trovato -> skipped_message_not_found, niente call al pipeline', async () => {
    const db = makeMockDb(null);
    const result = await processDraftGenerationJob(db, makeJob('m-missing'));
    expect(result.status).toBe('skipped_message_not_found');
    expect(mockTrigger).not.toHaveBeenCalled();
  });

  it('messaggio orphan (bookingId null) -> skipped_orphan', async () => {
    // L'inner join in produzione filtra fuori gli orphan (bookingId null
    // = no join match), ma se per qualche race condition arriva un row
    // con bookingId null, la guardia esplicita resta safety.
    const db = makeMockDb({
      bookingId: null,
      body: 'orphan body',
      direction: 'inbound',
      fromEntity: 'guest',
      hostId: 'host-1',
    });
    const result = await processDraftGenerationJob(db, makeJob('m-orphan'));
    expect(result.status).toBe('skipped_orphan');
    expect(mockTrigger).not.toHaveBeenCalled();
  });

  it('messaggio outbound -> skipped_not_inbound_guest (sanity)', async () => {
    const db = makeMockDb({
      bookingId: 'b1',
      body: 'risposta host',
      direction: 'outbound',
      fromEntity: 'host',
      hostId: 'host-1',
    });
    const result = await processDraftGenerationJob(db, makeJob('m-out'));
    expect(result.status).toBe('skipped_not_inbound_guest');
    expect(mockTrigger).not.toHaveBeenCalled();
  });

  it('messaggio fromEntity=cleaner -> skipped_not_inbound_guest', async () => {
    const db = makeMockDb({
      bookingId: 'b1',
      body: 'cleaner update',
      direction: 'inbound',
      fromEntity: 'cleaner',
      hostId: 'host-1',
    });
    const result = await processDraftGenerationJob(db, makeJob('m-cleaner'));
    expect(result.status).toBe('skipped_not_inbound_guest');
    expect(mockTrigger).not.toHaveBeenCalled();
  });

  it('idempotenza: pipeline ritorna skipped_existing_draft -> handler propaga (niente double-LLM)', async () => {
    const db = makeMockDb({
      bookingId: 'b1',
      body: 'A che ora il check-in?',
      direction: 'inbound',
      fromEntity: 'guest',
      hostId: 'host-1',
    });
    mockTrigger.mockResolvedValue({
      status: 'skipped_existing_draft',
      draftId: 'pd-existing',
    });

    const result = await processDraftGenerationJob(db, makeJob('m1'));
    expect(result.status).toBe('skipped_existing_draft');
    expect(result.draftId).toBe('pd-existing');
    expect(mockTrigger).toHaveBeenCalledOnce();
  });

  it('pipeline throws -> handler propaga (worker fa rethrow + BullMQ retry)', async () => {
    const db = makeMockDb({
      bookingId: 'b1',
      body: 'A che ora il check-in?',
      direction: 'inbound',
      fromEntity: 'guest',
      hostId: 'host-1',
    });
    mockTrigger.mockRejectedValue(new Error('Anthropic 529 overloaded'));

    await expect(processDraftGenerationJob(db, makeJob('m1'))).rejects.toThrow(
      'Anthropic 529 overloaded',
    );
  });

  it('idempotenza doppia call: stesso messageId due volte -> pipeline gestisce dedup interno', async () => {
    const db = makeMockDb({
      bookingId: 'b1',
      body: 'A che ora il check-in?',
      direction: 'inbound',
      fromEntity: 'guest',
      hostId: 'host-1',
    });
    // Prima call: pipeline genera draft.
    mockTrigger.mockResolvedValueOnce({
      status: 'generated',
      draftId: 'pd-1',
      routing: 'notify_host',
      confidence: 0.9,
    });
    // Seconda call: pipeline detect dedup e ritorna skipped_existing_draft.
    mockTrigger.mockResolvedValueOnce({
      status: 'skipped_existing_draft',
      draftId: 'pd-1',
    });

    const r1 = await processDraftGenerationJob(db, makeJob('m1'));
    const r2 = await processDraftGenerationJob(db, makeJob('m1'));

    expect(r1.status).toBe('generated');
    expect(r2.status).toBe('skipped_existing_draft');
    // Il pipeline e' chiamato 2 volte (ogni call e' separata) ma il dedup
    // interno di triggerDraftGeneration garantisce che non si crei un
    // secondo draft. Test del dedup pipeline e' in
    // apps/web/tests/draft-generator-pipeline.test.ts.
    expect(mockTrigger).toHaveBeenCalledTimes(2);
  });
});
