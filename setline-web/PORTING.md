# Porting the iOS app to the web — the rules

The web app is an **exact copy** of the iOS app as it is in `ios/` today.
No new ideas, no redesign, no "improvements", no simplifications. Every
behaviour, number, rule, threshold, and user-visible string is carried over
verbatim. When the Swift code does something odd, the TypeScript does the
same odd thing. If something truly cannot exist on the web (Face ID, Live
Activities, haptics), leave it out and note it in `GAPS.md` — never invent a
replacement.

## Where things go

| Swift | TypeScript |
|---|---|
| `ios/SetlineCore/Sources/SetlineCore/<Dir>/<Name>.swift` | `setline-web/src/core/<Dir>/<Name>.ts` |
| `ios/SetlineCore/Tests/SetlineCoreTests/<Name>Tests.swift` | `setline-web/tests/core/<Name>.test.ts` |
| `ios/Setline/Features/<Dir>/<Name>.swift` | `setline-web/src/features/<Dir>/<Name>.tsx` |
| `ios/Setline/Design/...` | `setline-web/src/design/...` |
| `ios/Setline/Data/...` | `setline-web/src/data/...` |

One Swift file → one TS file with the same name. Keep the declaration order.
Imports are relative and extensionless (`import { LoggedSet } from "../Domain/Model"`).
Shared helpers live in `src/core/Support/` — use them, don't re-implement:

- `swift.ts`: `rounded` (Swift `.rounded()`: halves away from zero — NEVER
  use `Math.round` directly for a Swift `.rounded()`), `dec` (clean float
  noise where Swift used `Decimal`), `roundPlaces`, `maxBy`/`minBy`/`maxOf`/
  `minOf` (Swift `max(by:)` keeps the FIRST maximum), `compare` (tuple
  ordering), `deepEqual` (Swift `==` on structs), `uuid`, `grouping`, `sum`,
  `parseIntStrict`, `parseNumberStrict`.
- `calendar.ts`: `startOfDay`, `addDays`, `addWeeks`, `addMonths`,
  `daysBetween`, `isSameDay`, `weekday` (1 = Sunday, Foundation's numbering),
  `mondayIndex`, `startOfMondayWeek`, `components`, `dateFrom`, `settingTime`,
  `timeIntervalSince`, `addingTimeInterval`, `dateFromEpoch`, `iso8601`,
  `parseISO8601`, `formatPOSIX`, `formatEnUS` (DateFormatter with en_US +
  dateFormat). The `calendar:` parameters of Swift functions are dropped — the
  web always uses local time (`Calendar.current`).

If you need a Foundation behaviour that isn't there, add it to a NEW file in
`src/core/Support/` named after your area (e.g. `Support/numberFormat.ts`),
never edit `swift.ts` or `calendar.ts`.

## Type mapping — follow exactly, so files written in parallel fit together

**Names are identical to Swift**: types, properties, cases, functions, static
members, argument labels. Do not rename anything (no "cleaner" names).

**struct** → `export interface Name { …stored properties… }` plus, when the
struct has anything besides stored properties (defaults, an init, computed
properties, methods, statics), a companion object of the same name:

```ts
export interface TrainingStreak { weeks: number; thisWeekDone: number; thisWeekGoal: number; best: number; ... }
export const TrainingStreak = {
  make(p: { weeks: number; thisWeekDone: number; thisWeekGoal: number; best?: number }): TrainingStreak { … defaults … },
  thisWeekMet(self: TrainingStreak): boolean { return self.thisWeekDone >= self.thisWeekGoal; }, // computed property
  risk(self: TrainingStreak, a: { daysLeft: number }): TrainingStreak.Risk { … },                  // method
  window: 21,                                                                                       // static let
};
```

- Swift memberwise/custom `init(...)` → `Name.make({...})` with the same labels
  and the same defaults. A struct with no defaults/init may be built with a
  plain object literal.
- Computed property `x.foo` → `Name.foo(x)`. Method `x.bar(1, label: 2)` →
  `Name.bar(x, 1, { label: 2 })`. Static `Name.baz` → `Name.baz`.
- Nested types (`TrainingStreak.Risk`) → export them at top level as
  `TrainingStreak_Risk` (underscore join) and use that name everywhere. No
  TypeScript namespaces.
- Value semantics: never mutate an object you were given. `var s = x; s.reps = 3`
  → `const s = { ...x, reps: 3 }`. Arrays: copy before mutating.

**Functions and labels.** Unlabeled parameters (`_ x`) are positional and come
first. ALL labeled parameters go into ONE trailing object whose keys are the
Swift argument labels (external names), with the Swift defaults applied:

```swift
static func evaluate(goal: WeightGoal, weighIns: [...], startedAt: Date? = nil, now: Date = Date()) -> GoalCheck
static func round(_ value: Decimal, toIncrement step: Decimal) -> Decimal
func risk(daysLeft: Int) -> Risk
```
```ts
evaluate(a: { goal: WeightGoal; weighIns: WeighInPoint[]; startedAt?: Date; now?: Date }): GoalCheck
round(value: number, a: { toIncrement: number }): number
risk(self: TrainingStreak, a: { daysLeft: number }): TrainingStreak_Risk
```

Overloads (same base name in one scope) → append the first label, camel-cased:
`date(fromKey:)` → `dateFromKey`, `day(for:)` → `dayFor`. Only when there is
an actual clash.

**enum with String raw values** → a union of the RAW values (that is what is
stored and synced) plus a companion object with one constant per case, the
case list, and the enum's computed properties/methods as functions:

```ts
export type SetSide = "L" | "R" | "both";
export const SetSide = {
  left: "L" as SetSide, right: "R" as SetSide, both: "both" as SetSide,
  allCases: ["L", "R", "both"] as SetSide[],
  label(self: SetSide): string { … },
};
```
A case without an explicit raw value has its case name as raw value (Swift rule).
Int raw values → union of the numbers, same pattern.

**enum without raw values and without associated values** → union of the
case names as strings, same companion pattern.

**enum with associated values** → discriminated union on `kind` (the case
name); labeled associated values keep their labels; an unlabeled single value
is `value`, several unlabeled are `_0`, `_1`:

```ts
export type GoalCheck_Verdict =
  | { kind: "tooEarly"; weighInsNeeded: number; daysNeeded: number }
  | { kind: "onTrack" } | { kind: "tooSlow" } | { kind: "tooFast" } | { kind: "wrongWay" } | { kind: "unclear" };
```
Comparing two of them (Swift `==`) uses `deepEqual`.

**Special cases already ported — use them as they are**
- `JSONValue` (Legacy/JSONValue.ts) is plain JSON (`null | boolean | number |
  string | JSONValue[] | { [k]: JSONValue }`), NOT a discriminated union.
  Swift `.string("x")` → `"x"`, `.object([...])` → `{...}`, `.null` → `null`.
  Accessors: `JSONValue.objectValue(v)`, `.arrayValue(v)`, `.stringValue(v)`,
  `.decimalValue(v)`, `.intValue(v)`, `.doubleValue(v)`, `.boolValue(v)`,
  `JSONValue.get(v, key)` for `v[key]`.
- `LegacyState` (Legacy/LegacyState.ts) is `{ raw: JSONObject }`;
  `LegacyState.set(state, key, { to })` RETURNS a new state (Swift's
  `mutating` becomes return-the-new-value everywhere: a `mutating func` is
  ported as a function that returns the updated value).

**Other types**
- `Int`, `Double`, `CGFloat`, `Decimal` → `number`. Where Swift does Decimal
  arithmetic whose result is compared, stored, or shown, wrap it in `dec(...)`.
  `NSDecimalNumber` rounding modes → port the exact mode (see `roundPlaces`).
- `Optional<T>` → `T | undefined`; optional stored properties are `name?: T`.
  Never use `null` except where JSON demands it.
- `Date` → `Date`. `TimeInterval` → `number` (seconds).
- `[T]` → `T[]`; `[K: V]` → `Record<string, V>` (or `Map` when keys aren't
  strings or order matters); `Set<T>` → `Set<T>`.
- `protocol` → `interface`. `Sendable`, `@MainActor`, `Equatable`, `Hashable`,
  `Identifiable` conformances → nothing (use `deepEqual` for `==`).
- `Codable` → only port encode/decode where the Swift code actually
  (de)serializes the type (persistence, sync, legacy state). Key names in JSON
  are exactly the Swift CodingKeys.
- `throws` → `throw`; Swift error enums → `class XError extends Error { kind … }`.
- `async` stays `async`.
- `String(format: "%.1f", x)` → `x.toFixed(1)` only after `rounded`-style
  checks where it matters; `%d` → `String(Math.trunc(x))`.
- `Locale(identifier: "en_US")` number/date formatting → `formatEnUS` /
  `Intl.NumberFormat("en-US", …)` with the same options.

## Tests

Port the XCTest file(s) of everything you port, test for test, same names
(`testFoo` → `test("testFoo", …)`), using `node:test` and the helpers in
`setline-web/tests/helpers.ts` (`assertEqual` = XCTAssertEqual with
`deepEqual`, `assertClose` = accuracy:, `assertTrue`, `assertNil`, …).
Shared JSON fixtures in `tests/fixtures/` (repo root) are read from disk the
same way the Swift tests read them. Run with `npm run app:test` (TZ is pinned
to Europe/Brussels like the iOS tests). All ported tests must pass. A test that
cannot pass on the web for a platform reason is skipped with the reason in a
comment — never weakened.

## Checks before you report back

- `npx tsc -p setline-web/tsconfig.json` — no errors in YOUR files. Errors that
  only come from importing a file another helper is still writing are fine;
  list them.
- `npm run app:test -- <your test files>` passes.
- Report: files written, tests ported and passing, anything you could not
  port exactly (with the reason), and any cross-file names you assumed.

---

# UI: porting SwiftUI views (Design/, Features/, RootView)

Same principle: an exact copy of what the iPhone shows — same layout, sizes,
spacing, colours, copy (character for character: `·`, `›`, `—`, `…`), order,
conditions and behaviour. Render what iOS renders at the DEFAULT text size
(skip `isAccessibilitySize` branches: use the non-accessibility layout).

**Files and names.** One Swift file → one `.tsx` file of the same name. Each
SwiftUI `View` struct → a React function component with the same name. Its
`let`/`var` properties → props with the same names. Private computed views
(`private var header: some View`) → inner functions/components in the same
file with the same names. Keep the order of the Swift file.

**Building blocks** — `src/design/swiftui.tsx` (SwiftUI on the web; use
these, don't hand-roll flexbox):
`VStack(alignment, spacing)`, `HStack(alignment, spacing)`, `ZStack(alignment)`,
`Spacer(minLength)`, `Text(size, weight, color, lineLimit, align, numerals,
tracking, lineHeight)`, `ScrollView`, `Pressable` (a Button with pressed
state; `.buttonStyle(.plain)`), `Toggle`, `Sheet`, `FullScreenCover`,
`Alert` (with optional text field), `ConfirmationDialog`, `Menu` (entries:
button/section/divider; a Picker in a Menu = buttons with `checked`),
`useScenePhase`, `useAppStorage` (= `@AppStorage`), `UserDefaults`.
SwiftUI defaults to remember: stacks centre children and default `spacing` is
8 unless the Swift code gives one; `Spacer` minLength 8.
Tokens: `src/design/tokens.ts` — `SL.*` (identical names to SetlineTokens.swift),
`slFont(size, weight)` (= `.font(.sl(size, weight))`), `slNumerals`,
`slCard(...)`, `slHeroCard(...)`, `slListCard(...)`.
Icons: `Image(systemName:)` → `<SFSymbol name size weight color/>`
(`src/design/SFSymbol.tsx`); the app's own `SLGlyph(name:)` → the design
component of that name (SVGs in `public/icons/`).

**Modifiers → style.** `.padding(x)` → `padding`; `.padding(.horizontal, x)`
→ `paddingLeft/Right`; `.frame(width:height:)` → `width/height`;
`.frame(minHeight:)` → `minHeight`; `.frame(maxWidth: .infinity)` →
`alignSelf: "stretch"` in a VStack / `flex: "1 1 0", minWidth: 0` in an HStack
(+ `justifyContent`/`alignItems` for its `alignment`); `.background(Color)` →
`background`; `.background(RoundedRectangle(cornerRadius: r).fill(c))` →
`background: c, borderRadius: r`; `.overlay(alignment:) { … }` → a
`position: relative` wrapper with an absolutely positioned child;
`.strokeBorder(c, lineWidth: w)` → `boxShadow: inset 0 0 0 w c` (or border
when the Swift uses `slBorderBox`); `.foregroundStyle(c)` → `color`;
`.opacity`; `.clipShape(...)` → `borderRadius` + `overflow: hidden`;
`.offset(x:y:)` → `transform: translate`; `.rotationEffect` → `rotate`;
`.contentShape`, `.fixedSize(horizontal: false, vertical: true)`,
`.slRespondsToTextSize()`, `.dynamicTypeSize(...)` → nothing;
`.lineLimit(n)` → `Text lineLimit`; `.minimumScaleFactor(f)` → `Text minimumScaleFactor={f}`
(with `lineLimit={1}`: it shrinks to fit like iOS); `.accessibilityLabel` → `aria-label`;
`.accessibilityHidden(true)` → `aria-hidden`; `.onTapGesture` → `onClick`;
`.onAppear` / `.task` → `useEffect(…, [])`; `.task(id: x)` / `.onChange(of: x)`
→ `useEffect(…, [x])`; `.sheet` / `.fullScreenCover` / `.alert` /
`.confirmationDialog` → the components above, rendered in the same view;
`.contextMenu` → long-press opens a `ConfirmationDialog` with the same items.
Haptics (`sensoryFeedback`, `UI*FeedbackGenerator`), Live Activities, Face
ID, `#if DEBUG` code and launch arguments → leave out (note in your report).
Animations: copy simple ones with CSS transitions (same durations); skip
`matchedGeometryEffect`-style choreography. Swift Charts → hand-drawn SVG
with the same marks, colours and axes.

**State.** `@State var x` → `const [x, setX] = useState(...)`.
`@Binding var x: T` → prop `x: Binding<T>` where
`type Binding<T> = { value: T; set: (v: T) => void }` (exported from
`src/design/swiftui.tsx`). `@Environment(AppState.self) var app` →
`const app = useApp()` from `src/data/AppState` (it exposes the same
properties and methods as the Swift `AppState`). `@Environment(SocialStore.self)`
→ `useSocial()` from `src/data/SocialStore`. `@Environment(\.dismiss)` → an
`onClose` prop as the Swift caller passes.

**Button styles → components.** A `ButtonStyle` named `XStyle` becomes a
component `X` that renders the button itself: `Button(action) { label }
.buttonStyle(SLPrimaryButtonStyle(prominent: true))` →
`<SLPrimaryButton prominent onPress={action}>label</SLPrimaryButton>`. So:
`SLPrimaryButton`, `SLOutlineButton`, `SLQuietButton` (from SetlineTokens.swift,
in `src/design/SetlineTokens.tsx`), `SLPress` (SLPressStyle), `SLRowButton`
(SLRowButtonStyle). All take `onPress`, `disabled`, `style`, `aria-label`.
**Text styles.** SLText.swift's `Text` helpers (`.slBody()`, `.slMeta()`,
`.slLead()`, …) become functions returning Text props to spread:
`Text("x").slMeta(SL.Weight.semibold)` → `<Text {...slMeta(SL.Weight.semibold)}>x</Text>`.
**Sounds.** `SLSound.tick.play()` → `SLSound.play("tick")` (`src/design/SLSound.ts`,
files in `public/sounds/`).
