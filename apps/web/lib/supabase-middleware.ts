import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

// Helper Supabase per il middleware Next.js. Pattern @supabase/ssr
// ufficiale (vedi https://supabase.com/docs/guides/auth/server-side/nextjs):
// quando setAll viene chiamato (Supabase ha refreshato il JWT), bisogna
// ricreare la NextResponse con i request.cookies aggiornati, altrimenti
// i cookie aggiornati NON arrivano al browser.
//
// Conseguenza: la response e' una closure mutabile. La esponiamo via
// getResponse() per evitare che il caller catturi un riferimento stale.
//
// Da NON usare nei server component (li' va createSupabaseServerClient
// di apps/web/lib/supabase-server.ts che lavora con next/headers).

export type SupabaseMiddlewareClient = {
  supabase: SupabaseClient;
  getResponse: () => NextResponse;
};

export function createSupabaseMiddlewareClient(
  request: NextRequest,
): SupabaseMiddlewareClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "[supabase-middleware] NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY mancanti.",
    );
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        // Step 1: aggiorna i cookie del request in-flight (cosi' una
        // successiva getAll() li vede).
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        // Step 2: ricrea la response con i request.cookies aggiornati.
        supabaseResponse = NextResponse.next({ request });
        // Step 3: setta i cookie sulla nuova response con le options
        // (httpOnly, sameSite, expires, ...).
        for (const { name, value, options } of cookiesToSet) {
          supabaseResponse.cookies.set(name, value, options);
        }
      },
    },
  });

  return {
    supabase,
    getResponse: () => supabaseResponse,
  };
}
