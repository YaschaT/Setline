# Vercel deployment

Static SPA build of the app, deployed as the Vercel project
`kotobox/yascha-training` → **https://yascha-training.vercel.app**

## Deploy

```bash
npm run deploy:web        # builds, then deploys to production
```

Or in two steps:

```bash
npm run build:web
cd deploy/web && npx vercel@latest deploy --prod --yes
```

## How it is wired

- `vite.config.ts` — root is this folder, `@` aliases the repo root, `publicDir`
  is the repo's `public/`, so icons and the manifest ship unchanged.
- `app.css` — imports `app/globals.css` and declares Tailwind `@source` paths.
  Without these, Tailwind v4 detects sources relative to THIS folder, finds no
  component files, and tree-shakes every utility class away — the build looks
  broken (the fixed bottom nav renders stacked at the top).
- `main.tsx` — routes `/login` to the login screen, everything else to the app.
- `vercel.json` — no build on Vercel (the bundle is prebuilt); serves `dist/`
  with SPA rewrites so `/login` resolves.
- `.vercelignore` — patterns are **root-anchored** (`/index.html`). Unanchored
  `index.html` also matches `dist/index.html`, which produces a deploy where the
  assets resolve but every route 404s.

## What does not work on Vercel

There is no backend here, so `/api/*` has nowhere to go:

- Auth is stubbed in `preview-auth.ts`: code `000000` fails, any other six
  digits pass, Face ID is unavailable (no server to verify a signature).
- Cloud sync, hosted photos and the AI coach fail and the app falls back to
  local storage, which is its normal offline behaviour.

Everything else is the real app, persisting to `localStorage` on the device.

The real auth (passkeys, hashed single-use codes, signed sessions) needs D1 and
R2, so it runs on Cloudflare, not here.
