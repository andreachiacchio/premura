// Client wrapper Supabase + Drizzle.
//
// Esponiamo due factory:
//   - createServerClient()  → backend (apps/api). Ha SECRET KEY quindi
//                             bypassa RLS. Ritorna Drizzle client tipizzato
//                             sullo schema + admin Supabase per auth/storage.
//   - createBrowserClient() → frontend (apps/web). Ha solo PUBLISHABLE KEY,
//                             soggetta a RLS lato Supabase. Ritorna client
//                             Supabase-js (non Drizzle: il browser non può
//                             aprire connessioni Postgres direttamente).
//
// Configurazione via env vars (niente chiavi hardcoded):
//   DATABASE_URL              connection string Postgres (server only)
//   SUPABASE_URL              endpoint REST Supabase
//   SUPABASE_SECRET_KEY       service role, solo server
//   SUPABASE_PUBLISHABLE_KEY  anon, esponibile al browser

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';

import * as schema from './schema';

// ─────────────────────────────────────────────────────────────
// Tipi pubblici
// ─────────────────────────────────────────────────────────────

// Drizzle client tipizzato con lo schema completo v2.
// Tutte le query (db.query.bookings.findMany ecc.) ereditano i tipi dalle
// tabelle definite in ./schema/*.
export type Database = ReturnType<typeof drizzle<typeof schema>>;

// Bundle ritornato da createServerClient().
export type ServerClient = {
  db: Database;
  // Client Supabase con service role key. Usato per auth admin, storage,
  // realtime. Null se SUPABASE_URL o SUPABASE_SECRET_KEY non sono
  // configurate (utile in ambienti locali senza Supabase, es. CI test).
  admin: SupabaseClient | null;
  // Chiude la pool Postgres sottostante. Chiamare su shutdown del server.
  close: () => Promise<void>;
};

// Opzioni override per test o ambienti custom.
export type ServerClientConfig = {
  connectionString?: string;
  supabaseUrl?: string;
  supabaseSecretKey?: string;
  // Override opzioni postgres (es. max connessioni pool, prepared statements).
  postgresOptions?: Parameters<typeof postgres>[1];
};

export type BrowserClientConfig = {
  supabaseUrl?: string;
  supabasePublishableKey?: string;
};

// ─────────────────────────────────────────────────────────────
// Server client
// ─────────────────────────────────────────────────────────────

// Crea il client DB per il backend.
// Apre una pool Postgres via driver `postgres` e la avvolge con Drizzle.
// Non committa transazioni automaticamente: ogni caller gestisce il proprio
// ciclo di vita della transazione tramite `db.transaction(...)`.
//
// ATTENZIONE: non chiamare al top-level di un modulo. La factory va invocata
// in un lifecycle controllato (startup Fastify) così possiamo chiudere la
// pool via `close()` su shutdown.
export function createServerClient(config: ServerClientConfig = {}): ServerClient {
  const connectionString = config.connectionString ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      '[@premura/db] DATABASE_URL mancante. Imposta env var o passa config.connectionString.',
    );
  }

  // Nota pooler Supabase: per il Transaction Pooler (port 6543) servirebbe
  // `prepare: false`. Qui assumiamo direct connection (5432) o session
  // pooler; se un giorno migriamo al transaction pooler, aggiungere override
  // via `postgresOptions` o una env var dedicata.
  const queryClient = postgres(connectionString, {
    max: 10,
    idle_timeout: 20,
    ...config.postgresOptions,
  });
  const db = drizzle(queryClient, { schema });

  const supabaseUrl = config.supabaseUrl ?? process.env.SUPABASE_URL;
  const secretKey = config.supabaseSecretKey ?? process.env.SUPABASE_SECRET_KEY;
  const admin =
    supabaseUrl && secretKey
      ? createSupabaseClient(supabaseUrl, secretKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        })
      : null;

  return {
    db,
    admin,
    close: () => queryClient.end({ timeout: 5 }),
  };
}

// ─────────────────────────────────────────────────────────────
// Browser client
// ─────────────────────────────────────────────────────────────

// Crea il client Supabase per il frontend.
// Usa la PUBLISHABLE KEY (anon) quindi ogni query passa attraverso le
// policy RLS di Postgres. La tipizzazione dello schema REST arriverà con
// `supabase gen types typescript` in una milestone successiva; per ora il
// client è generico.
export function createBrowserClient(config: BrowserClientConfig = {}): SupabaseClient {
  const url = config.supabaseUrl ?? process.env.SUPABASE_URL;
  const key = config.supabasePublishableKey ?? process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error(
      '[@premura/db] SUPABASE_URL o SUPABASE_PUBLISHABLE_KEY mancanti. Imposta env vars.',
    );
  }
  return createSupabaseClient(url, key);
}

// Re-export dello schema come namespace per chi vuole accedere alle tabelle
// senza un secondo import (es. `client.schema.bookings`).
export { schema };
