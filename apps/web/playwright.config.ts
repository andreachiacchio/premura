import { defineConfig } from '@playwright/test';

// Slice 7a.5 / RSC fix — Playwright config minimale per smoke test
// route. Focus: catturare RSC serialization errors e altri runtime
// crash che il build non rileva ma che falliscono al primo request.
//
// webServer: avvia `next start` con env vars Supabase fake. La
// middleware Supabase ha bisogno di NEXT_PUBLIC_SUPABASE_URL +
// NEXT_PUBLIC_SUPABASE_ANON_KEY altrimenti throw 500 anche prima di
// arrivare al render. Con questi fake la middleware torna user=null
// e protected routes ritornano 307 redirect (non 500).
//
// Public routes (/, /login, /privacy, /design) renderizzano davvero
// e cattureranno crash module-level del Server Component.

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3055',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'pnpm start',
    cwd: '.',
    port: 3055,
    timeout: 60_000,
    reuseExistingServer: !process.env.CI,
    env: {
      PORT: '3055',
      NEXT_PUBLIC_SUPABASE_URL: 'https://fake.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiJ9.fake-token.fake-sig',
      DATABASE_URL: 'postgresql://fake:fake@localhost:5432/fake',
      SUPABASE_SERVICE_ROLE_KEY: 'fake-service-key',
    },
  },
});
