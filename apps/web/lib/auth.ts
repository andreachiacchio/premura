import { createSupabaseServerClient } from "@/lib/supabase-server";

// Helper auth: ritorna l'host id dell'utente Supabase corrente.
//
// Slice 6: auth.users.id == host_id direttamente (no tabella ponte hosts).
// La query e' fatta via createSupabaseServerClient che legge la sessione
// dai cookie (cookie-aware via @supabase/ssr).
//
// Throw se non autenticato: il middleware redirect a /login prima che
// chiunque arrivi qui, ma il throw e' un'ulteriore difesa per evitare
// di leggere accidentalmente undefined/null come host_id valido.
//
// Da chiamare solo lato server. La firma e' Promise<string> perche'
// supabase.auth.getUser() e' async (verifica il JWT contro Supabase).

export async function getCurrentHostId(): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error) {
    throw new Error(`[auth] supabase.auth.getUser failed: ${error.message}`);
  }
  if (!user) {
    throw new Error(
      "[auth] nessun utente autenticato. Il middleware dovrebbe aver " +
        "redirezionato a /login prima di arrivare qui.",
    );
  }
  return user.id;
}
