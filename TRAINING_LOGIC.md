# TRAINING_LOGIC.md — Setline (native iOS)

Specification of the training engine: what Setline computes, what it recommends, and
what it is not allowed to claim. Written to be implemented by one developer and
designed against by one designer without further interpretation.

Scope: progression, prescription, autoregulation, PR detection, fatigue management,
exercise substitution. Out of scope: nutrition, photos, sync, visual design.

Status of the current web app is referenced throughout as **[current]**. Where this
spec changes existing behaviour it says so explicitly and why.

---

## 0. Evidence policy

Every rule in this document carries a tier. The tier is a product requirement, not a
footnote: it decides how assertive the UI is allowed to be.

| Tier | Meaning | UI register |
|---|---|---|
| **A — Strong** | Supported by systematic review / meta-analysis or converging professional guidance (ACSM, NSCA). | Setline may state it as fact and act on it by default. |
| **B — Inference** | Reasonable coaching inference: consistent with A-tier evidence and mainstream evidence-based practice, but not directly tested. | Setline may act on it as a default, and must be able to explain the reasoning if asked. Must be user-overridable. |
| **C — Uncertain / debated** | Evidence thin, conflicting, or mechanistic only. | Setline may offer it, never impose it. Never phrased as "research shows". |

Rules:

1. Educators (Nippard, Helms, Wolf, Israetel and similar) are used only as
   **interpretation of primary literature**. A claim that traces to an educator and
   to no study is tier C at best. Never cite a person as evidence in the UI.
2. Any number shown to the user that comes from a model (estimated 1RM, estimated
   weekly volume, readiness) is labelled as an estimate at the point of display.
3. Setline never makes medical, diagnostic or rehabilitative claims. See §14.
4. When evidence is genuinely equivocal, the default is the option that is **cheaper
   to be wrong about** — usually the more conservative one.

### Primary sources this spec leans on

- Robinson et al. (2024), *Sports Medicine* — meta-regressions on proximity to failure:
  hypertrophy improves as sets are taken closer to failure; **strength gains show a
  negligible relationship with RIR**. Model fit modest; authors call it exploratory.
- Pelland et al. (2025), *Sports Medicine* — dose–response meta-regressions (67 studies,
  2,058 participants): more weekly sets → more hypertrophy and strength with **100%
  posterior probability**, but with **diminishing returns, steeper for strength**.
  Frequency raises strength; frequency effects on hypertrophy compatible with negligible.
  **Fractional set counting (indirect sets = 0.5) predicted adaptations best.**
- Singer et al. (2024), *Frontiers in Sports and Active Living* — Bayesian meta-analysis
  on inter-set rest: hypertrophy occurs across a wide range of rest durations; small
  advantage for **>60 s over ≤60 s**; no appreciable further benefit detected beyond
  ~90 s. Notes this conflicts with NSCA's 30–90 s hypertrophy guidance.
- Schoenfeld, Grgic, Van Every & Plotkin (2021), *Sports* — repetition continuum
  re-examined: **similar whole-muscle growth across loads ≥ ~30% 1RM**; heavy loads
  retain a clear advantage for **1RM strength tested in the trained exercise**.
- Nunes et al. (2021), *European Journal of Sport Science* — exercise order meta-analysis:
  exercises trained **earlier in a session gain more strength**; hypertrophy differences
  trivial.
- Halperin et al. and follow-ups (summarised by Stronger By Science) — RIR estimation is
  **systematically under-predicted by ~1 rep**; accuracy is better at ≤12 reps and better
  near the end of a set; training status has little effect.
- Bell et al. (2025) — practical deloading review: deloads every 4–8 weeks, mainly via
  **volume reduction (25–90%)** or ~10% intensity reduction / RIR +1–3; explicitly notes
  a **"clear absence of high-quality experimental research"** on deload benefits.
- Coleman et al. (2024), *PeerJ* — a 1-week mid-block deload produced **similar
  hypertrophy** but **worse strength gains** than continuous training over 9 weeks.
- ACSM (2009) position stand, *Progression Models in Resistance Training for Healthy
  Adults* — professional baseline. Treated as guidance, not as current on rest intervals.
- Silbernagel, Thomeé et al. (2007) — pain-monitoring model: continued loading with pain
  kept within an acceptable band, settling by the next morning and not escalating
  week to week. Used in §14 as a **self-monitoring aid**, never as diagnosis.

---

## 1. Core data model

**[current]** prescription, load and rest are free-text Dutch strings (`"1×5–6 + 2×6–8"`,
`"120 kg → 105–110 kg"`, `"4–5 min"`) parsed with regex at runtime
(`progressionTargets()`). This is the single biggest source of fragility and must not
survive into the native app. Text is a rendering of the model, never the model.

```
Exercise {
  id: String
  name: LocalizedString
  primaryMuscles: [MuscleContribution]     // muscle + weight 0…1, sums to ~1
  secondaryMuscles: [MuscleContribution]
  movementPattern: enum                     // horizontalPress, verticalPress,
                                            // horizontalPull, verticalPull, squat,
                                            // hinge, lunge, isolationFlexion, …
  jointActions: [JointAction]               // e.g. [shoulderHorizontalAdduction,
                                            //       elbowExtension]
  isCompound: Bool                          // derived: jointActions.count > 1
  equipment: Equipment                      // barbell, dumbbell, machinePlate,
                                            // machineSelectorised, cable, smith,
                                            // bodyweight, band
  loadIncrement: Increment                  // smallest real-world step, per equipment
  stabilityDemand: Int 1…5                  // 1 = fully supported machine, 5 = free
  resistanceProfile: enum                   // lengthenedBias, midRangeBias,
                                            // shortenedBias, flatCable
  lengthenedBiasedROM: Bool
  fatigueCost: Int 1…5                      // systemic cost, not local burn
  unilateral: Bool
  loadTags: [LoadTag]                       // axialSpinalLoad, overheadPosition,
                                            // deepKneeFlexion, endRangeShoulder,
                                            // wristExtension, gripLimited …
  setupCost: Int 1…3
}

PlannedExercise {
  exerciseId: String
  role: enum { primaryStrength, secondaryCompound, accessory, isolation }
  targetSets: Int
  repRange: ClosedRange<Int>                // e.g. 6…10
  targetRIR: ClosedRange<Int>               // e.g. 1…2
  restSeconds: ClosedRange<Int>
  modifiers: SetModifiers                   // pause, tempo, ROM constraint
  progressionRule: ProgressionRuleId        // §3
}

LoggedSet {
  index: Int
  weightKg: Decimal?
  reps: Int
  rir: Int?                                 // optional, never blocking
  isWarmup: Bool                            // NEVER counted in volume or PR
  modifiers: SetModifiers                   // must match to be comparable
  substitutedFrom: String?                  // origin exercise id, if any
  flags: [failedSet, partialReps, technicalBreakdown]
}
```

**Comparability key.** Two sets may be compared (for progression, PR or trend) only
when `exerciseId`, `modifiers` and `unilateral` all match. This one rule prevents most
of the wrong-number bugs in a training app.

---

## 2. Goal profiles

Two goals, selected per program and overridable per exercise: **strength** and
**hypertrophy**. They are not separate apps; they change defaults in five places
(rep range, RIR target, rest, progression rule, PR emphasis).

| | Strength | Hypertrophy |
|---|---|---|
| Rep range, primary lift | 1–6 | 5–10 |
| Rep range, accessory | 5–10 | 8–15 (up to 20–30 for calves, delts, abs) |
| Target RIR, primary | 1–3 | 1–2 |
| Target RIR, isolation/machine | 1–3 | 0–2 |
| Rest, primary | 180–300 s | 120–180 s |
| Rest, isolation | 90–150 s | 90–120 s |
| Load progression | small, load-first | double progression, rep-first |
| PR headline | heaviest load / estimated 1RM | reps at load, volume-load |

Evidence notes:

- **A** — Load specificity holds for 1RM strength tested in the trained lift; growth is
  similar across loads ≥ ~30% 1RM (Schoenfeld 2021). Hence: heavy for strength,
  wide latitude for hypertrophy.
- **A** — Proximity to failure matters more for hypertrophy than for strength
  (Robinson 2024). Hence strength targets do **not** need to be closer to failure, and
  Setline must never push a strength user toward RIR 0.
- **B** — The 20–30 rep ceiling for small muscles is practicality (time, discomfort),
  not a growth requirement.

### Weekly volume

- Count **direct sets = 1.0, indirect/synergist sets = 0.5** (Pelland 2025, fractional
  counting predicted adaptations best). **A**
- Show weekly hard sets per muscle as an **estimate**, with a band, never a target ring
  with a "goal" the user can fail.
- Guidance copy: below ~4 fractional sets/week a muscle is flagged as under-stimulated;
  10–20 is described as the range most trainees operate in; above ~20 Setline says
  returns diminish and fatigue cost rises — it does **not** say "too much". **A** for
  the direction of the dose–response and diminishing returns; **B** for the exact
  numbers, which are practical anchors, not thresholds in the literature.
- Frequency: ≥2 sessions/week per muscle is the default recommendation, justified as
  the practical way to distribute volume, and as a strength benefit (**A** for strength,
  frequency effects on hypertrophy are compatible with negligible once volume is equated).

---

## 3. Progressive overload

**[current]** Setline already implements double progression well: hit the top of the
prescribed rep range on every set at the same load, confirm across **two** sessions,
then increase by the smallest available step (`progressStatus()`, `GUIDANCE.advanceAt`,
the `ready / close / neutral` tones). **Keep this.** It is a good rule and the
two-session confirmation is the part most apps get wrong. What changes is that it
becomes typed and RIR-aware instead of regex-parsed.

### 3.1 Rule DOUBLE_PROGRESSION (default, all hypertrophy work) — **B**

```
state: { load, consecutiveQualifyingSessions }

qualifies(session) =
      every working set reached repRange.upper
  AND every working set used the same load
  AND (rir logged? → median rir <= targetRIR.upper)

on session complete:
  if qualifies and load == state.load: consecutive += 1
  else if load == state.load:          consecutive = 0
  else:                                state.load = load; consecutive = qualifies ? 1 : 0

  if consecutive >= 2:
      propose load + loadIncrement, reps reset to repRange.lower
      consecutive = 0
```

- The confirmation requirement (2 sessions) exists to filter out a single good day.
  It is a coaching inference, not a tested protocol. **B**
- Setline **proposes**; it never silently rewrites the next session's load. The
  proposal appears pre-filled and editable on the first set of the next session.
- If the user misses the range at the new load for **2 consecutive sessions**, offer a
  step back to the previous load with a higher rep target, framed neutrally
  ("terug naar 100 kg, mik op 8"). Never call it a failure.

### 3.2 Rule LOAD_STEP (strength role, low reps) — **B**

For `role == primaryStrength` with `repRange.upper <= 6`: progress load when the top set
hits `repRange.upper` at `rir >= targetRIR.lower` **once**, not twice — low-rep sets have
less rep headroom to absorb a fluke, and the load step is proportionally small.

Increment: the smaller of `loadIncrement` and 2.5% of current load, rounded to a real
plate/pin step.

### 3.3 Increments (**A** in the trivial sense — these are equipment facts)

| Equipment | Default step |
|---|---|
| Barbell (pairs of 1.25 kg) | 2.5 kg total |
| Barbell with micro plates | 1.0 kg total |
| Dumbbells | next dumbbell in the user's gym (default 2 kg) |
| Selectorised machine / cable | 1 pin, plus add-on if configured |
| Plate-loaded machine | smallest plate available (default 2.5 kg per side) |
| Bodyweight loaded | 1.25–2.5 kg |

Gyms differ. The increment table is **per user, per gym**, editable, and defaults are
only defaults. A wrong increment silently sabotages every progression decision.

### 3.4 Other overload levers

When load cannot move (dumbbell gaps, machine stacks that jump 5–7 kg), the engine may
propose, in this order: **+1 rep within range → +1 set (respecting §2 volume) → improved
ROM/tempo quality → longer rest to preserve reps**. Adding a set changes weekly volume,
so it is proposed at most once per exercise per 4 weeks. **B**

---

## 4. RIR and RPE

Setline logs **RIR** (reps in reserve). RPE is displayed only as the derived
`RPE = 10 − RIR` for users who ask for it in settings. One scale internally.

**[current]** RIR appears only inside free-text `load` and `progression` strings. It is
never captured. This is the largest missing signal in the app.

Rules:

- RIR entry is **optional and never blocking**. A set with weight and reps is a complete
  set. Making RIR mandatory is the fastest way to lose a mid-set user.
- Entry appears as a 0/1/2/3/4+ segmented control in the set row, one tap, in the bottom
  third of the screen.
- **Interpretation bias — A.** Lifters under-predict reps remaining by roughly one rep on
  average, and accuracy is better at ≤12 reps and worse on high-rep sets. Therefore:
  - Setline treats logged RIR as **RIR_reported**, and reasons on
    `RIR_effective = RIR_reported + 1` only when deciding whether a *hypertrophy* set was
    close enough to failure. It never shows the adjusted number.
  - RIR values on sets above 15 reps are down-weighted to 0.5 in all aggregates.
  - RIR is never used to reject a PR or to overrule the user.
- **Where RIR actually changes behaviour:**
  1. Progression gating (§3.1) — a session where every set hit the top of the range at
     RIR 4 is not a signal to add load; it is a signal the load is too light, and the
     engine may propose a larger step.
  2. Fatigue detection (§8) — same load, same reps, falling RIR over sessions.
  3. Deload prescription — deload raises `targetRIR` by 2.
- **Failure — A/B.** Setline never prescribes RIR 0 for compound barbell work. It permits
  RIR 0–1 for machine and cable isolation, where the fatigue cost is local and the safety
  cost is near zero. Rationale: hypertrophy improves closer to failure (**A**), but
  systemic fatigue and technique degradation scale with load and joint count (**B**).
- Strength users are never nudged toward failure at all: RIR shows a negligible
  relationship with strength gains (**A**).

---

## 5. Sets and reps

- Prescriptions are typed: `targetSets`, `repRange`, `targetRIR`. The Dutch string
  `"1×5–6 + 2×6–8"` becomes two `PlannedExercise` entries or one entry with a per-set
  override array — not a parsed string. **[changes current]**
- A set counts as a **hard set** for volume when it is a working set within the planned
  rep range and (if RIR logged) `RIR_reported <= 3`. Warm-ups never count.
- Rep range width defaults to 4 (e.g. 6–10). Narrower ranges make double progression
  jumpy; wider ranges delay load increases. **B**
- A user may exceed the top of the range. Setline records it, and if it happens on
  every set it triggers the "load too light" proposal rather than a slow +1 rep crawl.
- Partial reps at the end of a set are logged as `flags: [partialReps]` with a count;
  they are shown in history but **excluded from progression and PR maths**. Their value
  is real but unquantified for our purposes. **C**

---

## 6. Rest times

Defaults, per §2 table. The engine's rules:

- **A** — >60 s beats ≤60 s for hypertrophy; no appreciable additional benefit was
  detected beyond ~90 s (Singer 2024). Setline therefore treats **90 s as a floor for
  isolation work** and does not claim benefit for very long rests on isolation.
- **B** — Compounds get 120–180 s (hypertrophy) or 180–300 s (strength) because the
  mechanism behind the rest effect is preserved reps, and rep loss between sets is
  largest on high-fatigue compound work.
- NSCA's older 30–90 s hypertrophy recommendation is **explicitly not implemented**;
  the Singer meta-analysis names it as inconsistent with current evidence. If a user
  chooses short rests, Setline supports it and adds one line: shorter rests usually cost
  reps on the following set.
- Timer behaviour (product requirements, from the design brief): auto-starts on set
  completion, runs in the background with a notification, adjustable ±15 s **without
  resetting**, remains visible while the set list scrolls, skippable in one tap.
- Rest overruns are recorded but never scolded. If actual rest is consistently >150% of
  target on a given exercise, offer to raise the default.

---

## 7. Warm-up sets

Evidence here is thin: reviews support warming up for performance, but there is **no
good evidence for a specific number of ramp sets**. Everything below is **B/C** and must
be framed as a suggested ramp, not a prescription.

**[current]** Per-exercise warm-up strings already exist in `GUIDANCE` and are good
content. Keep the text, generate the sets.

```
warmupPlan(topSetLoad, exercise, isFirstForMuscleGroup):
  if !isFirstForMuscleGroup and exercise.isCompound == false: return []          // 0–1 set
  if exercise.equipment == machine|cable and topSetLoad low: return [50% × 10]
  return [ 40–50% × 8,  60–70% × 4,  ~85% × 2 ]        // trim from the top if load is light
```

Rules:

- Warm-up sets are **never near failure**, never logged as working sets, never counted in
  volume, never eligible for a PR. `isWarmup` is enforced in every aggregate.
- The number of ramp sets scales with absolute load and with the exercise's
  `stabilityDemand`, not with the muscle.
- A general warm-up (5 min cardio / movement) is suggested once per session, before the
  first exercise only.
- The user can dismiss the ramp permanently per exercise. Setline remembers.

---

## 8. Exercise order

- **A** — Exercises performed earlier in a session gain more strength; hypertrophy
  differences between orders are trivial (Nunes 2021).
- Therefore the rule is: **order by what the user most wants to improve**, and the app's
  only opinion is a warning when a `primaryStrength` exercise is demoted below an
  accessory. One line, dismissible.
- Free reordering inside a session is allowed and does not invalidate anything: sets are
  attached to exercises, not to positions.
- **Recommended addition (not in the original brief).** When equipment is occupied, the
  first option offered should be *reorder*, not substitution: "Doe X nu, kom terug voor
  bench." Reordering preserves the exercise, its history, and its progression state;
  substitution does not. This is offered above the substitution sheet when a later
  exercise in the same session is available and is not itself a primary lift being
  demoted. If the user declines, the substitution sheet in §12 opens.

---

## 9. Paused reps

Setline already treats paused reps as first-class (`pauseEnabled`, `pauseSeconds`,
`pausedReps`, dedicated copy). The evidence position must be honest:

- **A** — For a competing powerlifter, a paused bench is the competition standard. Training
  the tested movement is specificity; this is not in question.
- **C** — That paused reps build more strength or muscle than touch-and-go in a general
  trainee is **not established**. The rationale (removing the stretch-shortening
  contribution, enforcing position at the hardest point, standardising ROM) is mechanistic
  and plausible, not demonstrated. Setline must not claim otherwise.
- **B** — The defensible product framing: pauses make a rep **more standardised and more
  comparable over time**, which is exactly what a tracking app benefits from.

Implementation rules:

1. `SetModifiers.pause = { enabled, seconds }` lives on the **planned** exercise and is
   copied onto each logged set.
2. **Bug to fix. [changes current]** `completedReps()` currently returns
   `reps + pausedReps`, so a paused rep and a normal rep are summed into one number that
   then drives progression status, PR detection and the strength trend. Paused and
   unpaused reps are different reps. In the native app:
   - `reps` is the total reps performed in the set.
   - `pause` is a property of the set (or of individual reps, if per-rep pausing is kept).
   - Progression and PR compare **like with like**: a set with `pause.enabled == true` is
     only ever compared to other paused sets of the same exercise with the same
     `pause.seconds` (±0.5 s tolerance).
3. Changing pause length mid-programme starts a new comparison series and the UI says so
   once: "2s → 3s pauze: dit is een nieuwe reeks, records tellen apart."
4. Pause duration is never auto-increased as a progression lever.

---

## 10. PR detection

**[current]** `bestStrengthSet()` uses Epley (`weight × (1 + reps/30)`), `strengthRecord()`
compares against the previous session and against an all-time best with a 0.05 tolerance,
and distinguishes "Nieuw persoonlijk record" from "Sterker dan vorige sessie". The shape
is right. It needs typing, guards, and honesty about the estimate.

### 10.1 Record types

| Type | Definition | Shown as |
|---|---|---|
| **Load PR** | Heaviest load moved for ≥1 clean rep in this exercise | "Zwaarste ooit · 125 kg × 3" |
| **Rep PR** | Most reps at a load already used before | "+2 reps op 100 kg" |
| **Estimated strength PR** | Highest Epley e1RM | "Geschatte kracht · 142 kg" |
| **Volume PR** | Highest exercise volume-load (Σ load × reps) in one session | secondary, history only |
| **Session best** | Better than last session, not an all-time record | "Sterker dan vorige sessie" |

### 10.2 Guards (all required)

1. **Comparability.** Same `exerciseId`, same `modifiers` (pause, tempo, ROM), same
   unilateral flag, `isWarmup == false`, no `technicalBreakdown` flag.
2. **e1RM validity — B.** Epley and its relatives lose accuracy as reps rise. Setline
   computes e1RM **only for sets of ≤10 reps** and labels it "geschat" every time it is
   shown. Above 10 reps: no e1RM, use Load PR and Rep PR only.
3. **Never across exercises — A/B.** An e1RM from an incline press says nothing about a
   flat press. e1RM is compared only within one exercise id. See §13.
4. **Baseline period.** No PR banners during the first **3 logged sessions** of a new
   exercise; that period is labelled "referentie opbouwen". Prevents a PR on every
   session of a new lift, which devalues the signal.
5. **Tolerance.** Use an explicit epsilon of **0.5 kg** on load and **0.5 kg** on e1RM
   rather than the current 0.05, so floating-point noise and 0.25 kg rounding never
   produce a record. **[changes current]**
6. **One banner per session per exercise**, highest-ranked type only, ranked
   Load PR > Rep PR > estimated strength PR > session best.
7. **Substituted sets never count** toward the origin exercise's records (§12.5).

### 10.3 Presentation

- A PR is a fact about a number, so it is presented as a number. No confetti, no badges —
  consistent with the design brief.
- Estimated PRs always carry the word "geschat". A user must never believe Setline
  watched them lift 142 kg.

---

## 11. Fatigue and deload

The honest position: **deload evidence is weak.** The best available practical review
states there is a clear absence of high-quality experimental work on deload benefits, and
one controlled trial found a mid-block week off produced similar hypertrophy but **worse**
strength gains than training through. So Setline does not schedule deloads by calendar and
never applies one automatically.

### 11.1 Fatigue signals (computed, shown as evidence, never as a verdict)

| Signal | Trigger |
|---|---|
| **Performance regression** | On ≥2 exercises in the same session type, reps at the same load fall for 2 consecutive sessions |
| **Effort drift** | Same load and reps, `RIR_reported` falls by ≥1 across 2 consecutive sessions |
| **Completion drop** | Planned sets completed <80% for 2 consecutive sessions |
| **Readiness** | Existing sleep / soreness / energy inputs low for ≥3 of the last 5 days |
| **Time under load** | ≥6 consecutive weeks without a lighter week, combined with any signal above |

No single signal fires a proposal. **Two or more** signals in the same 7-day window do.

### 11.2 The proposal

Setline shows a dismissible card with its reasoning visible — the same pattern the design
brief specifies for the recovery-aware suggestion:

> "Twee sessies op rij minder reps op hetzelfde gewicht, en je RIR daalt.
> Voorstel: 5 dagen lichter — zelfde oefeningen, 40% minder sets, RIR +2.
> Gewicht blijft."
> **[Toepassen] [Niet nu]**

Prescription defaults (**B**, drawn from the practical deload literature):

- **Volume −40%** (range 25–60% depending on how many signals fired), by cutting sets,
  not exercises.
- **RIR +2** (equivalently ~10% load reduction if the user prefers), never both.
- **Frequency unchanged** — reduce it only if the user reports illness or injury.
- **Duration 5–7 days**, then automatic return to the prior prescription.
- Exercise selection unchanged, so progression state survives.

Rules:

- Never auto-applied. Never scheduled without a signal. Always reversible mid-week.
- A user may pin a planned lighter week every N weeks if they want one; the UI presents
  this as a preference, not as a recommendation, and says the evidence is limited.
- After a deload, progression resumes at the pre-deload load with the pre-deload rep
  target — a deload is not a reset. **B**

---

## 12. Exercise substitution

The scenario that drives this: the bar is taken and the user is standing in the gym with
90 seconds of patience. The whole flow is **two taps to a swap**.

### 12.1 The sheet

Opened from the exercise row. Contents, in fixed order:

0. *(recommended addition, §8)* **"Doe X nu, kom terug"** — reorder within the session,
   shown only when a later exercise is free. Preserves everything.
1. **Best alternative**
2. **Second alternative**
3. **Third alternative**
4. **Browse / search** — full catalogue, filtered by the same muscle by default
5. **Custom exercise** — user-defined, gets its own history from zero

Each of 1–3 shows: name, a one- or two-word fit label, one line of reasoning, and what
carries over. **[current]** already does this well in Dutch (`fit` + `why` in
`ALTERNATIVES`), but with only two hand-written options per exercise and no attributes
behind them. The native app computes the ranking from attributes and uses the written
`why` lines as curated overrides where they exist.

### 12.2 Ranking

Hard filters first (an exercise failing any of these is not shown as 1–3, though it
remains findable in Browse):

- Equipment marked unavailable in this session
- Any `loadTag` the user has flagged for pain in the last 14 days (§14)
- Gym profile: equipment the user's gym does not have

Then score, 0–1:

```
score =
  0.30 × primaryMuscleOverlap        // cosine similarity of muscle-contribution vectors
+ 0.20 × jointActionMatch            // exact set match 1.0, superset 0.6, partial 0.3
+ 0.12 × movementPatternMatch
+ 0.10 × resistanceProfileMatch      // incl. lengthenedBiasedROM equality
+ 0.10 × stabilityFit                // 1 − |Δ stabilityDemand| / 4
+ 0.08 × fatigueFit                  // penalise higher fatigueCost late in a session
+ 0.05 × goalFit                     // §2 profile: rep range and role feasibility
+ 0.05 × familiarity                 // user has logged it before
```

Context modifiers (this is where "current workout intent" enters):

- `role == primaryStrength` → jointActionMatch and movementPatternMatch weights ×1.5,
  and isolation exercises are excluded from slots 1–3.
- `role == isolation` → primaryMuscleOverlap and resistanceProfileMatch ×1.3; a different
  movement pattern is acceptable if the target muscle and profile match.
- Sets already completed in this session on the same muscle → fatigueFit weight ×2.
- Late in a session (>60% of planned sets done) → penalise `setupCost` and
  `stabilityDemand`.
- Reason = pain (§14) → hard-prefer lower `stabilityDemand` and exclude matching
  `loadTags`; the top slot is allowed to be a *smaller* exercise than the original.

Diversity rule: the three alternatives must not be near-duplicates of each other. If two
candidates differ by <0.05 in score and share equipment and pattern, keep the higher and
take the next distinct one. A user who cannot use the bench does not need three bench
variations.

Presentation of tier: alternative 1 may be labelled "sterke match" only when
`score ≥ 0.75` and muscle overlap ≥ 0.8. Otherwise the honest label is "andere prikkel,
zelfde doelspier" or similar. Never oversell a swap.

### 12.3 Load on a substitute — no conversion

**Rule (A/B): Setline never converts load between exercises.** Not by e1RM ratio, not by
a coefficient table, not "80% of your bench". Rep-max prediction is exercise-specific and
noisy even within one lift; between lifts it is unsupported. The UI never shows a
suggested kilo figure derived from a different exercise.

What happens instead:

1. **History exists for the substitute** → prefill from that exercise's own last session.
2. **No history** → the first set is a **calibration set**: "Kies een gewicht waarmee je
   8 reps kunt met 2 in reserve." The user logs it; the remaining sets prefill from it.
   Optional: if RIR is logged on the calibration set and is ≥3, propose one increment up
   for set 2 — within the same exercise, which is legitimate.
3. The sets/reps/RIR **targets** carry over from the planned exercise. Those are
   prescription, not load, and are transferable.

Copy pattern (already used well in the current app): "Behoud sets, reps en RIR — reset het
gewicht."

### 12.4 Swap for today vs Replace in program

These are two different actions with different consequences and must never share a button.

| | **Swap for today** | **Replace in program** |
|---|---|---|
| Scope | This session only | Future occurrences |
| Default | Yes — one tap from the sheet | No — requires a second, explicit confirmation |
| Program | Unchanged | Changed, with a scope choice: this day / this program / all occurrences |
| Original exercise | Untouched; treated as not-trained today, no penalty, progression state frozen | Archived, history preserved and browsable |
| New exercise | Own history, own progression state, own PRs | Starts at calibration; progression state begins fresh |
| Undo | Immediate, from the session | From program settings, any time |

- Progression state for a swapped-out exercise **freezes** — it is neither advanced nor
  reset. A missed occurrence is not a failed occurrence.
- **Nudge, never act:** if the user swaps the same exercise for the same alternative
  ≥3 times in 4 weeks, offer once: "Je vervangt bench al 3× door dumbbell press. In je
  schema zetten?" Dismissal is remembered for 8 weeks.
- Replacing in the program never deletes data. The original exercise's history stays
  queryable and its records stay records.

### 12.5 Data integrity

- Every set logged on a substitute carries `substitutedFrom = originExerciseId` for
  session-level reporting.
- Those sets belong to the **substitute's** history for progression, trend and PR purposes.
  They must never enter the origin exercise's series. This is the same comparability rule
  as §1 and it is the rule that keeps the strength chart truthful.
- Weekly volume per muscle counts the substitute's own muscle contributions (fractional,
  §2).

---

## 13. Things Setline is not allowed to do

A short, explicit blocklist. These are the failure modes that make an evidence-based app
untrustworthy.

1. Convert load between different exercises, in either direction. (§12.3)
2. Compare estimated 1RM across exercises, or present e1RM without the word "estimated".
3. Compute e1RM from sets above 10 reps.
4. Sum paused and unpaused reps into one comparable number. (§9)
5. Count warm-up sets in volume, progression or records.
6. Auto-apply a deload, a load increase, or a program change.
7. Claim research support for a tier-B or tier-C rule.
8. Name a condition, suggest a diagnosis, or prescribe rehabilitation. (§14)
9. Award a PR on a set whose modifiers differ from the series it is compared against.
10. Present an influencer's recommendation as evidence.

---

## 14. Pain and injury — conservative, non-diagnostic

Setline is a training log. It does not assess, diagnose, treat or rehabilitate. Everything
in this section is designed so that the app is useful without ever crossing that line.

### 14.1 What the app asks

When the user opens the substitution sheet and selects the reason **"pijn of ongemak"**,
Setline asks **at most two** questions, both optional:

1. Where — a body-region picker (shoulder, elbow, wrist, low back, hip, knee, ankle,
   other). No condition names, no anatomy quiz.
2. When — during the movement / after training / all the time.

It does not ask about mechanism, history, severity trends, or anything that resembles
intake. It never asks the user to rate pain on a clinical scale as a stored metric.

### 14.2 What the app offers

Options, in this order, all neutral:

1. **Reduce the range of motion** to the pain-free portion, this session.
2. **Reduce the load**, keep reps and add RIR.
3. **Substitute** — the ranking in §12.2 with the pain modifier: exclude the matching
   `loadTags`, prefer lower `stabilityDemand`, allow a smaller exercise in slot 1.
4. **Skip this exercise** — always present, never framed as giving up.

### 14.3 What the app says

The self-monitoring framing (Silbernagel/Thomeé pain-monitoring model) is offered as a
**general guideline for deciding whether to continue**, phrased as such, once, and never
as a personal instruction:

> "Algemene richtlijn: lichte pijn tijdens de oefening hoeft niet te betekenen dat je
> stopt, zolang ze de volgende ochtend weggezakt is en van week tot week niet toeneemt.
> Twijfel je, of wordt het erger? Laat het nakijken."

**Escalation copy — shown, not decided.** If the user reports any of: sudden or sharp
onset, numbness, tingling, weakness, giving way, swelling, or pain that has persisted
across more than two weeks, Setline shows one short line recommending they see a
physiotherapist or doctor, and stops offering training modifications for that region
beyond "skip". It does not block the app, does not repeat the message every session, and
does not store a health record.

### 14.4 Data handling

- A discomfort flag is stored as `{ region, date, exerciseId }` — no severity, no
  narrative, no inferred condition.
- Flags **expire after 14 days** and must be re-confirmed by the user to persist. A
  permanent exclusion requires an explicit user action in settings.
- Flags are user-visible and deletable individually. They are never shown as a health
  history, never exported as one, and never used for anything except filtering
  substitutions and remembering the user's own preference.
- No coaching feature (including the AI coach) may generate text that names a condition,
  interprets symptoms, or recommends a rehab protocol. This is a hard constraint on the
  prompt and on any model output shown to the user.

---

## 15. What changes relative to the current implementation

Ordered by risk of getting it wrong later.

| # | Change | Why |
|---|---|---|
| 1 | Typed prescriptions replace parsed strings (`prescription`, `load`, `rest`) | Regex-parsing `"1×5–6 + 2×6–8"` is the root of most edge cases; every rule in this spec needs typed fields |
| 2 | Separate paused from unpaused reps in `completedReps()` | Currently summed, which corrupts progression, PR and trend for `upper-paused-bench` |
| 3 | Log RIR per set | The signal that unlocks §3, §8 and §11; currently exists only inside prose |
| 4 | e1RM restricted to ≤10 reps and always labelled "geschat" | Epley degrades with reps; the app currently implies precision it does not have |
| 5 | PR epsilon 0.05 → 0.5 kg, plus a 3-session baseline before PR banners | Prevents noise records and PR fatigue |
| 6 | Structured exercise attributes + computed alternative ranking | Current `ALTERNATIVES` is 2 hand-written options per exercise with no model behind it |
| 7 | Explicit Swap-for-today vs Replace-in-program | Currently alternatives are advisory text only; no action, no scope distinction |
| 8 | Rest timer with background firing and ±15 s adjust | Missing entirely; named repeatedly by users as decisive |
| 9 | Fatigue signals + proposed deload | Missing entirely; recovery inputs are collected but unused by the training engine |
| 10 | Per-user, per-gym load increment table | Progression decisions are only as good as the increment they assume |

**Kept as-is (deliberately):** double progression with two-session confirmation; the
`ready / close / neutral` progression tones; per-exercise warm-up and progression guidance
copy; the written `fit` / `why` rationale for alternatives; paused reps as a first-class
concept; the recovery inputs; Dutch (BE) register.

---

## 16. Open questions

Flagged rather than guessed. Each needs a product decision, not more literature.

1. **Per-set vs per-exercise RIR.** Per-set is more informative; per-exercise (last set
   only) is one tap instead of four. Recommendation: log on the last set by default,
   allow per-set in settings. **Needs a decision before the logging screen is designed.**
2. **Whether weekly volume per muscle is shown at all.** It is the most misused number in
   fitness apps. Recommendation: show it in Progressie, never on the training screen, and
   never as a goal to hit.
3. **Unilateral set counting.** Left+right as one set or two? Recommendation: one set,
   with both sides logged. Affects volume aggregates, so decide once.
4. **How far the recovery-aware suggestion may go.** This spec limits it to the deload
   proposal in §11 and to nothing else. Extending it to per-session load adjustment is
   possible but has no supporting evidence and should stay out of v1.
5. **Exercise catalogue authorship.** The attributes in §1 must be filled in by hand for
   every exercise. There is no reliable public dataset for `resistanceProfile` or
   `fatigueCost`. Budget for this; the substitution system is only as good as this table.

---

## Sources

- Robinson ZP et al. (2024). Exploring the Dose–Response Relationship Between Estimated
  Resistance Training Proximity to Failure, Strength Gain, and Muscle Hypertrophy.
  *Sports Medicine*. https://link.springer.com/article/10.1007/s40279-024-02069-2
- Pelland JC et al. (2025). The Resistance Training Dose Response: Meta-Regressions
  Exploring the Effects of Weekly Volume and Frequency on Muscle Hypertrophy and Strength
  Gains. *Sports Medicine*. https://link.springer.com/article/10.1007/s40279-025-02344-w
- Singer A, Wolf M, … Schoenfeld B (2024). Give it a Rest: a systematic review with
  Bayesian meta-analysis on the effect of inter-set rest interval duration on muscle
  hypertrophy. *Frontiers in Sports and Active Living*.
  https://www.frontiersin.org/journals/sports-and-active-living/articles/10.3389/fspor.2024.1429789/full
- Schoenfeld BJ, Grgic J, Van Every DW, Plotkin DL (2021). Loading Recommendations for
  Muscle Strength, Hypertrophy, and Local Endurance: A Re-Examination of the Repetition
  Continuum. *Sports*. https://www.mdpi.com/2075-4663/9/2/32
- Nunes JP et al. (2021). What influence does resistance exercise order have on muscular
  strength gains and muscle hypertrophy? *European Journal of Sport Science*.
  https://pubmed.ncbi.nlm.nih.gov/32077380/
- Bell L, Darragh IAJ, Travis SK, Rogerson D, Nolan D (2025). A Practical Approach to
  Deloading: Recommendations and Considerations for Strength and Physique Sports.
  *Strength and Conditioning Journal*.
  https://shura.shu.ac.uk/35313/3/Bell-APracticalApproach(AM).pdf
- Coleman M et al. (2024). Gaining more from doing less? The effects of a one-week deload
  period during supervised resistance training on muscular adaptations. *PeerJ*.
  https://peerj.com/articles/16777/
- ACSM (2009). Position Stand: Progression Models in Resistance Training for Healthy
  Adults. *MSSE*. https://pubmed.ncbi.nlm.nih.gov/19204579/
- Nuckols G. Overshooting, Undershooting, Or Just Right? How To Perfect Your Ability To
  Predict Repetitions In Reserve. *Stronger By Science* — summary of Halperin et al.,
  Remmert et al., Refalo et al. https://www.strongerbyscience.com/reps-in-reserve/
- Silbernagel KG, Thomeé R, Eriksson BI, Karlsson J (2007). Continued Sports Activity,
  Using a Pain-Monitoring Model, During Rehabilitation in Patients With Achilles
  Tendinopathy. *AJSM*. https://journals.sagepub.com/doi/abs/10.1177/0363546506298279
- Helms ER, Cronin J, Storey A, Zourdos MC (2016). Application of the Repetitions in Reserve-Based Rating of
  Perceived Exertion Scale for Resistance Training. *NSCA Strength & Conditioning Journal*.
  https://pmc.ncbi.nlm.nih.gov/articles/PMC4961270/

*Secondary interpretation (Nippard, Helms, Wolf, Israetel and similar) informed the
framing of tier-B rules. No rule in this document rests on a secondary source alone.*
