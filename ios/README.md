# Setline — native iOS (Phase 1)

SwiftUI app built against the approved Claude Design handoff. Phase 1 is the
foundations plus one vertical slice: sign in, today's session, log a set, see
the comparison, finish.

## Open it

```bash
open ios/Setline.xcodeproj
```

Scheme **Setline**, any iPhone simulator, or your own device (set a team under
Signing & Capabilities first — the project ships with automatic signing and no
team, so a device build needs one).

## Accounts

`Setline.xcconfig` is git-ignored and holds the same two values the web app
reads from `.env.local`:

```
SUPABASE_URL = your-project.supabase.co
SUPABASE_ANON_KEY = your-anon-key
```

Copy `Setline.xcconfig.example` if it is missing. Without both, the sign-in
screen says accounts are not connected and names the keys, rather than showing
a form that cannot work.

The app signs in against the same Supabase project as the web app and reads
and writes the same `public.user_state` row, so both stay in step.

## Sync with the web app

Both apps share one `public.user_state` row and follow one loop: read the
latest row, apply only this client's own changes, write only if the row is
still at the version that was read, and otherwise read again and reapply. iOS
sends its changes (`StateChange`), never its copy of the state. The web app
merges its page state against the state it provably started from
(`lib/state-merge.ts`). Both clients are held to the scenarios in
`tests/fixtures/sync`.

### Who owns what

Ownership is per key, and for the keys both apps write, per entry inside it —
one date, one meal, one target field, one programme. **iOS never replaces a shared key
wholesale**; it names the entry it changed and leaves the rest of the key as it
found it, including entries written by a web version this app has never seen.

| Key | Written by | How it changes |
| --- | --- | --- |
| `planMode`, `sciencePlanId` | both, per programme | `setProgram(mode:sciencePlanID:)` — which programme the week is built from, and nothing else |
| `plan` | web | the account's *personal* plan. iOS reads it only in personal mode, exactly as the web app does, and never writes it: switching programmes must leave it intact to switch back to |
| `scheduleOverrides` | both, per date | `setScheduleDay(key:dayID:)` and `removeScheduleOverride(key:)`. Keys are scoped per program (`personal:2026-09-17`), so a date under another plan is another plan's business |
| `nutritionEntries` | both, per entry | upsert or remove by `id`. An upsert keeps the fields iOS does not model |
| `targets` | both, per field | `setTarget(field:value:)`. The other three fields keep their value |
| `sessions` | both, per session | iOS writes the session it logged; within a session, `results` merge per exercise, so neither app drops the other's |
| `metrics`, `completed`, `performance`, `chatMessages`, `recoveryDraft` | web | iOS reads `metrics`; it writes none of these |
| `iosActiveSession`, `iosPainFlags`, `iosProgramReplacements`, `iosCustomExercises`, `iosHiddenWarmups` | iOS | the web app does not read them, and carries them through untouched |
| `syncTombstones`, `syncReset` | both | deletions and resets, written by whichever app performed one |

Two rules hold for every row. A key or entry that is simply **absent** from what
a client sends is not a deletion — it is silence, and the stored value stands. A
**deletion** is a thing a client says out loud: the entry goes, and a tombstone
records when, so a slower client cannot bring it back. Unknown keys and unknown
fields are always carried through; neither app is the authority on what the
other stores.

### Not built for this release

Deferred — StoreKit and iPad:

- **The free-session counter and paywall (25a/25b).** They need StoreKit
  products, which do not exist yet.
- **The ≥1024 layouts (26/27).** They are iPad.

Deferred until its rule is designed:

- **Voeding's protein suggestion (21).** The artboard shows "NOG 23 G PROTEÏNE
  → 250 g magere kwark · 24 g · 145 kcal" and Review 05 styles the block, but
  neither says how the food is chosen. Nothing picks a food until that rule is
  designed; Voeding shows no suggestion.

Not built, by design:

- **Passkeys, Apple and Google.** Base artboard 02 still draws them, but Review
  01 redrew identity as e-mail and password, and none of the three is
  configured against this Supabase project. A button that cannot work is worse
  than an honest e-mail field.
- **Base 18's sleep-and-HRV recovery card.** Addendum 18R replaced it with a
  deload proposal built from logged sets, which is here. HealthKit is out of
  scope.

All of these are release gaps for a public V1, not defects in what is here.

### Where the app differs from the design, on purpose

Screen by screen:

- **05** has no "Eigen plan" option: there is no plan editor behind it.
- **09** has no "Herstel · slaap, HRV" line (HealthKit is out of scope).
- **10**: pre-flight's `Wijzig` opens the week agenda, the one place today's
  session can be changed.
- **11–13 / 11R–13R**: the session keeps a strip of the day's exercises under
  its header. No artboard draws one, but it is the only way back to an earlier
  exercise to correct a set.
- **11R / 12R** draw the entry sheet without a tools row. The app keeps 12's
  `Toetsenblok · Mislukt · Pauze-reps` and adds `Partieel`, because 16R's
  failed, paused and partial sets are entered there.
- **13R / 11–13**: the rest timer opens as 13R's card (`Overslaan`) and folds
  to 11–13's compact row (`Klaar`) after three seconds; a tap switches between
  them. At accessibility sizes it stays open.
- **14**: the plate calculator adds correctly where the artboard's own example
  does not.
- **15**: a `Wissel` pill sits beside the exercise name. Base 15 enters the swap
  by holding the title, which still works, but a gesture nobody can see cannot
  be the only way in.
- **15R** adds the `Toestel of rek is bezet` chip, which sets the context the
  alternatives are ranked by, and says so when sets already logged stay with
  the original exercise.
- **15Rb**: the scope captions say what each reach changes ("Push, vanaf
  vandaag", "Push, tot je het plan wijzigt") instead of "Maandag 7 sep, deze
  sessie" — a change for today only is a swap (TRAINING_LOGIC §12.4).
- **16**: the undo sits above the commit pill rather than in its place, so the
  one action stays reachable for the five seconds the undo lasts.
- **16R**: a set is removed from its entry sheet, and only a set added during
  the session; there is no swipe. Planned sets stay, because completion feeds
  §11's fatigue signal. The partial marker names its count ("partieel +2").
- **17R** adds `Terug`, so a mis-tap on `Sessie afronden` never forces a save.
- **19** has no advisory line, on request.
- **20**: Progressie's `Lichaam` and `Historiek` segments have no artboard; they
  are built from 20's own parts. So are the other screens no artboard draws:
  Voeding's add-food sheet, Account's programme and day-target sheets, Foto's
  empty state and an expired sign-in (23's sync block with 24's retry).
- **22** says "Foto's blijven op dit toestel" instead of "…tenzij je sync
  aanzet": there is no photo sync to turn on.
- **23**: the Rusttimer row has no `Wijzig`, because rest follows each
  exercise's role (13R) and there is nothing to set; `Account verwijderen` is
  hidden, on request. `RIR vragen` is added: it is the setting 12R's footnote
  points to ("Per set vragen zet je aan in Account").
- **28b** draws a faint dot on the rows still to come; 29 and 30 draw none,
  and the grid follows them.
- **29 / 29b** disagree on READY's headline; the card uses 29b's per-tone
  headlines with 29's steppers.
- **30**: the pill stays "Begin set 1". Warm-ups are a reference strip and are
  never logged (§7), so "Begin met opwarmen" would promise an action that does
  not exist.
- **31b**: "Vervang deze oefening" uses the artboard's "met stabielere varianten
  bovenaan" only when the region actually narrows the list; otherwise it says
  the list does not change.
- **Onboarding** runs after registration only; a returning sign-in goes
  straight in.

Across screens:

- **Sheets** (07, 11R/12R, 14, 15R/15Rb, 31): iOS 26 draws a partial-height
  sheet as a floating card — about 9pt in from the sides and bottom, rounded on
  all four corners, its content at about 96% — and offers no way to attach it
  to the edges. The artboards' edge-to-edge sheet with its .16 top edge would
  need a hand-built panel, and the system sheet's VoiceOver behaviour,
  drag-to-dismiss and keyboard handling with it.
- **A border that appears on selection draws inside the control.** The mock
  adds every 1px border outside the box, so its selected RIR, plate-load and
  Progressie chips, its next-up set row and its newest check-in thumbnail are
  2pt larger than their neighbours. Here they keep their size, so nothing moves
  when it is tapped. Surfaces bordered in every state do take the extra 2pt
  (`slBorderBox()`), as the mock renders them.
- **Text below 20pt** is set with SF Pro's Text optical size and iOS's line
  breaking, which avoids a lone word on a last line. The mock's browser draws
  small text 3–5% narrower and keeps such orphans, so a line can break one word
  earlier (03's title, 19's subtitle, 18R's footnote).
- **Tab screens** keep 12pt between the commit pill and the tab bar. 08 and 09
  draw the pill partly behind the bar, 21 and 22 flush against it.
- **Tab bar**: the glyphs are the mock's own Material Symbols (exercise,
  nutrition, trending_up, photo_camera, account_circle) as vector assets. The
  bar keeps its size at large text sizes instead of overflowing.
- **App icon**: the design has no icon artboard. The Home Screen icon is the
  approved SETLINE wordmark (600 weight, .16em tracking, as the Review header
  sets it) centred on the ground colour; there are no dark or tinted variants.

### Known technical debt

- **Device clocks decide deletions and resets.** A deletion record
  (`syncTombstones`) or an account reset (`syncReset`) is compared with the time
  a change was made, as each device's own clock recorded it. A badly wrong clock
  can let a change made just before a deletion win, or drop one made just after.
  Accepted for V1.
- **Deletion records expire after 180 days.** A device that stays offline for
  longer, holding a change to a session deleted meanwhile, can bring that
  session back.
- **Deletions from before deletion records existed left no trace.** A device
  copy saved by a build older than the change log is recovered by adding what
  the account lacks, so a session deleted on the web before then would come back
  from it.

## Run without an account

Two DEBUG-only launch arguments, for development and screenshots. They use
fabricated data; `PRIVATE-DATA/` is never bundled.

| Argument | Effect |
| --- | --- |
| `-SetlineDemoData` | Signs in as a demo user with three prior push sessions |
| `-SetlineOpenSession` | Opens straight into today's session |
| `-SetlineLoggedSets` | Writes the first two sets, so delta and PR states show |
| `-SetlineComplete` | Jumps to the session summary |

Set them under Product → Scheme → Edit Scheme → Run → Arguments.

## Tests

The domain, engine, catalogue and legacy adapter live in `SetlineCore`, a
plain Swift package with no UI, so the whole training engine is testable on
macOS without a simulator:

```bash
cd ios/SetlineCore && swift test
```

The acceptance gate is `LegacyRoundTripTests`: it reads the real export at
`PRIVATE-DATA/yascha-training-backup.json` in place, imports it, writes it
back and asserts nothing changed. It skips itself when that file is absent.

## Regenerating the catalogue

`ExerciseCatalog`, `GuidanceCatalog`, `AlternativesCatalog` and `PlanCatalog`
are generated from `app/page.tsx` so the Dutch content is carried over rather
than retyped:

```bash
python3 ios/SetlineCore/Tools/generate.py
```

Run it from the repository root. `Tools/attrs.py` holds the hand-authored
per-exercise attributes (equipment, role, compound, unilateral); everything
else comes from the web app.
