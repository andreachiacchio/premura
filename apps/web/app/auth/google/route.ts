import { createSupabaseServerClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

// GET /auth/google — punto d'ingresso del "Continua con Google" della
// landing (A6, 05/08). Un <a> semplice invece di una server action:
// la landing resta un server component statico e il bottone funziona
// anche senza JS.
//
// Avvia il flusso PKCE: il client @supabase/ssr scrive il code
// verifier nei cookie di questa response, Google rimanda a
// /auth/callback che scambia il code e garantisce la riga hosts.
//
// Se il provider non e' disponibile si degrada al login (dove c'e'
// anche il magic link): mai un vicolo cieco.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<NextResponse> {
  const origin = new URL(request.url).origin;
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${origin}/auth/callback`,
      queryParams: { access_type: 'offline', prompt: 'select_account' },
    },
  });

  if (error || !data?.url) {
    console.error('[auth-google] signInWithOAuth fallito', error);
    return NextResponse.redirect(`${origin}/login?error=oauth_unavailable`);
  }

  return NextResponse.redirect(data.url, 302);
}
