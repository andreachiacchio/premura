import { NextResponse } from 'next/server';
import { buildAuthUrl } from '@/lib/google-oauth';

// GET /api/auth/google/start?hostId=<uuid>
//
// Redirect 302 a Google consent screen con state CSRF firmato.
// In M2a.3 Fase 1 il hostId arriva via query string (chi visita
// /connect-gmail è Andrea durante dev). In M2a.2 verrà letto dalla
// session auth e la query sarà ignorata/rimossa.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isValidUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const hostId = url.searchParams.get('hostId');

  if (!hostId || !isValidUuid(hostId)) {
    return NextResponse.json(
      { error: 'hostId mancante o non valido (atteso uuid)' },
      { status: 400 },
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
