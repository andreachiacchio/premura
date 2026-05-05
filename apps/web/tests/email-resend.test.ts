import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ResendClientError, createResendClient, sendEmailViaResend } from '../lib/email-resend';
import { MAGIC_LINK_SUBJECT, buildMagicLinkHtml, buildMagicLinkText } from '../lib/email-templates';

// Slice 6.5.1 — test wrapper Resend + template magic link.
// Tutti i test mockano fetch (no chiamate API reali).

describe('createResendClient - error handling', () => {
  beforeEach(() => {
    // biome-ignore lint/performance/noDelete: process.env semantica
    delete process.env.RESEND_API_KEY;
  });

  it('niente API key -> throw ResendClientError', () => {
    expect(() => createResendClient({})).toThrow(ResendClientError);
  });

  it('API key esplicita -> client funzionante', () => {
    const client = createResendClient({ apiKey: 'rs_xxx' });
    expect(client.sendEmail).toBeTypeOf('function');
  });

  it('env RESEND_API_KEY presente -> client funzionante', () => {
    process.env.RESEND_API_KEY = 'rs_envkey';
    expect(() => createResendClient({})).not.toThrow();
  });

  afterEach(() => {
    // biome-ignore lint/performance/noDelete: process.env semantica
    delete process.env.RESEND_API_KEY;
  });
});

describe('sendEmail - happy path', () => {
  it('costruisce request POST verso /emails con Bearer + body', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'em_123abc' }),
    } as Response);

    const client = createResendClient({ apiKey: 'rs_test', fetcher: fetchSpy as typeof fetch });
    const r = await client.sendEmail({
      from: 'Premura <noreply@premura.it>',
      to: 'andrea@example.com',
      subject: 'Test',
      html: '<p>hi</p>',
      text: 'hi',
    });
    expect(r.id).toBe('em_123abc');
    expect(fetchSpy).toHaveBeenCalledOnce();
    const call = fetchSpy.mock.calls[0];
    if (!call) throw new Error('expected fetch call');
    const [url, init] = call;
    expect(url).toBe('https://api.resend.com/emails');
    expect((init as RequestInit).method).toBe('POST');
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer rs_test');
    expect(headers['Content-Type']).toBe('application/json');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.from).toBe('Premura <noreply@premura.it>');
    expect(body.to).toBe('andrea@example.com');
    expect(body.subject).toBe('Test');
    expect(body.html).toBe('<p>hi</p>');
    expect(body.text).toBe('hi');
  });

  it('replyTo + tags accodati al body', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'em_x' }),
    } as Response);
    const client = createResendClient({ apiKey: 'rs_test', fetcher: fetchSpy as typeof fetch });
    await client.sendEmail({
      from: 'Premura <noreply@premura.it>',
      to: 'a@b.com',
      subject: 's',
      replyTo: 'support@premura.it',
      tags: [{ name: 'kind', value: 'magic_link' }],
    });
    const call2 = fetchSpy.mock.calls[0];
    if (!call2 || !call2[1]) throw new Error('expected fetch call with init');
    const body = JSON.parse(call2[1].body as string);
    expect(body.reply_to).toBe('support@premura.it');
    expect(body.tags).toEqual([{ name: 'kind', value: 'magic_link' }]);
  });

  it('sendEmailViaResend convenience (env-based)', async () => {
    process.env.RESEND_API_KEY = 'rs_env';
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'em_envid' }),
    } as Response) as typeof fetch;
    try {
      const r = await sendEmailViaResend({
        from: 'noreply@premura.it',
        to: 'a@b.com',
        subject: 's',
      });
      expect(r.id).toBe('em_envid');
    } finally {
      global.fetch = originalFetch;
      // biome-ignore lint/performance/noDelete: process.env semantica
      delete process.env.RESEND_API_KEY;
    }
  });
});

describe('sendEmail - error paths', () => {
  it('Resend 4xx -> ResendClientError con statusCode', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      text: async () => '{"error":"bad recipient"}',
    } as Response);
    const client = createResendClient({ apiKey: 'rs_test', fetcher: fetchSpy as typeof fetch });
    await expect(
      client.sendEmail({ from: 'x', to: 'invalid', subject: 's' }),
    ).rejects.toMatchObject({
      name: 'ResendClientError',
      statusCode: 422,
    });
  });

  it('Network error -> ResendClientError con cause', async () => {
    const fetchSpy = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const client = createResendClient({ apiKey: 'rs_test', fetcher: fetchSpy as typeof fetch });
    await expect(client.sendEmail({ from: 'x', to: 'y', subject: 's' })).rejects.toThrow(
      ResendClientError,
    );
  });

  it('Response 200 senza id -> ResendClientError', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    } as Response);
    const client = createResendClient({ apiKey: 'rs_test', fetcher: fetchSpy as typeof fetch });
    await expect(client.sendEmail({ from: 'x', to: 'y', subject: 's' })).rejects.toThrow(
      /missing id/,
    );
  });
});

describe('Magic link templates', () => {
  it('subject costante italiano', () => {
    expect(MAGIC_LINK_SUBJECT).toBe('Accedi a Premura');
  });

  it('HTML contiene confirmationUrl + greeting personalizzato', () => {
    const html = buildMagicLinkHtml({
      confirmationUrl: 'https://premura.it/auth/callback?token=abc',
      recipientName: 'Andrea',
    });
    expect(html).toContain('https://premura.it/auth/callback?token=abc');
    expect(html).toContain('Ciao Andrea');
    expect(html).toContain('Premura');
    expect(html).toContain('lang="it"');
  });

  it('HTML senza recipientName -> greeting generico', () => {
    const html = buildMagicLinkHtml({
      confirmationUrl: 'https://x.example/cb',
    });
    expect(html).toContain('Ciao,');
    expect(html).not.toContain('Ciao Andrea');
  });

  it('HTML usa palette Premura + tipografia serif', () => {
    const html = buildMagicLinkHtml({ confirmationUrl: 'https://x' });
    expect(html).toContain('#C65D3A'); // terracotta
    expect(html).toContain('#1F3A4D'); // ink
    expect(html).toContain('Fraunces');
    expect(html).toContain('Inter');
  });

  it('plaintext contiene confirmationUrl + greeting', () => {
    const text = buildMagicLinkText({
      confirmationUrl: 'https://premura.it/auth/callback?token=abc',
      recipientName: 'Andrea',
    });
    expect(text).toContain('https://premura.it/auth/callback?token=abc');
    expect(text).toContain('Ciao Andrea');
    expect(text).toContain('— Premura');
  });

  it('brandName custom override (futuro multi-tenant)', () => {
    const html = buildMagicLinkHtml({
      confirmationUrl: 'https://x',
      brandName: 'La Goccia',
    });
    expect(html).toContain('La Goccia');
  });
});
