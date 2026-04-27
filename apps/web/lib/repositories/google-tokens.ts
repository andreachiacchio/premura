import { and, eq, gt, sql } from 'drizzle-orm';
import { googleTokens, type Database } from '@premura/db';
import { decryptToken, encryptToken } from '../google-oauth';

// Repository thin sopra Drizzle per google_tokens.
// Le funzioni di decrypt sono applicate solo in lettura (upsert riceve
// plaintext, lo cifra prima dell'INSERT).

export type UpsertTokenInput = {
  hostId: string;
  googleEmail: string;
  accessToken: string; // plaintext, cifrato qui
  refreshToken: string; // plaintext, cifrato qui
  expiresAt: Date;
  scope: string;
};

export type DecryptedToken = {
  id: string;
  hostId: string;
  googleEmail: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scope: string;
  createdAt: Date;
  updatedAt: Date;
};

// Upsert: se (host_id, google_email) esiste già, sostituisce i token.
// Caso reale: l'host revoca su myaccount.google.com e rifà il flow per
// rinnovare i permessi — ci ritrova la stessa riga aggiornata.
export async function upsertToken(
  db: Database,
  input: UpsertTokenInput,
): Promise<{ id: string }> {
  const row = {
    hostId: input.hostId,
    googleEmail: input.googleEmail,
    accessTokenEncrypted: encryptToken(input.accessToken),
    refreshTokenEncrypted: encryptToken(input.refreshToken),
    expiresAt: input.expiresAt,
    scope: input.scope,
  };

  const [result] = await db
    .insert(googleTokens)
    .values(row)
    .onConflictDoUpdate({
      target: [googleTokens.hostId, googleTokens.googleEmail],
      set: {
        accessTokenEncrypted: row.accessTokenEncrypted,
        refreshTokenEncrypted: row.refreshTokenEncrypted,
        expiresAt: row.expiresAt,
        scope: row.scope,
        updatedAt: sql`NOW()`,
      },
    })
    .returning({ id: googleTokens.id });

  if (!result) {
    throw new Error('[google-tokens-repo] INSERT ... RETURNING non ha ritornato righe');
  }
  return result;
}

// Lettura singola con decrypt automatico. Ritorna null se non esiste.
// Non aggiorna updated_at.
export async function getTokenByHostAndEmail(
  db: Database,
  hostId: string,
  googleEmail: string,
): Promise<DecryptedToken | null> {
  const [row] = await db
    .select()
    .from(googleTokens)
    .where(
      and(
        eq(googleTokens.hostId, hostId),
        eq(googleTokens.googleEmail, googleEmail),
      ),
    )
    .limit(1);
  if (!row) return null;
  return decryptRow(row);
}

// Lista di token NON scaduti (expires_at > NOW). Riservato a worker futuri
// (M2a.3 Fase 2 — polling Gmail). Non usato nella Fase 1.
export async function getAllActiveTokens(db: Database): Promise<DecryptedToken[]> {
  const rows = await db
    .select()
    .from(googleTokens)
    .where(gt(googleTokens.expiresAt, new Date()));
  return rows.map(decryptRow);
}

function decryptRow(row: {
  id: string;
  hostId: string;
  googleEmail: string;
  accessTokenEncrypted: string;
  refreshTokenEncrypted: string;
  expiresAt: Date;
  scope: string;
  createdAt: Date;
  updatedAt: Date;
}): DecryptedToken {
  return {
    id: row.id,
    hostId: row.hostId,
    googleEmail: row.googleEmail,
    accessToken: decryptToken(row.accessTokenEncrypted),
    refreshToken: decryptToken(row.refreshTokenEncrypted),
    expiresAt: row.expiresAt,
    scope: row.scope,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
