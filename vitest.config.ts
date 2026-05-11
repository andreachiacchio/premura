import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      // Alias '@/' usato dai sorgenti apps/web. Necessario per testare
      // route handler che importano @/lib/* / @/app/* (slice I e oltre).
      '@': path.resolve(__dirname, 'apps/web'),
    },
  },
  test: {
    globals: false,
    environment: 'node',
    include: ['packages/*/tests/**/*.test.ts', 'apps/*/tests/**/*.test.ts'],
    // I test in apps/web/tests/{dashboard,auth} richiedono env jsdom +
    // alias @/* configurati in apps/web/vitest.config.ts. Il root
    // config (env node) li ignora per evitare crash su import
    // path-mapped (es. @/lib/supabase-server).
    exclude: [
      '**/*.integration.test.ts',
      '**/node_modules/**',
      '**/dist/**',
      'apps/web/tests/dashboard/**',
      'apps/web/tests/auth/**',
    ],
  },
});
