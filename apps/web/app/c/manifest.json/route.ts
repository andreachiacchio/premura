// Slice D — manifest.json dinamico per PWA cleaner Karen.
// Servito su /c/manifest.json (in app router serve via route.ts).

export async function GET(): Promise<Response> {
  const manifest = {
    name: 'Premura Karen',
    short_name: 'Premura K',
    description: 'App cleaner Premura: kit di benvenuto da preparare.',
    start_url: '/c/dashboard',
    scope: '/c/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#faf5ed',
    theme_color: '#c87f5a',
    icons: [
      {
        src: '/c/icon-192.svg',
        sizes: '192x192',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: '/c/icon-512.svg',
        sizes: '512x512',
        type: 'image/svg+xml',
        purpose: 'any',
      },
    ],
  };
  return new Response(JSON.stringify(manifest), {
    headers: {
      'Content-Type': 'application/manifest+json',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
