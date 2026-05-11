import { verifyCleanerToken } from '@premura/agents';
import { cookies } from 'next/headers';

// Slice D — Cleaner session (cookie c_session, separato da Supabase Auth).
//
// Workflow:
//  1. /c/[token] verifica token JWT signed (verifyCleanerToken).
//  2. Set cookie c_session = token, httpOnly + secure + sameSite lax.
//  3. /c/dashboard, /c/kit/[id], ecc. leggono cookie + verify.
//  4. Logout: cancella cookie.

const COOKIE_NAME = 'c_session';
const COOKIE_MAX_AGE_SEC = 30 * 24 * 3600; // 30 giorni

export async function setCleanerSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: COOKIE_MAX_AGE_SEC,
  });
}

export async function clearCleanerSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export type CurrentCleaner =
  | { ok: true; cleanerId: string }
  | { ok: false; reason: 'no_cookie' | 'invalid_token' | 'expired' };

export async function getCurrentCleaner(): Promise<CurrentCleaner> {
  const store = await cookies();
  const cookie = store.get(COOKIE_NAME);
  if (!cookie?.value) return { ok: false, reason: 'no_cookie' };
  const verified = verifyCleanerToken(cookie.value);
  if (!verified.ok) {
    return {
      ok: false,
      reason: verified.reason === 'expired' ? 'expired' : 'invalid_token',
    };
  }
  return { ok: true, cleanerId: verified.payload.cid };
}
