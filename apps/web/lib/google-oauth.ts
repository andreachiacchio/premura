import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';
import { SignJWT, jwtVerify, errors as joseErrors } from 'jose';

// ─────────────────────────────────────────────────────────────
// Libreria OAuth Google per Premura (milestone M2a.3 Fase 1).
//
// Responsabilità:
//   - buildAuthUrl(hostId): genera URL consent screen con state CSRF firmato.
//   - exchangeCodeForTokens(code, state): valida state, scambia code per
//     token, decodifica id_token per ricavare l'email Gmail.
//   - encryptToken / decryptToken: AES-256-GCM per persistenza sicura.
//
// Dipendenze esterne:
//   - google-auth-library (solo OAuth2Client; no googleapis intero).
//   - jose (HS256 JWT per state CSRF, 10 min TTL).
//
// Chiave simmetrica (env TOKEN_ENCRYPTION_KEY, 32 byte base64) usata
// sia per AES dei token sia per HMAC del JWT state. Se leaked, entrambi
// compromessi; separare le chiavi è YAGNI per ora.
// ─────────────────────────────────────────────────────────────

const CIPHER_ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

const STATE_JWT_ALG = 'HS256';
const STATE_TTL_SECONDS = 600; // 10 min

const GOOGLE_OAUTH_SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/gmail.readonly',
];

// ─────────────────────────────────────────────────────────────
// Env loading
// ─────────────────────────────────────────────────────────────

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === '') {
    throw new Error(`[google-oauth] env ${name} mancante`);
  }
  return v;
}

function getEncryptionKey(): Buffer {
  const raw = requireEnv('TOKEN_ENCRYPTION_KEY');
  const buf = Buffer.from(raw, 'base64');
  if (buf.length !== 32) {
    throw new Error(
      `[google-oauth] TOKEN_ENCRYPTION_KEY deve essere 32 byte base64 (ricevuto ${buf.length}). Genera con: openssl rand -base64 32`,
    );
  }
  return buf;
}

function getStateKey(): Uint8Array {
  // Stessa chiave di AES (jose accetta Uint8Array per HS256).
  return new Uint8Array(getEncryptionKey());
}

function createOAuthClient(): OAuth2Client {
  const clientId = requireEnv('GOOGLE_CLIENT_ID');
  const clientSecret = requireEnv('GOOGLE_CLIENT_SECRET');
  const appUrl = requireEnv('APP_URL');
  return new OAuth2Client({
    clientId,
    clientSecret,
    redirectUri: `${appUrl}/api/auth/google/callback`,
  });
}

// ─────────────────────────────────────────────────────────────
// Encrypt / Decrypt token (AES-256-GCM)
// Formato storage: base64( iv[12] || authTag[16] || ciphertext )
// ─────────────────────────────────────────────────────────────

export function encryptToken(plaintext: string): string {
  if (typeof plaintext !== 'string' || plaintext === '') {
    throw new Error('[google-oauth] encryptToken: plaintext vuoto');
  }
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(CIPHER_ALGORITHM, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString('base64');
}

export function decryptToken(encrypted: string): string {
  if (typeof encrypted !== 'string' || encrypted === '') {
    throw new Error('[google-oauth] decryptToken: input vuoto');
  }
  const buf = Buffer.from(encrypted, 'base64');
  if (buf.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) {
    throw new Error('[google-oauth] decryptToken: ciphertext troppo corto');
  }
  const iv = buf.subarray(0, IV_LENGTH);
  const tag = buf.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ct = buf.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const key = getEncryptionKey();
  const decipher = createDecipheriv(CIPHER_ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  try {
    const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
    return pt.toString('utf8');
  } catch {
    throw new Error('[google-oauth] decryptToken: auth tag mismatch (ciphertext manomesso o key errata)');
  }
}

// ─────────────────────────────────────────────────────────────
// State CSRF (JWT HS256, TTL 10 min)
// Payload: { hostId, nonce }
// ─────────────────────────────────────────────────────────────

export type StatePayload = {
  hostId: string;
  nonce: string;
};

export async function signState(payload: StatePayload): Promise<string> {
  const key = getStateKey();
  return await new SignJWT({ hostId: payload.hostId, nonce: payload.nonce })
    .setProtectedHeader({ alg: STATE_JWT_ALG })
    .setIssuedAt()
    .setExpirationTime(`${STATE_TTL_SECONDS}s`)
    .sign(key);
}

export class StateInvalidError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StateInvalidError';
  }
}

export async function verifyState(token: string): Promise<StatePayload> {
  if (!token || typeof token !== 'string') {
    throw new StateInvalidError('state token mancante');
  }
  const key = getStateKey();
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: [STATE_JWT_ALG] });
    const hostId = typeof payload.hostId === 'string' ? payload.hostId : null;
    const nonce = typeof payload.nonce === 'string' ? payload.nonce : null;
    if (!hostId || !nonce) {
      throw new StateInvalidError('state payload senza hostId o nonce');
    }
    return { hostId, nonce };
  } catch (err) {
    if (err instanceof StateInvalidError) throw err;
    if (err instanceof joseErrors.JWTExpired) {
      throw new StateInvalidError('state scaduto');
    }
    if (err instanceof joseErrors.JWSSignatureVerificationFailed) {
      throw new StateInvalidError('state firma invalida');
    }
    if (err instanceof joseErrors.JWSInvalid || err instanceof joseErrors.JWTInvalid) {
      throw new StateInvalidError('state malformato');
    }
    throw new StateInvalidError(
      err instanceof Error ? `state invalido: ${err.message}` : 'state invalido',
    );
  }
}

// ─────────────────────────────────────────────────────────────
// Build OAuth URL
// ─────────────────────────────────────────────────────────────

export async function buildAuthUrl(hostId: string): Promise<string> {
  if (!hostId || typeof hostId !== 'string') {
    throw new Error('[google-oauth] buildAuthUrl: hostId obbligatorio');
  }
  const nonce = randomBytes(16).toString('hex');
  const state = await signState({ hostId, nonce });
  const client = createOAuthClient();
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: GOOGLE_OAUTH_SCOPES,
    state,
    // include_granted_scopes riduce le richieste successive, ma qui forziamo
    // consent ogni volta per garantire refresh_token sempre presente.
    include_granted_scopes: true,
  });
}

// ─────────────────────────────────────────────────────────────
// Exchange code for tokens
// ─────────────────────────────────────────────────────────────

export class TokenExchangeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TokenExchangeError';
  }
}

export type ExchangedTokens = {
  hostId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  googleEmail: string;
  scope: string;
};

export async function exchangeCodeForTokens(
  code: string,
  state: string,
): Promise<ExchangedTokens> {
  if (!code || typeof code !== 'string') {
    throw new TokenExchangeError('code mancante');
  }

  // Step 1: valida state, estrai hostId.
  const { hostId } = await verifyState(state);

  // Step 2: scambia code con Google.
  const client = createOAuthClient();
  let tokens: Awaited<ReturnType<OAuth2Client['getToken']>>['tokens'];
  try {
    const res = await client.getToken(code);
    tokens = res.tokens;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new TokenExchangeError(`Google token endpoint error: ${message}`);
  }

  if (!tokens.access_token) {
    throw new TokenExchangeError('access_token mancante nella risposta Google');
  }
  if (!tokens.refresh_token) {
    // Succede se l'utente ha già consentito prima senza revoca; buildAuthUrl
    // forza prompt=consent per evitarlo, ma un utente manualmente sul
    // consent screen può ancora saltare.
    throw new TokenExchangeError(
      'refresh_token mancante — l\'utente deve revocare l\'accesso esistente su myaccount.google.com/permissions e riprovare',
    );
  }
  if (!tokens.expiry_date) {
    throw new TokenExchangeError('expiry_date mancante nella risposta Google');
  }
  if (!tokens.id_token) {
    throw new TokenExchangeError('id_token mancante — scope openid non concesso?');
  }

  // Step 3: decodifica id_token per l'email (no chiamata extra a userinfo).
  let googleEmail: string;
  try {
    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const email = payload?.email;
    if (!email || payload?.email_verified !== true) {
      throw new TokenExchangeError('email Google non verificata o assente nell\'id_token');
    }
    googleEmail = email;
  } catch (err) {
    if (err instanceof TokenExchangeError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    throw new TokenExchangeError(`id_token verification failed: ${message}`);
  }

  return {
    hostId,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: new Date(tokens.expiry_date),
    googleEmail,
    scope: tokens.scope ?? GOOGLE_OAUTH_SCOPES.join(' '),
  };
}

// ─────────────────────────────────────────────────────────────
// Esposti per test: costanti interne
// ─────────────────────────────────────────────────────────────

export const _internals = {
  GOOGLE_OAUTH_SCOPES,
  IV_LENGTH,
  AUTH_TAG_LENGTH,
  STATE_TTL_SECONDS,
  STATE_JWT_ALG,
};
