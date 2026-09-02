---
name: shadcn
description: "Add or manage shadcn/ui components in this project via the real shadcn CLI"
argument-hint: "[add <component> | list]"
user-invocable: true
---

This project already has shadcn/ui configured (`components.json` at the repo root, style `new-york`,
base color `neutral`, icon library `lucide`, RSC enabled, dark-mode via CSS variables in
`app/globals.css`). Existing generated components live in `components/ui/` — check that folder first so
you don't re-add a component that's already there. There are already 60+ components present.

Aliases from `components.json`: `@/components`, `@/components/ui`, `@/lib`, `@/lib/utils`, `@/hooks`.

## Behavior

- **No argument, or "list"**: list the components already present in `components/ui/`, and note that more
  are available from the shadcn registry (https://ui.shadcn.com/docs/components) if the user wants to
  browse.
- **"add <component>" (one or more names)**: for each requested component not already in
  `components/ui/`, run:

  ```
  npx shadcn@latest add <component> --yes
  ```

  from the project root. This is the real, official shadcn CLI — it reads `components.json` and writes
  directly into `components/ui/`, respecting this project's existing style/alias configuration. Do not
  hand-write a component that mimics shadcn's output; always go through the real CLI so the file matches
  upstream exactly and stays updatable the normal way.
- After adding, run `npx tsc --noEmit` and `npx eslint .` to confirm the new component doesn't introduce
  type or lint errors, then skim the generated file once so you know what props/variants it exposes before
  wiring it into a page.

  **Known-clean baseline:** `npx tsc --noEmit` reports 7 pre-existing errors in `app/api/*`, `db/*` and
  `worker/index.ts` — all `Cannot find module 'cloudflare:workers'` / `Cannot find name 'D1Database'`.
  Those come from Cloudflare worker types that Wrangler generates and are unrelated to shadcn. Only treat
  *new* errors as yours. Do not use `npx tsc -b` (this project sets `noEmit`), and prefer `npx eslint .`
  over `npm run lint` — the `lint` script goes through `scripts/sites-env.sh`, which expects a Linux
  environment.
- If the user names a component that isn't in the shadcn registry, say so plainly rather than guessing or
  installing something unrelated.

## House style

This app renders its visual system as hand-authored CSS classes in `app/globals.css` (`.panel-card`,
`.hero-card`, `.metric-card`, `.status-pill`, `.eyebrow`, …) layered over the shadcn primitives, rather
than composing Tailwind utilities inline. Brand tokens: `#060908` ground, `#c8ff66` lime primary,
`#72efd0` mint, `#9b72ff` violet, Inter, `--radius: 1rem`. Product language is Dutch (Belgium) — write UI
copy in Dutch. Match that existing idiom when wiring a new component in; don't introduce a second styling
convention.

Note this project also has `@base-ui/react` and `radix-ui` installed alongside `@shadcn/react`; some
existing components in `components/ui/` are built on Base UI. Check the file you're extending before
assuming a Radix API.

## Out of scope

This skill only manages shadcn/ui component installation. For layout, spacing, color, typography, or
overall visual-craft decisions once a component is in place, use `/impeccable` — that's the project's
design-quality skill. This skill exists purely so "add the `<x>` shadcn component" has a direct,
low-ceremony shortcut instead of going through a general-purpose request.
