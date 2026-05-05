import { createSupabaseMiddlewareClient } from '@/lib/supabase-middleware';
import { type NextRequest, NextResponse } from 'next/server';

// Middleware Next.js: refresh sessione Supabase + protezione rotte
// privilegiate. Pattern @supabase/ssr ufficiale per Next 15.

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { supabase, getResponse } = createSupabaseMiddlewareClient(request);

  // Senza chiamata immediata a getUser() i cookie di refresh non vengono
  // propagati al browser e la sessione scade silenziosamente. Pattern
  // Supabase ssr ufficiale: getUser() prima di qualsiasi altra logica
  // del middleware.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname, search } = request.nextUrl;
  // Rotte protette: dashboard host + flusso connect-gmail + onboarding
  // (slice 9 prep). /api/* resta fuori, i route handler fanno auth
  // interna e ritornano 401.
  const isProtected =
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/connect-gmail') ||
    pathname.startsWith('/onboarding');
  if (isProtected && !user) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/login';
    redirectUrl.search = '';
    redirectUrl.searchParams.set('redirectTo', `${pathname}${search}`);
    return NextResponse.redirect(redirectUrl);
  }

  return getResponse();
}

// Matcher: tutte le route ECCETTO asset statici Next e file con
// estensione immagine. Include /api/* e /auth/* perche' il refresh
// sessione serve anche li' (es. /auth/callback deve avere cookie
// freschi prima di exchangeCodeForSession).
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
