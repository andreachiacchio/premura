// Slice D — Icon PWA 512x512.

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#c87f5a"/>
  <text x="50%" y="55%" text-anchor="middle" font-family="serif" font-size="280" font-weight="700" fill="#faf5ed">P</text>
</svg>`;

export function GET(): Response {
  return new Response(SVG, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
