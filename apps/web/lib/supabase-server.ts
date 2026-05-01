import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";

// Client Supabase cookie-aware per i server component, server action,
// route handler. Usa @supabase/ssr per leggere/scrivere i cookie via
// l'API next/headers (sessione persistente, refresh automatico del JWT).
//
// Da chiamare SOLO lato server. Per query server-side che vogliono
// bypassare RLS (es. job di background) si continua a usare getDb()
// in apps/web/lib/db.ts che apre una pool postgres separata.

export async function createSupabaseServerClient(): Promise<SupabaseClient> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "[supabase-server] NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY mancanti.",
    );
  }

  const cookieStore = await cookies();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        // In Next 15 la mutazione dei cookie da server component lancia,
        // ma da server action / route handler funziona. Catch silenzioso
        // copre il caso server component (la sessione si refresha al
        // prossimo round-trip via middleware).
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // no-op: chiamato da contesto read-only (server component)
        }
      },
    },
  });
}
