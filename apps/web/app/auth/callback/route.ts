import { ensureHostForAuthUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { NextResponse, type NextRequest } from "next/server";

// Handler GET del login: Supabase reindirizza qui sia dal magic link
// sia dal flusso OAuth Google (PKCE), con ?code=. Lo scambiamo in
// sessione (set-cookie via @supabase/ssr), garantiamo la riga hosts
// (Parte A: ensure idempotente — primo accesso = host creato qui) e
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
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=exchange_failed`);
  }

  // La riga hosts nasce QUI al primo accesso (idempotente: un secondo
  // login non duplica ne' sovrascrive). Best-effort: se il DB e'
  // irraggiungibile, getCurrentHostId() la ricrea alla prima pagina.
  if (data?.user) {
    try {
      const { db } = await getDb();
      await ensureHostForAuthUser(db, data.user);
    } catch (err) {
      console.error("[auth-callback] ensure host fallito (riprovera' lazy)", err);
    }
  }

  return NextResponse.redirect(`${origin}${next}`);
}
