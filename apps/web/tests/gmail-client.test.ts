import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  searchAirbnbEmails,
  fetchEmailContent,
  _internals,
  type GmailClient,
} from '../lib/gmail-client';

// ─────────────────────────────────────────────────────────────
// Helpers per costruire un GmailClient mock con risposte controllate.
// ─────────────────────────────────────────────────────────────

type ListResponse = {
  data: {
    messages?: Array<{ id?: string }>;
    nextPageToken?: string;
  };
};
type GetResponse = {
  data: {
    snippet?: string;
    payload?: {
      headers?: Array<{ name?: string; value?: string }>;
      mimeType?: string;
      body?: { data?: string };
      parts?: GetResponse['data']['payload'][];
    };
  };
};

function makeClient(opts: {
  list?: (args: unknown) => Promise<ListResponse>;
  get?: (args: unknown) => Promise<GetResponse>;
}): GmailClient {
  return {
    hostId: 'host-x',
    googleEmail: 'andrea@example.com',
    // Cast: il vero tipo è gmail_v1.Gmail; per test ci basta la shape minima.
    api: {
      users: {
        messages: {
          list: opts.list ?? (() => Promise.resolve({ data: {} } as ListResponse)),
          get: opts.get ?? (() => Promise.resolve({ data: {} } as GetResponse)),
        },
      },
    } as unknown as GmailClient['api'],
  };
}

function b64url(s: string): string {
  return Buffer.from(s, 'utf8').toString('base64');
}

// ─────────────────────────────────────────────────────────────
// searchAirbnbEmails
// ─────────────────────────────────────────────────────────────

describe('searchAirbnbEmails', () => {
  it('costruisce query "from:automated@airbnb.com after:YYYY/MM/DD" e ritorna ID singola pagina', async () => {
    const calls: Array<Record<string, unknown>> = [];
    const client = makeClient({
      list: async (args) => {
        calls.push(args as Record<string, unknown>);
        return {
          data: {
            messages: [{ id: 'm1' }, { id: 'm2' }, { id: 'm3' }],
          },
        };
      },
    });
    // Fissiamo "now" per avere date deterministiche.
    const now = new Date('2026-04-26T12:00:00Z');
    const ids = await searchAirbnbEmails(client, 90, { now });

    expect(ids).toEqual(['m1', 'm2', 'm3']);
    expect(calls).toHaveLength(1);
    const q = (calls[0] as { q: string }).q;
    expect(q).toBe('from:automated@airbnb.com after:2026/01/26');
  });

  it('paginazione: segue nextPageToken e accumula tutti gli ID', async () => {
    let pageIdx = 0;
    const client = makeClient({
      list: async () => {
        pageIdx++;
        if (pageIdx === 1) {
          return {
            data: {
              messages: [{ id: 'a' }, { id: 'b' }],
              nextPageToken: 'tok-2',
            },
          };
        }
        if (pageIdx === 2) {
          return {
            data: {
              messages: [{ id: 'c' }],
              nextPageToken: 'tok-3',
            },
          };
        }
        return { data: { messages: [{ id: 'd' }] } };
      },
    });
    const ids = await searchAirbnbEmails(client, 30);
    expect(ids).toEqual(['a', 'b', 'c', 'd']);
    expect(pageIdx).toBe(3);
  });

  it('rifiuta daysBack non valido', async () => {
    const client = makeClient({});
    await expect(searchAirbnbEmails(client, 0)).rejects.toThrow(/daysBack/);
    await expect(searchAirbnbEmails(client, -5)).rejects.toThrow(/daysBack/);
    await expect(searchAirbnbEmails(client, Number.NaN)).rejects.toThrow(/daysBack/);
  });
});

// ─────────────────────────────────────────────────────────────
// fetchEmailContent
// ─────────────────────────────────────────────────────────────

describe('fetchEmailContent', () => {
  it('estrae subject, from, date, htmlBody, textBody da multipart/alternative', async () => {
    const client = makeClient({
      get: async () => ({
        data: {
          snippet: 'Stephen arriva il 23 set',
          payload: {
            headers: [
              { name: 'Subject', value: 'Nuova prenotazione confermata!' },
              { name: 'From', value: 'Airbnb <automated@airbnb.com>' },
              { name: 'Date', value: 'Mon, 15 Sep 2025 14:32:00 +0000' },
            ],
            mimeType: 'multipart/alternative',
            parts: [
              {
                mimeType: 'text/plain',
                body: { data: b64url('Plain version body') },
              },
              {
                mimeType: 'text/html',
                body: { data: b64url('<html>HTML version body</html>') },
              },
            ],
          },
        },
      }),
    });

    const got = await fetchEmailContent(client, 'msg-1');
    expect(got.messageId).toBe('msg-1');
    expect(got.subject).toBe('Nuova prenotazione confermata!');
    expect(got.from).toBe('Airbnb <automated@airbnb.com>');
    expect(got.date?.toISOString()).toBe('2025-09-15T14:32:00.000Z');
    expect(got.htmlBody).toContain('HTML version body');
    expect(got.textBody).toBe('Plain version body');
    expect(got.snippet).toBe('Stephen arriva il 23 set');
  });

  it('decodifica nested multipart (mixed → alternative)', async () => {
    const client = makeClient({
      get: async () => ({
        data: {
          payload: {
            headers: [{ name: 'Subject', value: 'Test' }],
            mimeType: 'multipart/mixed',
            parts: [
              {
                mimeType: 'multipart/alternative',
                parts: [
                  { mimeType: 'text/plain', body: { data: b64url('PLAIN') } },
                  { mimeType: 'text/html', body: { data: b64url('HTML') } },
                ],
              },
            ],
          },
        },
      }),
    });
    const got = await fetchEmailContent(client, 'm');
    expect(got.htmlBody).toBe('HTML');
    expect(got.textBody).toBe('PLAIN');
  });

  it('headerValue è case-insensitive', () => {
    const headers = [
      { name: 'subject', value: 'lowercase header' },
      { name: 'DATE', value: 'Tue, 1 Jan 2026 00:00:00 +0000' },
    ];
    expect(_internals.headerValue(headers, 'Subject')).toBe('lowercase header');
    expect(_internals.headerValue(headers, 'date')).toBe('Tue, 1 Jan 2026 00:00:00 +0000');
    expect(_internals.headerValue(headers, 'X-Missing')).toBeUndefined();
  });

  it('extractBodies ritorna stringhe vuote se payload è null', () => {
    const got = _internals.extractBodies(null);
    expect(got).toEqual({ html: '', text: '' });
  });
});
