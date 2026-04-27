import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

// Token OAuth Google per accesso in lettura alla casella Gmail dell'host.
// Popolato dal flow OAuth in apps/web (milestone M2a.3 Fase 1).
//
// Sicurezza:
//   - access_token_encrypted e refresh_token_encrypted sono cifrati
//     lato app con AES-256-GCM (vedi apps/web/lib/google-oauth.ts).
//     Formato storage: base64(iv[12] || authTag[16] || ciphertext).
//   - Non memorizziamo mai il token in chiaro né nei log.
//   - La chiave di cifratura vive in env TOKEN_ENCRYPTION_KEY (32 byte
//     base64). Se la chiave ruota, i token esistenti diventano
//     non-decryptabili: va pianificata una re-encryption o forzato il
//     re-consenso degli host.
//
// host_id: FK logica a hosts.id, ma qui SENZA foreign key constraint
// perché la tabella auth reale (M2a.2) non è ancora pronta e durante
// il dev usiamo un DEV_HOST_ID fisso. In M2a.2 aggiungeremo il FK
// via migration successiva.
//
// Unicità: (host_id, google_email) — un host può collegare più account
// Gmail (es. email personale + email dedicata alla property), ma non può
// avere duplicati dello stesso account sullo stesso host.
export const googleTokens = pgTable(
  'google_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    hostId: uuid('host_id').notNull(),

    googleEmail: varchar('google_email', { length: 255 }).notNull(),

    accessTokenEncrypted: text('access_token_encrypted').notNull(),
    refreshTokenEncrypted: text('refresh_token_encrypted').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),

    // Scope effettivamente concessi da Google (può differire dai requested
    // se l'utente ha deselezionato permessi in consent). Stringa
    // space-separated come ritornata dal token endpoint.
    scope: text('scope').notNull(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('google_tokens_host_idx').on(t.hostId),
    uniqueIndex('google_tokens_host_email_unique').on(t.hostId, t.googleEmail),
  ],
);
