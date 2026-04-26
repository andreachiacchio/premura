import { defineConfig } from 'vitest/config';

// Vitest config separato per i test integration (Postgres testcontainer).
// Eseguiti via `pnpm test:integration`. Richiedono Docker daemon attivo.
//
// Discriminante: filename `*.integration.test.ts` (non incluso nel run
// principale `pnpm test`).

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['packages/*/tests/**/*.integration.test.ts', 'apps/*/tests/**/*.integration.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    // I container possono essere lenti su CPU lente; bump il default 5s.
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
