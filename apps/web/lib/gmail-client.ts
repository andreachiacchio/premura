import { google, type gmail_v1 } from 'googleapis';
import type { ServerClient } from '@premura/db';
import { getTokenByHostAndEmail } from './repositories/google-tokens';

// Wrapper sottile sopra gmail.users.messages.* per il sync M2a.3 Fase 2.
//
// Responsabilità:
//   - createGmailClient: legge google_tokens, decifra refresh_token,
//     instanzia google.auth.OAuth2 + Gmail API client tipizzato.
//   - searchAirbnbEmails: lista message ID inviati da automated@airbnb.com
//     negli ultimi N giorni (paginazione automatica).
//   - fetchEmailContent: estrae subject, from, date, htmlBody, textBody
//     da un singolo messaggio MIME-decoded.
//
// Nota refresh token: googleapis refresha automaticamente l'access_token
// usando il refresh_token quando questo è settato. Per M2a.3 Fase 2 NON
// persistiamo l'access_token rinnovato (fail-fast se scade tra start e
// fine sync è M2a.3 Fase 4).
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

  // Usiamo google.auth.OAuth2 (esposto da googleapis) invece di
  // OAuth2Client da google-auth-library per evitare mismatch tra le
  // due copie della libreria — il check interno di googleapis sull'auth
  // client fallisce silenziosamente con istanze "esterne" e non aggiunge
  // l'header Authorization, con conseguente 401 "Login Required".
  const oauth = new google.auth.OAuth2(clientId, clientSecret);
  oauth.setCredentials({
    access_token: token.accessToken,
    refresh_token: token.refreshToken,
    expiry_date: token.expiresAt.getTime(),
    scope: token.scope,
    token_type: 'Bearer',
  });

  const api = google.gmail({ version: 'v1', auth: oauth });
  return { api, hostId, googleEmail };
}

// ─────────────────────────────────────────────────────────────
// Search emails (generico + wrapper per ogni piattaforma)
// ─────────────────────────────────────────────────────────────

const AIRBNB_FROM = 'automated@airbnb.com';
const BOOKING_FROM = 'noreply@booking.com';

// Hard cap pagine: 500 email = ~10 pagine. Se serve di più è sintomo di
// sync iniziale enorme e va gestito a livello orchestrator.
const SEARCH_MAX_PAGES = 10;

// Funzione generica: lista i message ID risultanti da una qualsiasi query
// Gmail. Paginazione automatica via pageToken.
//
// Esposta come building block per i wrapper specifici (Airbnb, Booking).
// Non espone validazione di daysBack; chi la chiama costruisce la query
// finale e si occupa dell'input sanitization.
export async function searchEmailsByQuery(
  client: GmailClient,
  query: string,
  options: { pageSize?: number } = {},
): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined = undefined;
  const pageSize = options.pageSize ?? 50;
  for (let page = 0; page < SEARCH_MAX_PAGES; page++) {
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

// Lista i message ID delle email Airbnb ricevute negli ultimi `daysBack`
// giorni. Paginazione automatica via pageToken.
//
// Query Gmail "from:automated@airbnb.com after:YYYY-MM-DD". L'operatore
// after:YYYY-MM-DD è inclusivo della data alle 00:00 UTC.
//
// Thin wrapper su searchEmailsByQuery: la signature pubblica resta
// invariata per non rompere chiamanti esistenti (orchestrator + test).
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

  return searchEmailsByQuery(client, query, { pageSize: options.pageSize });
}

// Lista i message ID delle email Booking.com ricevute negli ultimi
// `daysBack` giorni (M2a.3 Fase 3).
//
// Query Gmail "from:noreply@booking.com newer_than:Nd". `newer_than`
// è la sintassi Gmail per "negli ultimi N giorni" (più semplice di
// after:YYYY-MM-DD a parità di risultato).
export async function searchBookingEmails(
  client: GmailClient,
  daysBack: number,
  options: { pageSize?: number } = {},
): Promise<string[]> {
  if (!Number.isFinite(daysBack) || daysBack <= 0) {
    throw new GmailClientError(`daysBack deve essere intero positivo (ricevuto ${daysBack})`);
  }
  const query = `from:${BOOKING_FROM} newer_than:${Math.floor(daysBack)}d`;
  return searchEmailsByQuery(client, query, { pageSize: options.pageSize });
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
  BOOKING_FROM,
  extractBodies,
  headerValue,
};
