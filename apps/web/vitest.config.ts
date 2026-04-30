import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Config Vitest per i test React di apps/web. Environment jsdom +
// @testing-library/jest-dom matchers via setup file. Isolato dai test
// backend (env node, vitest.config.ts in root) tramite dual-script:
// `pnpm test` root chiama prima `vitest run` (config root), poi
// `pnpm --filter @premura/web test` (questo config).

export default defineConfig({
  plugins: [react()],
  test: {
    name: "web",
    globals: false,
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["tests/dashboard/**/*.test.tsx"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/.next/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
