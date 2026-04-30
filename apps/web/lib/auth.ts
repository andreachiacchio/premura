// Helper auth disaccoppiato.
//
// In slice 5 ritorna un host id hardcoded da env DEV_HOST_ID. La pagina
// /dashboard e le server actions importano sempre da qui per non doversi
// ricordare di rifattorizzare i call site quando arrivera Supabase Auth.
//
// TODO slice 6: sostituire l'implementazione con supabase.auth.getUser()
// lato server (cookies da next/headers). La firma resta identica.
// Vedi docs/m2a4-spec.md sezione 5.

const DEV_HOST_ENV = "DEV_HOST_ID";
const ALLOW_DEV_ENV = "ALLOW_DEV_HOST";

/**
 * Ritorna l'host id dell'utente corrente.
 *
 * Implementazione provvisoria slice 5: legge process.env.DEV_HOST_ID.
 * In production lancia errore a meno che ALLOW_DEV_HOST=1 sia esplicitamente
 * impostato (escape hatch per smoke test su staging).
 *
 * Da chiamare solo lato server (server component, server action, route
 * handler). Lanciarla in un client component fallirebbe perche le env non
 * prefissate NEXT_PUBLIC_ non sono leggibili dal browser, ma il throw qui
 * sotto la rende comunque sicura.
 */
export function getCurrentHostId(): string {
  const isProd = process.env.NODE_ENV === "production";
  if (isProd && process.env[ALLOW_DEV_ENV] !== "1") {
    throw new Error(
      "[auth] getCurrentHostId chiamato in production senza ALLOW_DEV_HOST=1. " +
        "Slice 6 sostituira questo helper con supabase.auth.getUser().",
    );
  }
  const hostId = process.env[DEV_HOST_ENV];
  if (!hostId) {
    throw new Error(
      `[auth] env var ${DEV_HOST_ENV} mancante. Imposta in .env.local con il tuo host_id Supabase.`,
    );
  }
  return hostId;
}
