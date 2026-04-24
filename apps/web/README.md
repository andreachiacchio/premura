# @premura/web

App Next.js 15 (App Router) per la dashboard host di Premura.

## Stack

- **Next.js 15** + **React 19** (App Router, no pages router)
- **TypeScript strict** (estende `tsconfig.base.json` della root)
- **Tailwind CSS v4** — configurazione CSS-first via `@theme` in
  `app/globals.css`, nessun `tailwind.config.ts`
- Font: **Inter** (body) + **Fraunces** (display, variable axes
  `SOFT` e `opsz`) via `next/font/google`

I design token sono estratti 1:1 da `demo/premura-prototype.html`
(palette, tipografia, radius, shadow, easing).

## Comandi

```bash
pnpm --filter @premura/web dev        # dev server → localhost:3000
pnpm --filter @premura/web build      # build produzione
pnpm --filter @premura/web start      # start produzione
pnpm --filter @premura/web lint       # next lint
pnpm --filter @premura/web typecheck  # tsc --noEmit
```

## Struttura

```
apps/web/
├── app/
│   ├── layout.tsx       # root layout + font Inter/Fraunces
│   ├── page.tsx         # placeholder "Coming soon"
│   └── globals.css      # @import tailwindcss + @theme tokens
├── next.config.mjs
├── postcss.config.mjs   # @tailwindcss/postcss
├── tsconfig.json
├── .eslintrc.json
└── package.json
```

## Prossimi step (roadmap)

- **1.3.b** — Layout base con sidebar navigation
- **1.3.c** — Landing page pubblica
- **1.3.d** — Auth flow (magic link + Google OAuth)
- **1.3.e** — Deploy Vercel staging
