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
| `sessions` | both, per session | iOS writes the session it logged; within a session, `results` merge per exercise, so neither app drops the other's. A correction made from Historiek is narrower still: `correctSessionSets(sessionID:corrections:)` rewrites only the values of the sets it names, found by session id → exercise result → the set's place in it |
| `metrics` | both, per weigh-in | `upsertMetric` — one day's row, by its own id. A day holds one weigh-in, so weighing again on a day corrects that row instead of adding a second; `waist` is the web app's field and is carried through untouched |
| `completed`, `performance`, `chatMessages`, `recoveryDraft` | web | iOS reads none of these and writes none of them |
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

### Browsing dates

Training holds one selected date, and three things divide the work (41):

- **Training** is what happens on the selected date. The drawer at the top
  carries the date, the week rail and the way into the agenda; under it the
  date's own slots — its name at 56, one line about it, what it is made of,
  and one action. Selecting a date is reading: it never creates a session,
  moves the schedule or touches history, and the lime stays Training's own —
  it starts today's workout and nothing else.
- **The agenda** is the same drawer, pulled open (41d): four weeks under each
  other in the rail's own language, with the month either side of it. It
  browses dates; it writes nothing.
- **`Wijzig deze dag`** (41e–41g) changes which session belongs to one date,
  and is the only thing on this screen that writes. It is reached from the
  foot of the day or by holding a day in the rail. It offers the sessions of
  the active programme, rest, and the programme's own standard; a change
  replaces the one before it, going back to standard removes it, and a date
  whose session is logged cannot be assigned at all — it belongs to what was
  done on it, and the sheet points at the session instead.
- **Historiek** lists sessions, and its detail screen (35) is the *only* screen
  that shows a saved session. Training and Historiek open that same screen.

All of them read one set of sources: `WeekPlan`/`Schedule` for what a date
holds, `scheduleOverrides` for what was set by hand, `sessions` for what was
saved, and `SessionPrescription` for what a lighter week does to it.
`Agenda.week(...)` resolves a date to exactly one of *saved session*, *planned
day*, *planned but past* or *rest*, in that order, so a date that has a session
is described by the session and never by today's programme. `DayPlan` builds
the one change the sheet writes — `setScheduleDay` or `removeScheduleOverride`,
for that date's own key and nothing else.

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
- **33** is drawn for a planned day. A day that passed unlogged opens the same
  screen, with the eyebrow dropping "gepland" and the footnote saying nothing
  was saved — the alternative was a second, nearly identical artboard.
- **34e** (an empty week, `Plan blok 3`) has no counterpart here. The programme
  repeats week on week, so no week is ever empty; a week with nothing logged
  says "geen sessies gelogd" instead.
- **35** keeps a row per logged set, which the artboard does not draw: the
  screen exists so a set can be checked and corrected, and 35 only summarises.
  Its `Wijzig` and per-set sheet are that correction; its "Notitie toevoegen" is
  not here, because sessions carry no note field on the wire.
- **16R's `Pauze-reps` is a count, not a switch.** The chip opens a stepper
  bounded by the reps performed, because "120 kg × 6, de laatste 2 gepauzeerd"
  is one set of six reps and not two sets. The count sits *inside* `reps`:
  volume counts six, the session counts one set, and the set stays out of
  progression exactly as a mixed set always did. Every rep paused is simply a
  paused set — `pauseEnabled`, no count — which is the shape planned paused
  work has always had, so its own series is unaffected. Historiek and the set
  grid say "2 pauze-reps" where only some were, "pauze" where all were.
- **19** has no advisory line, on request. The drag planner itself survives
  only behind Account and the pre-flight's own link: every date change on
  Training goes through 41's assignment sheet, which writes the same per-date
  override the planner wrote.
- **41c's foot** keeps `Wijzig deze dag` clear of the tab bar. The artboard
  lets its last 8pt sit behind the bar, as 08 and 09 do with their pill; here
  every state ends 6 above it instead, so nothing is drawn under a control.
- **41 draws no training day.** Today's own session fills the same slots a
  selected day does (41b's name, count line and exercise list), keeps 09's one
  lime insight under them, and takes the lime `Start` as its action. A paused
  session replaces that action with `Hervat sessie`, and the text button below
  it with `Beëindig sessie`, because ending one must stay reachable.
- **The week label** in the open drawer names the week and the Monday it
  starts on ("Week 4 · 28 sep"). 41d's "laatste van blok 2" needs a block
  model, which the repeating programme does not have.
- **20**: Progressie's `Lichaam` and `Historiek` segments have no artboard; they
  are built from 20's own parts — `Lichaam`'s weigh-in sheet included, which
  asks for the one number the account stores and is reachable from every state
  the segment has. So are the other screens no artboard draws:
  the session detail behind a Historiek row and its `Wijzig` mode (17R's blocks
  in review context), Voeding's add-food sheet, Account's programme and
  day-target sheets, Foto's empty state and an expired sign-in (23's sync block
  with 24's retry).
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

- **A failed set is not kept.** `Mislukt` sets `SetFlags.failed` while the
  session runs, and the flag is what keeps that set out of progression and
  records. It is never written to the shared state — the wire format has no
  field for it and `LegacyAdapter` reads every stored set back with no flags —
  so a saved session cannot show or correct it. Marking a set failed after the
  fact needs a new set field agreed with the web app.
- **Week planning cannot be reached from the Agenda's own detail.** `Wijzig
  planning` opens `WeekPlanView` on the current week, whichever week the Agenda
  is showing. Moving a session two weeks out still means walking there in the
  planner.
- **The web app still adds a paused count onto the reps beside it.** Its
  `completedReps()` is `reps + pausedReps`, so a set this app writes as six
  reps with two of them paused reads as eight there. This port never sums
  (TRAINING_LOGIC §15 change 2), and the account's two historical sets that
  carry both numbers are read here as the reps that were performed. Bringing
  the two readings together means changing the web app's own, which this
  release does not.
- **A stored set has no id.** Sets are identified by their place in their
  exercise result, on the wire and in every merge; `LoggedSet.id` is minted
  while parsing and does not survive a reload. Corrections therefore address a
  set positionally and never reorder, insert or remove one. If both clients
  ever need to edit the same session's sets concurrently, sets need ids in the
  shared format first.

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
