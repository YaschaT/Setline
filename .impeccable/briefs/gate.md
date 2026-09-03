# Surface brief — Gate (sign-in + first-run setup)

Routes: `/login`, and the pre-app stages rendered in place by `app/auth-gate.tsx`.

## Mode

**Operate.** Both surfaces are a task: prove who you are, then set the app up.
Nothing here is persuasion — the person already chose Setline.

## Structure (locked)

**"De week die zich vult."** A training week is the product's core object, so
the gate shows that object rather than describing it.

- The week sits behind the panel as seven columns. It rests while nobody is
  signed in, and fills in as setup answers land.
- Choosing a plan lights the week. Toggling days edits it directly. By the last
  step the person is looking at their real first week.
- The panel dissolves into the app; the week ignites once as it goes. That is
  the surface's single authored motion moment.

Rejected alternatives: a swiped card deck with a progress rail (a good
convention, but it shows nothing), and a self-writing logbook (clever, but it
makes signing in feel like data entry).

## Composition

Phone-first, because that is where Setline is used.

- **Phone:** day labels and training names sit above the columns; the fill hangs
  from the top so the panel riding over the lower half never covers meaning.
- **≥860px:** two columns — panel left, week right — and the week flips to grow
  up from a baseline with its labels underneath, which reads better when nothing
  overlaps it.

## Behaviour

- Sign-in, account creation and password reset share one panel and one submit
  button; the mode switch is a text link, not a tab bar.
- Setup is four steps: goal, plan, week, bodyweight. Every answer writes real
  state (`planMode`, `sciencePlanId`, `scheduleOverrides`, `targets`, `metrics`),
  so the dashboard opens populated. Step four previews the calorie and macro
  targets the answer produces before the button is pressed.
- Setup is skipped for anyone who already has sessions, metrics or a schedule.

## Constraints

- Inherits the incumbent Setline world (near-black ground, lime signal, mint
  accent, 1rem radius). This surface does not introduce an identity.
- All copy is nl-BE, direct and second person. Errors name the problem and the
  way out; no raw Supabase or browser strings ever reach a person.
- Account features degrade honestly: with no Supabase keys the panel says so
  and names the two variables, instead of offering a form that cannot work.

## Cross-device rules (added after the first pass)

Setline is used on a phone and a laptop by one person, so "did I already set
this up?" is an account question, not a device question.

- **The cloud decides, not localStorage.** The gate asks `/api/user-state`
  before showing setup. An account that already has sessions, metrics or a
  schedule goes straight to the app on a device that has never seen it.
- **Setup publishes before it hands over.** The four answers are PUT to
  `/api/user-state` as the last step, so the other device sees them immediately
  rather than after the next change.
- **Signing out wipes this device's copy.** Otherwise the next person to sign in
  here inherits the previous account's data, and the sync effect then pushes it
  up under their account and overwrites their real training history.
- **The "already onboarded" flag is keyed per e-mail**, and is only a fast path;
  cloud state remains the real answer.

## Account surface

Its job is one question: *is my phone showing the same thing as my laptop?* So
it leads with a lit line between two nodes — this device and the account —
which completes when synced, animates while writing, and breaks into an amber
dashed line when offline. The shape the product is named after, doing work.
