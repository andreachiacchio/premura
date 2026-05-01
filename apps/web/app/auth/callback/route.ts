import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";

// Handler GET del magic link: Supabase reindirizza qui dopo che
// l'utente ha cliccato il link nell'email, con ?code=<otp_code>.
// Lo scambiamo in sessione (set-cookie via @supabase/ssr) e
// reindirizziamo al path richiesto (?next=) o a /dashboard.
//
// In caso di errore (code mancante o exchange fallito), redirect
// a /login?error=<reason>: LoginForm mostrera' il messaggio italiano
// corrispondente.

export const dynamic = "force-dynamic";

// Difesa contro open redirect: il param ?next= viene passato senza
// state lato server attraverso emailRedirectTo, quindi un attaccante
// puo' tentare di costruire un magic link con next malizioso. La
// validazione qui rifiuta tutto cio' che non e' un path relativo
// breve e ben formato.
export function safeNext(next: string | null): string {
  if (!next) return "/dashboard";
  if (next.length > 200) return "/dashboard";
  if (!next.startsWith("/") || next.startsWith("//")) return "/dashboard";
  try {
    decodeURIComponent(next);
  } catch {
    return "/dashboard";
  }
  return next;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=exchange_failed`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
