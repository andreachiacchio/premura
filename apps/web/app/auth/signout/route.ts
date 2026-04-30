import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";

// Handler POST per il logout: form HTML semplice in DashboardHeader
// fa POST qui senza JS. Pulisce la sessione Supabase e redirect a
// /login (NextResponse.redirect su POST usa 303 See Other di default).

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();

  const { origin } = new URL(request.url);
  return NextResponse.redirect(`${origin}/login`, { status: 303 });
}
