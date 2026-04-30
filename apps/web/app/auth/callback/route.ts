import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";

// Handler GET del magic link: Supabase reindirizza qui dopo che
// l'utente ha cliccato il link nell'email, con ?code=<otp_code>.
// Lo scambiamo in sessione (set-cookie via @supabase/ssr) e
// reindirizziamo a /dashboard.
//
// In caso di errore (code mancante o exchange fallito), redirect
// a /login?error=<reason>: LoginForm mostrera' il messaggio italiano
// corrispondente.

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=exchange_failed`);
  }

  return NextResponse.redirect(`${origin}/dashboard`);
}
