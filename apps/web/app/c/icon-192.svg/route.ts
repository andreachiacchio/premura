// Slice D — Icon PWA 192x192 (SVG dinamico, niente PNG asset binari).

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192">
  <rect width="192" height="192" rx="36" fill="#c87f5a"/>
  <text x="50%" y="55%" text-anchor="middle" font-family="serif" font-size="100" font-weight="700" fill="#faf5ed">P</text>
</svg>`;

export function GET(): Response {
  return new Response(SVG, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
