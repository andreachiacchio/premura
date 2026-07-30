// Singleton del client Drizzle per il lato server di apps/web.
//
// Centralizza il pattern lazy-init: da chiamare solo da server
// component, server action o route handler. UNICO punto di apertura
// pool in apps/web — niente singleton paralleli nelle route.
//
// POOL SERVERLESS (incidente produzione 30/07, digest 3483798615):
// il session pooler Supabase ha pool_size 15 TOTALE, ma ogni istanza
// lambda Vercel apriva un pool da 10 (default di @premura/db, pensato
// per il worker long-lived). Bastavano due istanze calde per esaurire
// i client e buttare giu' /properties con EMAXCONNSESSION. Qui il pool
// e' max: 1 — postgres-js serializza le query in coda sulla stessa
// connessione, e dieci istanze calde restano dentro il limite.

import { createServerClient, type ServerClient } from "@premura/db";

let clientPromise: Promise<ServerClient> | null = null;

export function getDb(): Promise<ServerClient> {
  if (!clientPromise) {
    clientPromise = Promise.resolve(
      createServerClient({
        postgresOptions: { max: 1, idle_timeout: 20, connect_timeout: 10 },
      }),
    );
  }
  return clientPromise;
}
