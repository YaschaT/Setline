# Brief for the agents porting the iOS screens

You are porting part of the Setline iPhone app's screens (SwiftUI, in
/Users/yaschatorfs/Desktop/YouFit/ios/Setline) to React + TypeScript for an
EXACT web copy of the app (in /Users/yaschatorfs/Desktop/YouFit/setline-web).
Android users will use this web app instead of the iPhone app, so every screen
must look and behave exactly like the iPhone: same layout, sizes, spacing,
colours, copy character for character, order, conditions, flows. No new ideas,
no redesign, no simplifications.

READ FIRST, completely: setline-web/PORTING.md (especially the UI section at
the end). Then look at what already exists and use it:
- `src/design/swiftui.tsx` (SwiftUI building blocks), `src/design/tokens.ts`
  (SL tokens, slFont, slCard…), `src/design/SFSymbol.tsx`,
  `src/design/SetlineTokens.tsx` (SLPrimaryButton, SLOutlineButton,
  SLQuietButton), `src/design/components/*.tsx` (every Design/Components view:
  SLChip, SLStepper, SLSheet, SLTabBar, SLGlyph, SLPieces (SLScreenTitle,
  SLSectionHead, SLOverline, SLTabHeader, SLRowButton, SLBar…), SLSetRow,
  SLRestPill, SLStreak, SLMedal, SLBadge, SLAvatar, SLCelebration,
  SLUndoToast, SLFlow…), `src/design/SLSound.ts`, `src/design/SLDynamicType.ts`.
  Another agent may still be finishing a design component; import it by its
  Swift name from `src/design/components/<File>` anyway.
- The whole SetlineCore logic, ported 1:1 in `src/core/` (same names; computed
  properties are functions on the companion object, labeled params go in one
  object — see PORTING.md).
- `src/data/AppState.ts`: `useApp()` returns the one `AppState`, with the same
  properties/methods as `ios/Setline/Data/AppState.swift` (labels in an
  object: `app.save({ session })`, `app.history({ for: planned })`,
  `app.day({ for: snapshot })`, `app.streak`, `app.streakAdding({ adding, day })`,
  `app.recordPain({ pain })` for `record(pain:)`, `app.record(changes)`…). Read
  it before use. Also `src/data/RIRPreference.ts`, `SupabaseConfig.ts`,
  `FoodSearchService.ts`, `MealScanService.ts`, `FoodLookupService.ts`.

Views from OTHER features (e.g. Account opening `WorkoutChooserSheet`, Training
opening `ProgramSheet`) are imported from their mirrored path by the Swift
name, with props named like the Swift init labels — another agent is writing
them now. An `extension AppState { func x() }` in a feature file becomes an
exported function `x(app: AppState, …)` in that file.

PLATFORM FEATURES on the web (Chrome on Android):
- Local notifications (UNUserNotificationCenter: streak, meal, workout and rest
  reminders): keep every setting, preference key and in-app message; the
  scheduling itself becomes a no-op on the web (report it).
- Camera / photo picking: `<input type="file" accept="image/*" capture>` or
  getUserMedia where the Swift shows a live camera. Barcode scanning: the
  browser `BarcodeDetector` API where available, else the typed-number path the
  Swift already has. Text recognition (Vision OCR) without a web equivalent:
  report it and keep the manual path.
- Face ID / LocalAuthentication: not available (`AppLock.isAvailable` false).
- Haptics, Live Activities, `#if DEBUG` launch arguments: leave out.
- Share sheets: `navigator.share` when available, else a download.

Don't start a dev server or browser (others share the machine; the
orchestrator verifies visually). Don't commit. Only write files in your scope.

CHECK: `cd /Users/yaschatorfs/Desktop/YouFit && npx tsc -p setline-web/tsconfig.json`
must show no errors in your files (errors only caused by another agent's
not-yet-written file are OK — list them).

REPORT (concise): files written + exported component names and props; what
could not be copied exactly and why; cross-feature components you imported
and the props you assumed.
