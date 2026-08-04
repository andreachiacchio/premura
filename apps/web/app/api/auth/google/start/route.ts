import { getCurrentHost } from '@/lib/auth';
import { buildAuthUrl } from '@/lib/google-oauth';
import { NextResponse } from 'next/server';

// GET /api/auth/google/start
//
// Redirect 302 a Google consent screen con state CSRF firmato.
// Parte A (04/08, A4): l'hostId deriva SEMPRE dalla sessione Supabase.
// La query string non viene letta: prima bastava un link con l'hostId
// di un altro per far finire i token Gmail sull'account sbagliato.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<NextResponse> {
  const origin = new URL(request.url).origin;

  let hostId: string;
  try {
    const host = await getCurrentHost();
    hostId = host.id;
  } catch {
    // Nessuna sessione: si passa dal login e si torna qui.
    return NextResponse.redirect(
      `${origin}/login?redirectTo=${encodeURIComponent('/connect-gmail')}`,
      302,
    );
  }

  // Controllo esplicito PRIMA di provare (richiesta Andrea 30/07):
  // "configurazione server incompleta" senza dire cosa manca fa solo
  // perdere tempo. I NOMI delle variabili non sono segreti; i valori
  // non escono mai.
  const REQUIRED_ENV = [
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'APP_URL',
    'TOKEN_ENCRYPTION_KEY',
  ] as const;
  const missing = REQUIRED_ENV.filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) {
    console.error('[google-oauth-start] variabili mancanti', { missing });
    return NextResponse.json(
      { error: 'configurazione server incompleta', variabili_mancanti: missing },
      { status: 500 },
    );
  }

  try {
    const authUrl = await buildAuthUrl(hostId);
    return NextResponse.redirect(authUrl, 302);
  } catch (err) {
    console.error('[google-oauth-start] buildAuthUrl failed', err);
    return NextResponse.json(
      { error: 'configurazione server incompleta' },
      { status: 500 },
    );
  }
}
