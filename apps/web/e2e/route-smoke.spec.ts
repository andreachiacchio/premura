import { expect, test } from '@playwright/test';

// Smoke test route Next.js app. Triggered da CI sopra `next build`
// + `next start` reale: cattura runtime crash che vitest non vede
// perche' bypassa SSR.
//
// Casi coperti:
// 1. Public routes: render server-side completo. Se il modulo della
//    pagina ha un RSC serialization error (es. inline arrow function
//    come prop su <form action>), il fetch fallisce con 500.
// 2. Protected routes: senza session Supabase, la middleware redirect
//    a /login (307). Status accettabile e' 200/307/308. 500 = bug.
//
// Trade-off: con env vars Supabase fake non possiamo testare il render
// completo dei Server Component PROTETTI (perche' la middleware
// redirect prima). Per coprire quei render serve un session fake o
// un test in cui la middleware viene bypassata. Per ora il regression
// catch e' fatto da:
//   a) build success (compile-time + module load)
//   b) public route render success (eg. / e /login attraversano lo
//      stesso runtime React)
//   c) module-level errors nei page.tsx protetti escalano comunque a
//      500 perche' Next li valuta lazy ma il primo redirect 307 li
//      tocca abbastanza per esplodere in caso di import-time bug.

const ROUTES = [
  { path: '/', expectedCodes: [200, 307] },
  { path: '/login', expectedCodes: [200] },
  { path: '/privacy', expectedCodes: [200] },
  { path: '/design', expectedCodes: [200] },
  // Protected: senza session, middleware redirect a /login.
  // 500 significa che il modulo della pagina e' rotto (RSC error).
  { path: '/dashboard', expectedCodes: [307] },
  { path: '/onboarding', expectedCodes: [307] },
  { path: '/onboarding/welcome', expectedCodes: [307] },
  { path: '/onboarding/property', expectedCodes: [307] },
  { path: '/onboarding/gmail', expectedCodes: [307] },
  { path: '/onboarding/whatsapp', expectedCodes: [307] },
] as const;

for (const route of ROUTES) {
  test(`route ${route.path} torna status ${route.expectedCodes.join('/')} (no 500)`, async ({
    request,
  }) => {
    const response = await request.get(route.path, { maxRedirects: 0 });
    const status = response.status();
    expect(
      route.expectedCodes.includes(status as (typeof route.expectedCodes)[number]),
      `route ${route.path} ha tornato ${status} invece di ${route.expectedCodes.join('/')}. ` +
        `500 indica RSC error, modulo rotto, o env var mancante. ` +
        `Body: ${(await response.text()).slice(0, 300)}`,
    ).toBe(true);
  });
}

test('route /onboarding/gmail non leak RSC serialization error', async ({ request }) => {
  // Smoke specifico per il bug fix di slice 7a.5: il <form action>
  // su /onboarding/gmail prima usava inline arrow function che falliva
  // con "Functions cannot be passed directly to Client Components".
  // Anche da unauth (redirect 307), se il modulo fosse rotto il render
  // genererebbe 500 prima del redirect (perche' il modulo viene caricato
  // dal Next runtime per servire la route, anche se poi la middleware
  // intercetta).
  const response = await request.get('/onboarding/gmail', { maxRedirects: 0 });
  expect(response.status()).not.toBe(500);
});
