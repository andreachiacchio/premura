import type { Database } from '@premura/db';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ENQUEUE_ATTEMPT_TIMEOUT_MS, enqueueDraftOrMarkFailed } from '../src/jobs/draft-enqueue';

// 26/10, produzione: dopo waha.persist.inserted
//   waha.draft.enqueue_error — Error: Custom Id cannot contain :
// BullMQ 5 valida l'id del job PRIMA di parlare con Redis. Qui le code
// vere accodano davvero: Queue.add passa da Job.create di BullMQ (stessa
// validazione della produzione), solo il comando Redis finale e' finto.
// Se un id torna ad avere ':' questi test falliscono come fallisce prod.

const added = vi.hoisted(() => [] as Array<{ queue: string; jobId: string }>);

vi.mock('../src/jobs/redis-connection', () => ({ getRedisConnection: () => ({}) }));

vi.mock('bullmq', async (importOriginal) => {
  const actual = await importOriginal<typeof import('bullmq')>();

  // Il client Redis finto risponde solo al comando con cui BullMQ
  // inserisce un job standard ("addStandardJob:<versione>").
  const fakeClient = new Proxy(
    {},
    {
      get: (_t, prop) =>
        typeof prop === 'string' && prop.startsWith('addStandardJob')
          ? async () => 'ok'
          : undefined,
    },
  );

  class Queue {
    constructor(
      private readonly name: string,
      private readonly opts: { defaultJobOptions?: Record<string, unknown> } = {},
    ) {}

    async add(jobName: string, data: unknown, opts: { jobId: string }) {
      const queueLike = {
        name: this.name,
        keys: {},
        client: Promise.resolve(fakeClient),
        toKey: (type: string) => `bull:${this.name}:${type}`,
        qualifiedName: `bull:${this.name}`,
        opts: { prefix: 'bull' },
        redisVersion: '7.2.0',
        closing: undefined,
        databaseType: 'redis',
      };
      // biome-ignore lint/suspicious/noExplicitAny: la coda finta imita la forma interna che Job usa
      const job = await actual.Job.create(queueLike as any, jobName, data, {
        ...this.opts.defaultJobOptions,
        ...opts,
      });
      // Arrivati qui, BullMQ ha validato e "scritto" il job: si registra
      // l'id chiesto (il Redis finto non lo rimanda indietro).
      added.push({ queue: this.name, jobId: opts.jobId });
      return job;
    }
  }

  return { ...actual, Queue };
});

const { enqueueDraftGeneration, draftJobId } = await import('../src/jobs/draft-generation-queue');
const { enqueueSurveyAbandon, enqueueSurveySend } = await import('../src/jobs/survey-queue');
const { enqueueWelcomeSend } = await import('../src/jobs/welcome-message-queue');

const MESSAGE_ID = '9bf305fe-eb1d-4f0a-839e-5e8c66c83225';

describe('id dei job: BullMQ li accetta davvero', () => {
  beforeEach(() => {
    added.length = 0;
  });

  it('la coda finta riproduce l errore di produzione con l id vecchio', async () => {
    const { Queue } = await import('bullmq');
    const queue = new Queue('draft-generation');
    await expect(
      queue.add('generate', { messageId: MESSAGE_ID }, { jobId: `draft:${MESSAGE_ID}` }),
    ).rejects.toThrow('Custom Id cannot contain :');
  });

  it('draft: accodato, id col trattino', async () => {
    await expect(enqueueDraftGeneration(MESSAGE_ID)).resolves.toBeUndefined();
    expect(added).toEqual([{ queue: 'draft-generation', jobId: `draft-${MESSAGE_ID}` }]);
    expect(draftJobId(MESSAGE_ID)).toBe(`draft-${MESSAGE_ID}`);
  });

  it('survey send e abandon: accodati', async () => {
    await enqueueSurveySend('b-1');
    await enqueueSurveyAbandon('q-1');
    expect(added.map((a) => a.jobId)).toEqual(['survey-send-b-1', 'survey-abandon-q-1']);
  });

  it('welcome: accodato', async () => {
    await enqueueWelcomeSend('k-1');
    expect(added.map((a) => a.jobId)).toEqual(['welcome-send-k-1']);
  });

  it('nessun id contiene ":" — neanche nella forma a tre parti che BullMQ oggi tollera', async () => {
    await enqueueDraftGeneration(MESSAGE_ID);
    await enqueueSurveySend('b-1');
    await enqueueSurveyAbandon('q-1');
    await enqueueWelcomeSend('k-1');
    for (const a of added) expect(a.jobId).not.toContain(':');
  });
});

// R2: un enqueue fallito dopo il salvataggio non e' piu' solo un log.
describe('enqueueDraftOrMarkFailed', () => {
  function fakeDb(fail = false) {
    const sets: unknown[] = [];
    const db = {
      update: () => ({
        set: (v: unknown) => {
          sets.push(v);
          return { where: async () => (fail ? Promise.reject(new Error('db giu')) : undefined) };
        },
      }),
    } as unknown as Database;
    return { db, sets };
  }

  it('al primo colpo: accodato, nessuna scrittura sul messaggio', async () => {
    const { db, sets } = fakeDb();
    const enqueue = vi.fn().mockResolvedValue(undefined);
    await expect(enqueueDraftOrMarkFailed(db, MESSAGE_ID, enqueue)).resolves.toEqual({
      status: 'enqueued',
      attempts: 1,
    });
    expect(sets).toEqual([]);
  });

  it('fallisce una volta: riprova subito e accoda', async () => {
    const { db, sets } = fakeDb();
    const enqueue = vi.fn().mockRejectedValueOnce(new Error('Redis')).mockResolvedValue(undefined);
    await expect(enqueueDraftOrMarkFailed(db, MESSAGE_ID, enqueue)).resolves.toEqual({
      status: 'enqueued',
      attempts: 2,
    });
    expect(enqueue).toHaveBeenCalledTimes(2);
    expect(sets).toEqual([]);
  });

  it('fallisce due volte: lo scrive sul messaggio, non lancia', async () => {
    const { db, sets } = fakeDb();
    const enqueue = vi.fn().mockRejectedValue(new Error('Custom Id cannot contain :'));
    await expect(enqueueDraftOrMarkFailed(db, MESSAGE_ID, enqueue)).resolves.toEqual({
      status: 'failed',
      error: 'Custom Id cannot contain :',
      marked: true,
    });
    expect(enqueue).toHaveBeenCalledTimes(2);
    expect(sets).toHaveLength(1);
  });

  it('anche se la scrittura fallisce: non lancia, e dice che il segno manca', async () => {
    const { db } = fakeDb(true);
    const enqueue = vi.fn().mockRejectedValue(new Error('Redis'));
    await expect(enqueueDraftOrMarkFailed(db, MESSAGE_ID, enqueue)).resolves.toMatchObject({
      status: 'failed',
      marked: false,
    });
  });

  // Redis irraggiungibile: add() resta appeso invece di fallire. Senza il
  // limite per tentativo il segno non verrebbe mai scritto.
  it('coda che non risponde: due tentativi a tempo, poi il segno', async () => {
    vi.useFakeTimers();
    try {
      const { db, sets } = fakeDb();
      const enqueue = vi.fn(() => new Promise<void>(() => {}));
      const outcome = enqueueDraftOrMarkFailed(db, MESSAGE_ID, enqueue);
      await vi.advanceTimersByTimeAsync(2 * ENQUEUE_ATTEMPT_TIMEOUT_MS);
      await expect(outcome).resolves.toMatchObject({ status: 'failed', marked: true });
      expect(enqueue).toHaveBeenCalledTimes(2);
      expect(sets).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
