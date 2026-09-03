# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

One primary user: Yascha, training on a self-directed hypertrophy/strength program in Belgium. He opens Setline on an iPhone, saved to the home screen, mostly *while training* — between sets, one-handed, sweaty hands, gym lighting — and again in the evening to log food, bodyweight and the occasional progress photo.

The account exists so that this data survives a lost or replaced phone and follows him between devices, not so that a team or coach can collaborate. Multi-user is possible but not the design target.

## Product Purpose

Setline is a personal training, nutrition and progression dashboard. It answers one question every session: *what am I lifting today, and is it more than last time?* Success is a logged session in under a minute of thumb time, and a visible answer on whether to add weight.

## Positioning

Setline is not a generic workout tracker. It carries one person's actual program (personal PPL + Upper/Lower, plus selectable science-based PPL/UL, Upper/Lower and Full Body templates) and does live per-set comparison against the previous session, with double-progression advice and personal-record feedback surfaced at the moment the set is entered — not in a weekly report.

## Operating Context

- Phone-first PWA, installed to the iPhone home screen; bottom tab navigation, safe-area insets.
- Used mid-workout, standing, one thumb, screen often at an angle in poor light.
- A calendar week is the organizing unit: each real date is a workout day or a rest day, and sessions can be moved between dates.
- Data spans training sessions, recovery check-ins, bodyweight and waist metrics, nutrition entries against calorie/macro targets, and dated progress photos.

## Capabilities and Constraints

- **Stack (fixed):** React 19, TypeScript, Next App Router via vinext, Vite, Tailwind CSS v4, shadcn/ui on Base UI, Drizzle, Cloudflare Workers with D1 and R2. Node 22.13+.
- **Product language:** Dutch (Belgium). All user-facing copy is nl-BE.
- **Identity (this pass):** Supabase email + password only, against a new dedicated Setline Supabase project. Read from `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`, with no hardcoded fallback — account features must degrade honestly when unconfigured rather than fail silently. Google OAuth, magic link and the incumbent WebAuthn/passkey path are explicitly out of scope.
- **Server identity is unchanged:** every server route (`/api/user-state`, `/api/progress-photos`, `/api/coach`) authorizes on a signed first-party session cookie carrying a verified e-mail (`app/auth/current-user.ts`). Supabase is the front door; the verified Supabase identity must be exchanged for that existing cookie so the data layer keeps working untouched.
- **First-run setup writes real state:** onboarding collects goal, training plan, training days per week, and bodyweight/target, and those answers populate the plan, weekly schedule and nutrition targets. It is setup, not a slideshow.
- **Offline tolerance:** local state in `localStorage` is authoritative when the cloud is unreachable; the app must never trap someone behind a check that cannot answer.

## Brand Commitments

- **Name:** Setline (renamed from Yascha Training).
- **Incumbent visual world (binding for this pass):** near-black ground (`#060908`), lime-signal accent (`#c8ff66` / `#b9f45b`), mint ring (`#72efd0`), 1rem base radius, dense metric typography. Defined in `app/globals.css`. The login and onboarding surfaces join this world; they do not replace it.
- **Voice:** Dutch, direct, second person, coach-like and unsentimental. "Bouw verder." "Stop bij techniekverlies." No hype, no exclamation marks, no motivational filler.

## Evidence on Hand

- Six logged sessions, a saved plan and schedule, performance history, three body measurements, targets, recovery data and seven progress photos exist as a private export under `PRIVATE-DATA/` (never published, never copied into `public/`).

## Open Decisions

- Dashboard redesign: wanted, explicitly deferred to a separate pass with its own direction round.
- Whether Setline ever serves users beyond Yascha.
