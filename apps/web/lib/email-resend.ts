// Slice 6.5.1 — Resend email client (ready-to-deploy).
//
// Wrapper minimale del REST API Resend (https://resend.com/docs/api/emails).
// Niente dipendenza npm `resend` SDK: usiamo fetch direttamente. Cosi' il
// codice resta dormant senza package install fino a quando Andrea
// fornisce RESEND_API_KEY + completa setup DNS premura.it (vedi
// docs/SLICE-6-5-DEBTS.md §6.5.1).
//
// Use case Premura attuali: email transazionali host (notifiche
// fuori-app, alert urgenti). Magic link auth Supabase passa per SMTP
// (configurabile direttamente in Supabase Auth Settings con
// credenziali Resend SMTP standard, niente codice).

export class ResendClientError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'ResendClientError';
  }
}

export type ResendEmailInput = {
  from: string; // es. "Premura <noreply@premura.it>"
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string;
  tags?: Array<{ name: string; value: string }>;
};

export type ResendEmailResult = {
  id: string;
};

const RESEND_API_BASE = 'https://api.resend.com';

// Singleton fetcher. Override-able per test (passa fetch mock).
export type ResendClient = {
  sendEmail(input: ResendEmailInput): Promise<ResendEmailResult>;
};

export function createResendClient(options: {
  apiKey?: string;
  fetcher?: typeof fetch;
}): ResendClient {
  const apiKey = options.apiKey ?? process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new ResendClientError(
      'RESEND_API_KEY mancante. Vedi docs/SLICE-6-5-DEBTS.md §6.5.1 per il setup.',
    );
  }
  const fetcher = options.fetcher ?? fetch;

  return {
    async sendEmail(input: ResendEmailInput): Promise<ResendEmailResult> {
      const body: Record<string, unknown> = {
        from: input.from,
        to: input.to,
        subject: input.subject,
      };
      if (input.html) body.html = input.html;
      if (input.text) body.text = input.text;
      if (input.replyTo) body.reply_to = input.replyTo;
      if (input.tags) body.tags = input.tags;

      let response: Response;
      try {
        response = await fetcher(`${RESEND_API_BASE}/emails`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(body),
        });
      } catch (err) {
        throw new ResendClientError('Network error calling Resend', undefined, err);
      }

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new ResendClientError(
          `Resend API ${response.status}: ${text || '(no body)'}`,
          response.status,
        );
      }

      const json = (await response.json()) as { id?: string };
      if (!json.id) {
        throw new ResendClientError('Resend response missing id field');
      }
      return { id: json.id };
    },
  };
}

// Helper convenience: instanzia client da env + manda email. Throw
// ResendClientError se env mancante o API fail.
export async function sendEmailViaResend(input: ResendEmailInput): Promise<ResendEmailResult> {
  const client = createResendClient({});
  return client.sendEmail(input);
}
