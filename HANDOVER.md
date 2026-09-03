# Yascha Training — Claude hand-over

This is a clean snapshot of the current Yascha Training app, bundled with a private export of Yascha's latest saved progress.

- Live app: https://yascha-training.yaschat99.chatgpt.site
- Clean source commit: `08b33cbf17f8109731a4ae31d671abe79138304f`
- Product language: Dutch (Belgium)
- Runtime: Node.js 22.13+
- Stack: React 19, TypeScript, Vinext, Vite, Tailwind CSS, Shadcn/Base UI, Drizzle, Cloudflare Workers, D1 and R2

## Start the app locally

```bash
npm ci
npm run dev
```

Open the local URL printed by Vite. Verify a production build with:

```bash
npm run build
```

The visual app works locally. Sign in with ChatGPT, cloud sync, hosted photo storage and the AI coach depend on the original Sites environment.

## Load Yascha's current progress locally

The portable backup is at:

```text
PRIVATE-DATA/yascha-training-backup.json
```

After opening the locally running app, read that file and execute the equivalent of this in the page's browser context:

```js
localStorage.setItem(
  backup.storageKey,
  JSON.stringify(backup.state),
);
location.reload();
```

For example, Claude can read the JSON with its filesystem tools, then use its browser automation to evaluate those two statements on the app origin. Do not copy the backup into `public/` and do not commit it to a public repository.

The export contains six logged sessions, the saved plan and schedule, performance data, three body measurements, targets and recovery data. AI chat history was deliberately removed from the portable export. The export timestamp and exact state timestamp are recorded in the JSON.

Seven progress photos and their metadata are included under `PRIVATE-DATA/photos/`. They are not automatically uploaded to a new R2 bucket or shown by the hosted photo API. Treat them as private reference files; ask before implementing a migration or publishing them.

## Main product surfaces

- Training: personal PPL + Upper/Lower plan and selectable science-based PPL/UL, Upper/Lower and Full Body plans.
- Week planning: workout or rest day per real calendar date, including moved sessions.
- Workout logging: prescribed sets, extra sets, weight, reps, optional paused reps and pause duration.
- Progression: live comparison with the previous session, personal-record feedback, estimated strength trend and double-progression advice.
- Exercise controls: collapsible exercise cards, exercise alternatives, warm-up and progression guidance.
- Progress: editable/deletable workout history, bodyweight and waist tracking.
- Nutrition: calorie and macro targets, meal entries, meal ideas and Belgian/generic food search through Open Food Facts.
- Photos: dated progress-photo check-ins with bodyweight, deletion and transformation playback.
- Coach: contextual OpenAI Responses API chat that reads training, recovery, nutrition and body data but never applies plan changes without confirmation.
- PWA: manifest, touch icons and responsive bottom navigation for saving to an iPhone home screen.

## Important files

- `app/page.tsx` — main client app, state model and product flows.
- `app/globals.css` — visual system and responsive styling.
- `app/api/coach/route.ts` — server-side OpenAI coach integration.
- `app/api/user-state/route.ts` — authenticated cloud-state sync.
- `app/api/progress-photos/route.ts` — authenticated photo storage.
- `app/api/food-search/route.ts` — Open Food Facts and generic-food search.
- `db/` and `drizzle/` — D1 schema, queries and migrations.
- `public/` — logo, PWA icons and manifest.
- `PRIVATE-DATA/` — private portable state and photo export; never publish this folder.

## Runtime configuration

### Accounts (Supabase)

Sign-in runs on Supabase email + password. Create a project, enable the Email
provider under Authentication > Providers, then set both values in `.env.local`:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
```

Both are public by design and are inlined into the browser bundle. There is no
hardcoded fallback: until both are set, the login screen says accounts are not
connected and names the two variables, rather than offering a form that cannot
work.

Supabase is only the front door. `POST /api/auth/supabase` verifies the access
token against Supabase's own `/auth/v1/user` endpoint and exchanges it for the
first-party signed session cookie that `app/auth/current-user.ts` already
issues, so `/api/user-state`, `/api/progress-photos` and `/api/coach` keep
authorizing exactly as before. `AUTH_SECRET` (32+ characters) still signs that
cookie and is still required in production.

### AI coach

The AI route reads the following server-side values:

```text
OPENAI_API_KEY
OPENAI_MODEL                 (default: gpt-5.6)
OPENAI_REASONING_MODE        (default: pro)
OPENAI_REASONING_EFFORT      (default: max)
```

Never place a real key in client code, Git, screenshots or this ZIP. A ChatGPT subscription does not automatically provide API credits.

Hosted bindings:

- `DB` — Cloudflare D1 for user state and photo metadata.
- `BUCKET` — Cloudflare R2 for progress-photo files.

Authentication is the app's own (see "Passwordless authentication" below). Sign in with ChatGPT has been removed at the user's request, and `app/chatgpt-auth.ts` is deleted. A separately deployed copy does not inherit the original database or storage.

## Guardrails

1. Preserve all existing tracking, real-date scheduling, editing, paused-rep, PR, nutrition, photo, authentication and sync behavior.
2. Use the current app as the baseline and make small, reversible changes.
3. Keep workout logging fast on mobile with large targets, readable fields and restrained information density.
4. Never hard-code private backup data into production source or demo data.
5. Do not change the D1 schema without a reviewed migration.
6. Do not deploy over the original Sites project without Yascha's explicit approval.

## Suggested first prompt for Claude

```text
Read HANDOVER.md and PRIVATE-DATA/README.md first. Install and run the app locally. Load PRIVATE-DATA/yascha-training-backup.json into the app's yascha-training-v1 localStorage key, reload, and show me the current mobile UI with my six logged sessions. Keep PRIVATE-DATA out of public assets and Git. Preserve every existing feature and data shape. Explain which hosted-only capabilities are unavailable locally before changing anything.
```

## Authentication

Three ways in, all landing on one signed session cookie and one verified
e-mail address — so Google, a code and a passkey all key the same rows in
`user_states` and `progress_photos`:

1. **Google** — OAuth 2.0 authorization-code flow.
2. **E-mail code** — six digits, hashed and single-use.
3. **Passkey / Face ID** — WebAuthn, enrolled after a first sign-in.

Sign in with ChatGPT was removed at the user's request; `app/chatgpt-auth.ts`
is deleted and `getCurrentUser()` (`app/auth/current-user.ts`) now resolves
the session cookie only.

`app/auth-gate.tsx` wraps the app: an unauthenticated visitor is sent to
`/login` before anything renders. If no auth backend is reachable it falls
through to the app rather than trapping the visitor on a login that cannot
succeed.

### Files

- `app/login/` — the login screen (`/login`).
- `app/auth/session.ts` — HMAC-SHA256 signed, HttpOnly session cookie, 30 days.
- `app/auth/otp.ts` — code generation, hashing, validation helpers.
- `app/auth/email.ts` — sends the code (Resend, or server-side log in dev).
- `app/auth/webauthn.ts` — relying party derived from the request host.
- `app/auth/current-user.ts` — the single "who is calling" entry point.
- `app/api/auth/**` — code request/verify, passkey options/verify, passkey
  register options/verify, session, signout.
- `db/auth.ts` — D1 queries. `drizzle/0002_first_redwing.sql` — additive
  migration adding `auth_codes`, `auth_credentials`, `auth_challenges`.

### Runtime configuration

```text
AUTH_SECRET           required in production; >= 32 chars. Rotating it signs
                      every outstanding session out.
RESEND_API_KEY        optional; without it the code is logged, not e-mailed.
AUTH_EMAIL_FROM       required together with RESEND_API_KEY.
GOOGLE_CLIENT_ID      optional; Google sign-in returns 501 without it.
GOOGLE_CLIENT_SECRET  required together with GOOGLE_CLIENT_ID.
```

Without `AUTH_SECRET` the server generates an ephemeral key per isolate and
warns: sessions do not survive a restart. No default secret ships.

### Local database

Local D1 had no tables at all, so cloud sync could never work locally. Apply
the schema once:

```bash
npm run dev          # creates the local D1
npm run db:migrate:local
```

Production migrations stay the control plane's job
(`wrangler d1 migrations apply <DB> --remote` for a self-hosted copy).

### Security properties

- Codes are stored as SHA-256 of `email:code`, never in plaintext; single use;
  10 minute expiry; 5 attempts; 5 sends per address per hour.
- Wrong, expired and unknown codes return one identical response — no oracle.
- WebAuthn is verified with `@simplewebauthn/server`; challenges are
  single-use and signature counters are persisted for clone detection.
- A challenge issued for one address cannot authenticate another.
- Enrolling a passkey requires an existing session.

### Verified end to end

Chrome's virtual authenticator drove the real ceremony: code sign-in →
passkey enrolment → sign out → passkey-only sign-in → `/api/user-state` 200.

### Setting up Google sign-in

In Google Cloud Console → APIs & Services → Credentials, create an **OAuth
client ID** of type *Web application* and add the redirect URI for each origin
the app runs on:

```text
http://localhost:5173/api/auth/google/callback
https://<your-domain>/api/auth/google/callback
```

Then set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. The relying party and
redirect URI are derived from the request host, so one build works on every
origin without reconfiguration.

The `id_token` is read without a signature check, which is safe *only* because
it arrives straight from Google's token endpoint over TLS using the client
secret (OpenID Connect Core §3.1.3.7). Never relax that to a token received
from a browser.

## Deployment

Static SPA build of the app on Vercel: **https://youfit-app.vercel.app**
(project `kotobox/youfit-app`). See `deploy/web/README.md`.

```bash
npm run deploy:web
```

That host has no backend, so `/api/*` is stubbed in `deploy/web/preview-auth.ts`
and the app runs on `localStorage`. Real authentication needs D1 and R2, which
means a Cloudflare deploy.

### Two auth backends, one client

The login screen talks to the same URLs everywhere; what answers them differs.

| URL | Cloudflare / local | Vercel |
|---|---|---|
| `/api/auth/*` | `app/api/auth/**` (Next routes, D1-backed) | `api/v/auth/**` (Edge functions, stateless) |

Cloudflare has D1, so it stores six-digit codes and passkey credentials.
Vercel has no database, so e-mail sign-in is a signed magic link and passkeys
are unavailable there; `/api/auth/methods` reports what each deployment can
actually do and the screen renders only that.

**Why `api/v/` and not `api/`.** Vercel discovers functions under `api/` at
the repo root, but the dev server resolves `/api/auth/session` to
`api/auth/session.ts` and serves it as a module, shadowing the app router's
route of the same name — three endpoints silently returned TypeScript source.
Moving the functions to `api/v/` removes the filename collision, and
`vercel.json` rewrites each public URL onto them. Do not move them back.

Signing lives once in `lib/auth-core.ts` and is used by both backends, so the
two cannot drift apart on anything security-critical.
