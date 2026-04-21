import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/**/*.integration.test.ts'],
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@agents': resolve(__dirname, 'src/agents'),
      '@workflows': resolve(__dirname, 'src/workflows'),
      '@integrations': resolve(__dirname, 'src/integrations'),
      '@db': resolve(__dirname, 'src/db'),
      '@utils': resolve(__dirname, 'src/utils'),
    },
  },
});
