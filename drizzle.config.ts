import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

// Carica `.env.local` se presente (override dei default di dev). Serve a
// drizzle-kit generate/push/studio per raggiungere il DB remoto.
loadEnv({ path: '.env.local' });

export default defineConfig({
  schema: './packages/db/src/schema.ts',
  out: './packages/db/src/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgresql://premura:devpassword@localhost:5432/premura_dev',
  },
  verbose: true,
  strict: true,
});
