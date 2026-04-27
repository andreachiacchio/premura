import { NextResponse } from 'next/server';
import { createServerClient, type ServerClient } from '@premura/db';
import {
  StateInvalidError,
  TokenExchangeError,
  exchangeCodeForTokens,
} from '@/lib/google-oauth';
import { upsertToken } from '@/lib/repositories/google-tokens';

// GET /api/auth/google/callback?code=...&state=...
//
// Callback endpoint registrato su Google Cloud Console. Riceve il code,
// valida lo state, scambia con Google, cifra i token e fa upsert su
// google_tokens. Ogni errore diventa redirect a /connect-gmail/error
// con reason="state_invalid" | "exchange_failed" | "user_denied".

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Singleton lazy del DB client tra invocation della stessa istanza serverless.
let clientPromise: Promise<ServerClient> | null = null;
function getClient(): Promise<ServerClient> {
  if (!clientPromise) clientPromise = Promise.resolve(createServerClient());
  return clientPromise;
}

function redirectError(
  origin: string,
  reason: 'state_invalid' | 'exchange_failed' | 'user_denied',
): NextResponse {
  const url = new URL('/connect-gmail/error', origin);
  url.searchParams.set('reason', reason);
  return NextResponse.redirect(url, 302);
}

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const origin = url.origin;

  // Google aggiunge ?error=access_denied se l'utente nega il consenso.
  const errorParam = url.searchParams.get('error');
  if (errorParam) {
    console.warn('[google-oauth-callback] user denied', { error: errorParam });
    return redirectError(origin, 'user_denied');
  }

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  if (!code || !state) {
    return redirectError(origin, 'state_invalid');
  }

  let exchanged: Awaited<ReturnType<typeof exchangeCodeForTokens>>;
  try {
    exchanged = await exchangeCodeForTokens(code, state);
  } catch (err) {
    if (err instanceof StateInvalidError) {
      console.warn('[google-oauth-callback] state invalid', { message: err.message });
      return redirectError(origin, 'state_invalid');
    }
    if (err instanceof TokenExchangeError) {
      console.error('[google-oauth-callback] token exchange failed', { message: err.message });
      return redirectError(origin, 'exchange_failed');
    }
    console.error('[google-oauth-callback] unexpected error', err);
    return redirectError(origin, 'exchange_failed');
  }

  try {
    const { db } = await getClient();
    await upsertToken(db, {
      hostId: exchanged.hostId,
      googleEmail: exchanged.googleEmail,
      accessToken: exchanged.accessToken,
      refreshToken: exchanged.refreshToken,
      expiresAt: exchanged.expiresAt,
      scope: exchanged.scope,
    });
  } catch (err) {
    console.error('[google-oauth-callback] DB upsert failed', err);
    return redirectError(origin, 'exchange_failed');
  }

  // Successo: passa l'email collegata al frontend via query string.
  // La success page legge queste info (NON persistite in cookie, solo
  // per la singola view post-redirect).
  const successUrl = new URL('/connect-gmail/success', origin);
  successUrl.searchParams.set('email', exchanged.googleEmail);
  successUrl.searchParams.set('connectedAt', new Date().toISOString());
  return NextResponse.redirect(successUrl, 302);
}
