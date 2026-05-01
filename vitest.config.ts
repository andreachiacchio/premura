import { defineConfig } from 'vitest/config';

export default defineConfig({
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
