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

Training holds one selected date, and three things divide the work (redesign
1a):

- **Training** is what happens on the selected date. Under the date, the week
  strip carries the seven days and the way into the `Agenda`; under it one
  compact card for the selected date — its name, one line about it, one meta
  row, and one action. Tapping a day or swiping the
  card selects another date. Selecting a date is reading: it never creates a
  session, moves the schedule or touches history, and the lime stays
  Training's own — `Start training` starts today's workout and nothing else,
  and `Oefeningen bekijken` opens the preview, which starts nothing.
- **The agenda** is a sheet over Training: one week at a time — how much of it
  is done, its seven days, the best set of each session the week before —
  stepped back and forth, with `Hele maand` to jump to a date. A row opens
  what its day holds: a saved session's results, a planned day's preview, or
  `Wijzig deze dag` for a rest day. It browses dates; it writes nothing.
- **`Wijzig deze dag`** (41e–41g) changes which session belongs to one date,
  and is the only thing on this screen that writes. It is reached from a day's
  preview, from a rest day in the agenda, or by holding a day in the strip or
  the agenda. It offers the sessions of
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

### Writing down a workout you already did

A date that has gone by with nothing logged offers `Achteraf loggen` — on its
card and in its preview. It opens the same session screen — the same
logging, the same progression — with three differences that keep the record
honest:

- The session carries **that date**, not today's. The header says which day it
  is writing down instead of counting a clock, and the summary names the date
  without a duration.
- **No duration is invented.** The minutes it takes to type are not the minutes
  it took to train, and `SessionHistory` already says nothing about time for a
  session that recorded none.
- **No rest timer runs.** There is nothing left to rest for.

A day whose plan says rest, or says another session than the one you did, is
set with `Wijzig deze dag` first; the foot then offers to log it. One workout
per date still holds: logging a date that already has a session reuses that
session's id rather than adding a second.

### Correcting a saved workout

`Historiek` → a session → `Wijzig` edits the sets of that session. A set is
corrected in the sheet that logged it, and now also removed there
(`Verwijder deze set`):

- A removal names the set the way a correction does — exercise, which result
  when a session holds the same exercise twice, and its place in that result —
  and is applied from the back of each result forward, so removing one set
  never moves another out from under the request.
- An exercise left with no sets leaves the session; a session left with no sets
  leaves the account, and the alert says so before it happens.
- The set counts iOS derives from the results go with the change, exactly as
  they do when any other client rewrites them, because a count that no longer
  matches the sets is worse than no count.

### Finding an exercise, and reading its 1RM

Progressie's `Kracht` segment shows one exercise at a time, and the exercise's
own name is the control (40a): it says what you are looking at and is where you
change it.

- **The picker** (40b–40d) offers the catalogue, not the history. It opens on
  what you starred, or — with nothing starred (40c) — on what you trained last,
  with the six muscle groups under it and a search across all of them. Every
  row says when it was last trained, or that it never was; an exercise with
  nothing logged is still pickable, because a list of only what you have done
  cannot tell you what is there. `MuscleGroup` folds the engine's nineteen
  muscles into the six a person picks from, for choosing and naming only —
  nothing ranks, balances or substitutes by it.
- **The star** writes one exercise at a time (`setFavoriteExercise`), into the
  iOS-only `iosFavoriteExercises` key, beside `iosHiddenWarmups` and the other
  keys the web app carries through untouched. A star set on another device is
  never overwritten by this one's list.
- **The series** is the one the account actually has, not the one the plan
  prescribes. Bench pressed touch-and-go and bench pressed with a two-second
  pause are two series of one lift (§9.2), and reading the plan's modifiers
  hid every session trained the other way. `ExerciseHistory.series` finds them,
  the one with the most sessions leads, and when there is more than one its
  name joins the line under the title ("Borst · zonder pauze").
  Only the leading series is drawn: the design has no control for switching
  between them, so a lift trained two ways shows the one you do most and names
  it. Every session is still in `Historiek` and still counts for its own
  series' progression.
- **The estimate** is stated in three layers (40a): the number, what it moved
  *since a date* — a date can be placed, "in 8 weken" cannot — and the set it
  was computed from. The ⓘ opens 40e, which puts the same three numbers in a
  row so the arithmetic is visible: the delta is the difference between two
  estimates, not between two lifts. That is also why the change on screen is
  computed from the two rounded numbers on screen (`shownChange`), so 126,5 −
  120,5 reads as 6 rather than 6,5.

### Logging a day's food

Voeding reads the day as one list (redesign 1c), in meal order — Ontbijt,
Lunch, Avondeten, Snacks — and three things divide the work:

- **The day** is what is left to eat — the only loud number — with the day's
  macros under it, once, and then `Vandaag gegeten`: one row per item, saying
  when it was logged, which meal it belongs to, how much of it and what it
  cost. Tapping a row opens the item; swiping it offers to remove it with five
  seconds to undo. Amber appears once, and only when the log earns it: two or
  more whole days in a row under the protein target (`ProteinShortfall`).
- **`Maaltijd loggen`** (42c) opens on the meal the hour suggests, one tap from
  any other. Under the meal: a search, then what this account eats at
  this meal most often, then what it logged last. Both lists are its own
  entries — `FoodMemory` reads them, nothing is invented, and a row is offered
  back at the amount it was logged at. The search is the web app's own
  endpoint (`/api/food-search`), shown in the order the server ranked it.
  It asks with a token that is refreshed first when it has expired, through
  the coordinator sync uses; a search the server refuses says so, offers
  `Zelf invullen`, and never signs the account out. Whatever is added is
  stamped with the moment it is added — not when the sheet or the screen
  was opened.
- **The item** (42d) changes one entry: how much of it, which meal it belongs
  to, or nothing at all. The amount is a stepper whose label says what one tap
  is worth, and the macros under it are what that amount is worth, recomputed
  as it changes, so nothing is saved that was not read first. Its id, its date
  and the hour it was logged at are kept — moving a late lunch under `Lunch`
  does not rewrite the clock.

Every write is one entry: `upsertNutritionEntry` or `removeNutritionEntry` for
that id, merged field by field at the far end. The day itself, the other meals
and the targets are never rewritten to change one row.

An entry this app writes carries three keys the web app does not model —
`amount`, `unit` and `loggedAt`. The shared merge only changes the fields a
client knows (`WEB_ITEM_FIELDS` in `lib/state-merge.ts`, `StateMerge` in
SetlineCore), so they survive a web edit untouched; the web app does not show
them.

### The SETLINE redesign (1a–1e)

`SETLINE Redesign.dc.html` (Claude Design) restyles Training, the session,
Voeding, Progressie and Foto's, and is the visual source of truth for them where
it and the artboards below disagree, except where the overrides below say
otherwise. Account and the tab bar's five places stay SETLINE Main's. Archivo is bundled (`Fonts/`, its SIL Open
Font License beside it). The design names "Archivo Expanded" for numbers; no
such family is published, and the design file itself renders them in Archivo
at normal width, as the app does.

What the redesign changed in how the app is used:

- **Progressie** opens on an overview — weight, best sets, volume — at 1d's
  card heights. The weight card itself opens Lichaam (the chevron by its
  label says so; a link inside it made the card a row taller than 1d), a
  best-set row opens its exercise in Kracht, and `Kracht per oefening` and
  `Alle sessies` open Kracht and Historiek. `+ Weeg jezelf` sits by the
  title; once today is weighed it reads `Weging wijzigen`, without the plus.
- **Foto's** compares the first and the latest check-in; `Andere datums
  kiezen` compares any two. A check-in is dated by when its picture was
  taken (the camera's own record, `PhotoDate`), not the day it was added,
  so a July photo picked today sits in July beside July's weigh-in. The
  time between two is stated as it is — `zelfde dag`, days, then weeks —
  and the weight between them only when both days have a weigh-in.

Where the app differs from the redesign, on purpose (the user's overrides
first):

- **The tab bar keeps Main's five places** — Training, Voeding, Progressie,
  Foto's, Account — in the redesign's own style. There is no `Loggen` tab:
  logging starts from Training, and Account stays the screen it was, a tab of
  its own, with the redesign's type and colour only.
- **Training has no greeting, no avatar and no `Rest van de week`.** Its head is
  the date the card is on. The card draws no oversized word behind the name.
  Every kind of date — today, a later one, rest, missed, done — fills the
  same shell at 1a's height for today (287 pt outside at ordinary text
  sizes), so the title, the meta row and the top of the action never move
  when the date changes; at the accessibility sizes the card grows instead.
  To fit that height it holds only 1a's slots: no progression line, no
  "verplaatst van" note, no volume on a done day — the preview and the
  results carry those. A rest day takes 1a's own `Naar agenda`.
- **Herstel is built from logged sets**, not from sleep, readiness and HRV
  (HealthKit is out of scope). The card keeps the design's shape — the
  proposal, the evidence under a hairline, `Overnemen` and `Negeren` — and is
  shown only while there is a proposal, the lighter days it led to, or its
  dismissal.
- **Voeding has no `Maaltijd fotograferen`.** Nothing recognises food in a
  photo; `Maaltijd loggen` is the one way in.
- **The session** keeps what the design has no room for: `‹ Training` (or
  `‹ Pauzeer` once anything changed) and `Afronden` beside the clock,
  `Meer` for the entry sheet's tools, the RIR chips when a set asks for one,
  `Set toevoegen`, and the day's exercises under the sets. The reps stepper
  is 140 wide rather than 132, so a two-digit count keeps its size between
  the two 44-point buttons.
- **The agenda** steps through weeks and opens a whole month; the design
  draws this week only.
- **The preview** adds `Achteraf loggen` for a day that went by unlogged, and
  `Wijzig deze dag` for any day not yet logged.
- **At accessibility text sizes** rows stack — the date and the mark on one
  line, the text under them — and titles and section heads give their meta a
  line of its own, so no word is broken to fit. The design draws the default
  size only.

### Where the app differs from the design, on purpose

Screen by screen, against the earlier artboards:

- **05** has no "Eigen plan" option: there is no plan editor behind it.
- **09** has no "Herstel · slaap, HRV" line (HealthKit is out of scope).
- **10**'s pre-flight is gone. The redesign splits it in two: `Start training`
  starts, and `Oefeningen bekijken` opens the preview (1a), which starts
  nothing. A session opened by mistake closes from `‹ Training` and leaves
  nothing behind, as long as nothing in it was changed; a paused one stays
  paused, as it was.
- **11–13 / 11R–13R**: the session keeps a list of the day's exercises under
  the sets. No artboard draws one, but it is the only way back to an earlier
  exercise to correct a set.
- **11R / 12R** draw the entry sheet without a tools row. The app keeps 12's
  `Toetsenblok · Mislukt · Pauze-reps` and adds `Partieel`, because 16R's
  failed, paused and partial sets are entered there.
- **The rest timer** is 1b's one row above the input card — `RUST`, the time,
  `+30s`, skip — and a tap opens the larger version with `−30s`, `+30s`, the
  prescribed rest and skip. It stays the size it was left at; it no longer
  folds by itself. A rest that is counting when the session is paused rides in
  the paused session (`ActiveSessionSnapshot.rest`) and comes back on resume
  with the time it has left — rest is wall-clock time, so it kept running
  while the session was parked. One that ran out meanwhile does not come back,
  and a session paused between rests resumes without a timer.
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
  only behind Account: every date change on Training goes through 41's
  assignment sheet, which writes the same per-date override the planner wrote.
- **A paused session** replaces today's lime `Start training` with `Hervat
  training`, and puts `Beëindig sessie` under it, because ending one must stay
  reachable.
- **The week label** over the strip says how far the week lies from this one
  ("Deze week", "Vorige week", "Over 2 weken"). 41d's "laatste van blok 2"
  needs a block model, which the repeating programme does not have.
- **40a colours a gain, not a drop.** The artboard only draws a rise, and lime
  is what a rise reads as; a fall is stated in the sentence's own ink rather
  than in lime that would read as a win, or in red that would read as a
  verdict.
- **40a's session row states the date and the set,** and no longer carries the
  PR badge or the per-session delta the chip-era row had. The artboard draws
  two spans; a record is still a record in the session summary and in the
  history, where the workout it belongs to is.
- **The exercise picker offers the whole catalogue,** so its counts are the
  catalogue's own (65 across six groups) rather than the artboard's mocked 38.
  An exercise without authored attributes has no group to file it under and is
  left out rather than dropped into a wrong one.
- **42c's barcode button is not built.** There is no barcode lookup behind it
  on either client, and a control that cannot answer is worse than no control.
  The search field beside it is the one the artboard draws.
- **42c keeps `Zelf invullen`,** which it does not draw: the search already
  says "vul de waarden zelf in" when it finds nothing, and food no database
  knows has to stay loggable. It sits under the lists, out of the way.
- **A search result is logged at 100 g,** the amount its values are given for,
  and changed afterwards on the row itself (42d). 42c's own rows are previous
  entries, which already carry an amount.
- **A sheet is drawn ~4% smaller than its points.** iOS 26 presents these
  sheets as inset cards and scales their contents to fit; the numbers in the
  code are the artboard's, and the system applies that card uniformly.
- **20's exercise chips are gone**, replaced by 40a's title-as-picker. The rest
  of 20 stands.
- **20**: Progressie's `Lichaam` and `Historiek` segments have no artboard; they
  are built from 20's own parts — `Lichaam`'s weigh-in sheet included, which
  asks for the one number the account stores and is reachable from every state
  the segment has. So are the other screens no artboard draws:
  the session detail behind a Historiek row and its `Wijzig` mode (17R's blocks
  in review context), Account's programme and day-target sheets, Foto's empty
  state and an expired sign-in (23's sync block with 24's retry).
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
- **Text** is set with iOS's line breaking, which avoids a lone word on a last
  line. The mock's browser keeps such orphans, so a line can break one word
  earlier than it does there.
- **Tab screens** end 4pt above the tab bar, as the redesign leaves it, so
  nothing scrolls under a control.
- **Tab bar**: the glyphs are the redesign's own (calendar, barbell, fork,
  chart, camera) as vector assets. The bar keeps its size at large text sizes
  instead of overflowing.
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
- **The week planner is reached from Account only** (`Trainingsdagen`), and
  opens on the current week. One date is changed from wherever it is shown
  (`Wijzig deze dag`); moving a whole week two weeks out still means walking
  there in the planner.
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

DEBUG-only launch arguments, for development and screenshots. They use
fabricated data; `PRIVATE-DATA/` is never bundled.

| Argument | Effect |
| --- | --- |
| `-SetlineDemoData` | Signs in as a demo user with three prior push sessions and a week of meals |
| `-SetlineResetDemo` | Starts from the fabricated data again instead of what the device holds |
| `-SetlineEmptyDay` | Keeps the food history and leaves today blank (42b) |
| `-SetlineOpenSession` | Opens straight into today's session |
| `-SetlineLoggedSets` | Writes the first two sets, so delta and PR states show |
| `-SetlineComplete` | Jumps to the session summary |
| `-SetlineRestDay` | Makes today a rest day in the demo data |
| `-SetlineTab <tab>` | Opens on `training`, `voeding`, `progressie`, `fotos` or `account` |
| `-SetlineAgenda` | Opens the agenda over Training |
| `-SetlinePreview` | Opens the preview of today's session, on a training day |
| `-SetlineAccount` | Opens on the Account tab |
| `-SetlineRestOpen` | Shows the rest timer at its larger size once a rest runs |

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
