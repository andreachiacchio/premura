// Singleton del client Drizzle per il lato server di apps/web.
//
// Centralizza il pattern lazy-init usato altrove inline (vedi
// app/api/gmail/sync/route.ts ecc.). Da chiamare solo da server
// component, server action o route handler.
//
// La pool postgres apre lazy alla prima richiesta e resta viva per il
// process lifetime: niente shutdown gracieful in apps/web (Next gestisce
// il process come serverless / edge / standalone runtime).

import { createServerClient, type ServerClient } from "@premura/db";

let clientPromise: Promise<ServerClient> | null = null;

export function getDb(): Promise<ServerClient> {
  if (!clientPromise) clientPromise = Promise.resolve(createServerClient());
  return clientPromise;
}
