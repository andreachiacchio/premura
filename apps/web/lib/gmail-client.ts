import { google, type gmail_v1 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import type { ServerClient } from '@premura/db';
import { getTokenByHostAndEmail } from './repositories/google-tokens';

// Wrapper sottile sopra gmail.users.messages.* per il sync M2a.3 Fase 2.
//
// Responsabilità:
//   - createGmailClient: legge google_tokens, decifra refresh_token,
//     instanzia OAuth2Client + Gmail API client tipizzato.
//   - searchAirbnbEmails: lista message ID inviati da automated@airbnb.com
//     negli ultimi N giorni (paginazione automatica).
//   - fetchEmailContent: estrae subject, from, date, htmlBody, textBody
//     da un singolo messaggio MIME-decoded.
//
// Nota refresh token: la libreria google-auth-library refresha
// automaticamente l'access_token usando il refresh_token quando questo è
// settato. Per M2a.3 Fase 2 NON persistiamo l'access_token rinnovato
// (fail-fast se scade tra start e fine sync è M2a.3 Fase 4).
//
// Errori: GmailClientError per errori di setup; le chiamate API lasciano
// passare l'errore originale di googleapis (ricco di status code).

export class GmailClientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GmailClientError';
  }
}

export type GmailClient = {
  // Riferimento all'istanza tipizzata. Esposto per consentire test col
  // mocking diretto.
  api: gmail_v1.Gmail;
  hostId: string;
  googleEmail: string;
};

// Crea client Gmail per un host. Usa il refresh_token persistito.
// Se non esiste token per (hostId, googleEmail) → GmailClientError.
export async function createGmailClient(
  serverClient: ServerClient,
  hostId: string,
  googleEmail: string,
): Promise<GmailClient> {
  const token = await getTokenByHostAndEmail(serverClient.db, hostId, googleEmail);
  if (!token) {
    throw new GmailClientError(
      `Nessun google_tokens per host=${hostId} email=${googleEmail}. L'host deve completare il flow OAuth prima.`,
    );
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new GmailClientError(
      'GOOGLE_CLIENT_ID o GOOGLE_CLIENT_SECRET mancanti — non posso instanziare OAuth2Client.',
    );
  }

  const oauth = new OAuth2Client({ clientId, clientSecret });
  oauth.setCredentials({
    access_token: token.accessToken,
    refresh_token: token.refreshToken,
    expiry_date: token.expiresAt.getTime(),
    scope: token.scope,
    token_type: 'Bearer',
  });

  // Cast a unknown perché googleapis pinna una propria copia di
  // OAuth2Client che non sempre matcha esattamente la versione esportata
  // da google-auth-library (mismatch sui metodi interni come `fetch`).
  // A runtime è lo stesso oggetto.
  const api = google.gmail({ version: 'v1', auth: oauth } as unknown as Parameters<typeof google.gmail>[0]);
  return { api, hostId, googleEmail };
}

// ─────────────────────────────────────────────────────────────
// Search emails Airbnb
// ─────────────────────────────────────────────────────────────

const AIRBNB_FROM = 'automated@airbnb.com';

// Lista i message ID delle email Airbnb ricevute negli ultimi `daysBack`
// giorni. Paginazione automatica via pageToken.
//
// Query Gmail "from:automated@airbnb.com after:YYYY-MM-DD". L'operatore
// after:YYYY-MM-DD è inclusivo della data alle 00:00 UTC.
export async function searchAirbnbEmails(
  client: GmailClient,
  daysBack: number,
  options: { now?: Date; pageSize?: number } = {},
): Promise<string[]> {
  if (!Number.isFinite(daysBack) || daysBack <= 0) {
    throw new GmailClientError(`daysBack deve essere intero positivo (ricevuto ${daysBack})`);
  }

  const now = options.now ?? new Date();
  const after = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000);
  const yyyy = after.getUTCFullYear();
  const mm = String(after.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(after.getUTCDate()).padStart(2, '0');
  const query = `from:${AIRBNB_FROM} after:${yyyy}/${mm}/${dd}`;

  const ids: string[] = [];
  let pageToken: string | undefined = undefined;
  // Hard cap di sicurezza: 500 email = ~10 pagine. Se serve di più, è
  // sintomo di sync iniziale enorme e va gestito a livello orchestrator.
  const MAX_PAGES = 10;
  const pageSize = options.pageSize ?? 50;
  for (let page = 0; page < MAX_PAGES; page++) {
    const res: { data: { messages?: Array<{ id?: string | null }>; nextPageToken?: string | null } } =
      await client.api.users.messages.list({
        userId: 'me',
        q: query,
        maxResults: pageSize,
        pageToken,
      });
    const messages = res.data.messages ?? [];
    for (const m of messages) {
      if (m.id) ids.push(m.id);
    }
    if (!res.data.nextPageToken) break;
    pageToken = res.data.nextPageToken;
  }
  return ids;
}

// ─────────────────────────────────────────────────────────────
// Fetch email content
// ─────────────────────────────────────────────────────────────

export type EmailContent = {
  messageId: string;
  subject: string;
  from: string;
  date: Date | null;
  htmlBody: string;
  textBody: string;
  // Snippet 200 char restituito da Gmail API (utile per quick preview senza
  // parse del corpo intero).
  snippet: string;
};

export async function fetchEmailContent(
  client: GmailClient,
  messageId: string,
): Promise<EmailContent> {
  const res = await client.api.users.messages.get({
    userId: 'me',
    id: messageId,
    format: 'full',
  });
  const msg = res.data;
  const headers = msg.payload?.headers ?? [];
  const subject = headerValue(headers, 'Subject') ?? '';
  const from = headerValue(headers, 'From') ?? '';
  const dateHeader = headerValue(headers, 'Date');
  const date = dateHeader ? safeParseDate(dateHeader) : null;

  const { html, text } = extractBodies(msg.payload ?? null);
  return {
    messageId,
    subject,
    from,
    date,
    htmlBody: html,
    textBody: text,
    snippet: msg.snippet ?? '',
  };
}

function headerValue(
  headers: gmail_v1.Schema$MessagePartHeader[],
  name: string,
): string | undefined {
  const lower = name.toLowerCase();
  for (const h of headers) {
    if (h.name?.toLowerCase() === lower) return h.value ?? undefined;
  }
  return undefined;
}

function safeParseDate(s: string): Date | null {
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Estrae html + text dal MIME tree. Supporta:
//   - parts singoli (text/plain o text/html)
//   - multipart/alternative (text + html)
//   - multipart/mixed (con allegati: pesca solo le parti testuali)
//   - multipart/related (Airbnb usa questo per inline images)
// Decodifica base64url → utf8.
function extractBodies(
  payload: gmail_v1.Schema$MessagePart | null,
): { html: string; text: string } {
  let html = '';
  let text = '';
  function walk(part: gmail_v1.Schema$MessagePart): void {
    const mime = part.mimeType ?? '';
    const data = part.body?.data;
    if (data && (mime === 'text/html' || mime === 'text/plain')) {
      const decoded = Buffer.from(data, 'base64').toString('utf8');
      if (mime === 'text/html') html += decoded;
      else text += decoded;
    }
    for (const sub of part.parts ?? []) walk(sub);
  }
  if (payload) walk(payload);
  return { html, text };
}

export const _internals = {
  AIRBNB_FROM,
  extractBodies,
  headerValue,
};
