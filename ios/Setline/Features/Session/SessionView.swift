import SwiftUI
import SetlineCore

/// Redesign 1b · Loggen — the live session.
///
/// The tab bar is gone by the time this appears: mid-set there is exactly one
/// task, so the session is a full-screen presentation over the tab shell.
///
/// Everything a set needs sits in the dock at the foot of the screen, inside
/// the thumb's reach: the rest pill, then the input card — weight and reps
/// already filled in from what was proposed, one step per tap, and
/// `Set opslaan` saying what it will write. Arriving costs no taps, a
/// correction costs one, and the next set takes the corrected weight over.
///
/// Above it the exercise reads top to bottom: its name, the previous session,
/// and one row per set. A row opens the full sheet for that set — to correct
/// it, or to say what it was.
struct SessionView: View {
    @Environment(AppState.self) private var app
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.dynamicTypeSize) private var typeSize
    @Environment(\.scenePhase) private var scenePhase
    @State private var runner: SessionRunner
    @State private var showsComplete = false
    @State private var confirmsEarlyFinish = false
    @State private var showsSwap = false
    /// `Schijven`: the plate calculator for the set up next.
    @State private var showsPlates = false
    @State private var toast: SessionToast?
    /// Proposal notes opened with `Toon` at accessibility text sizes.
    /// The suggestion's reasoning, asked for from its line.
    @State private var explainsSuggestion = false
    /// A new PR, marked the moment it is saved.
    @State private var celebration: Celebration?
    /// The session's full exercise list, folded away until asked for.
    @State private var showsExerciseList = false
    /// Picking an exercise to add to this session.
    @State private var addingExercise = false
    @State private var asksAboutNotifications = false
    /// Reps chosen in the input card for a set that is not saved yet. Kept by
    /// set, so the next set opens on its own target again.
    @State private var repsDraft: [UUID: Int] = [:]
    /// Reps in reserve picked in the card, where the set asks for them.
    @State private var rirDraft: [UUID: Int] = [:]
    /// Of the reps in the card, how many were paused or partial, chosen on
    /// the card's chips. `0` is turned off by hand; no entry means the set
    /// takes over what the exercise's previous set had.
    @State private var pausedDraft: [UUID: Int] = [:]
    @State private var partialDraft: [UUID: Int] = [:]
    /// The side a one-sided exercise's open set is done with.
    @State private var sideDraft: [UUID: SetSide] = [:]
    /// Taken to failure on purpose — stored as RIR 0.
    @State private var failureDraft: Set<UUID> = []
    /// The rest's clock, turned into a field to type a length of its own.
    @State private var typingRest: String?
    @FocusState private var restFieldFocused: Bool
    /// A drop set's lighter rounds, while the set is open.
    @State private var dropsDraft: [UUID: [DropStep]] = [:]
    /// Reps per side on a two-sided set of a one-sided exercise; present
    /// means the reps tile counts the sides apart.
    @State private var sideRepsDraft: [UUID: SideReps] = [:]
    /// Open sets whose weight or reps were moved by hand: "aangepast".
    @State private var adjusted: Set<UUID> = []
    /// The weight each open set had before it was touched, so "aangepast" can
    /// tell a correction from a value stepped back to where it started.
    @State private var openingWeight: [UUID: Decimal] = [:]
    /// The set sheet opens on its number field — reached from the weight.
    @State private var entryOpensOnKeypad = false

    /// What just happened, and how to take it back.
    struct SessionToast: Identifiable {
        let id = UUID()
        let message: String
        let undo: (() -> Void)?
    }

    let onFinish: (TrainingSession, _ createPost: Bool) -> Void
    let onPause: (ActiveSessionSnapshot) -> Void
    /// Leaves a session nothing was done in, without parking it.
    let onClose: () -> Void
    /// Opened from a paused or left-open workout. Leaving it again, even
    /// untouched, parks it again: it holds the sets logged before.
    private let resumed: Bool

    private let clock = Timer.publish(every: 1, on: .main, in: .common).autoconnect()
    private static let topAnchor = "session-top"

    init(
        day: WorkoutDay,
        app: AppState,
        resuming snapshot: ActiveSessionSnapshot?,
        loggingFor date: Date? = nil,
        onFinish: @escaping (TrainingSession, _ createPost: Bool) -> Void,
        onPause: @escaping (ActiveSessionSnapshot) -> Void,
        onClose: @escaping () -> Void
    ) {
        _runner = State(initialValue: SessionRunner(day: day, app: app, restoring: snapshot, loggingFor: date))
        self.onFinish = onFinish
        self.onPause = onPause
        self.onClose = onClose
        self.resumed = snapshot != nil
    }

    /// Nothing to keep: a fresh session left as it opened. A resumed one
    /// always has something — closing it would throw away its earlier sets.
    private var leavesWithNothing: Bool { runner.isUntouched && !resumed }

    var body: some View {
        ZStack {
            SL.Surface.ground.ignoresSafeArea()

            VStack(spacing: 0) {
                topBar
                sessionContent
            }
        }
        .safeAreaInset(edge: .bottom) { dock }
        .slCelebration($celebration)
        .animation(
            .easeOut(duration: SL.Motion.duration(SL.Motion.base, reduceMotion: reduceMotion)),
            value: runner.completedSetCount
        )
        .animation(
            .easeOut(duration: SL.Motion.duration(SL.Motion.base, reduceMotion: reduceMotion)),
            value: runner.plannedSetCount
        )
        .animation(
            .easeOut(duration: SL.Motion.duration(SL.Motion.base, reduceMotion: reduceMotion)),
            value: runner.isTimerExpanded
        )
        .animation(
            .easeOut(duration: SL.Motion.duration(SL.Motion.base, reduceMotion: reduceMotion)),
            value: toast?.id
        )
        .onReceive(clock) { _ in runner.tick() }
        .onChange(of: runner.restCompletions) { _, _ in
            // Rest is over. The notification covers the background; this is
            // the foreground's equivalent, felt without looking.
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            AccessibilityNotification.Announcement("Rest done").post()
        }
        .task(id: toast?.id) {
            guard let id = toast?.id, !UIAccessibility.isVoiceOverRunning else { return }
            try? await Task.sleep(for: .seconds(SL.Metric.undoWindow))
            if toast?.id == id { toast = nil }
        }
        .onAppear {
            runner.configureWarmups(hidden: app.hiddenWarmups)
            runner.resumeRestSignals()
        }
        .onChange(of: app.hiddenWarmups) { _, hidden in runner.configureWarmups(hidden: hidden) }
        // Kept on the phone after every set and whenever the app leaves the
        // foreground: iOS may close a backgrounded app, and the workout must
        // be there when it opens again.
        .onChange(of: runner.completedSetCount) { _, _ in keepOpen() }
        .onChange(of: scenePhase) { _, phase in
            switch phase {
            case .background:
                keepOpen()
                if !runner.isUntouched { WorkoutReminder.schedule(dayLabel: runner.day.short, paused: false) }
            case .active:
                WorkoutReminder.cancel()
            default:
                break
            }
        }
        .slRespondsToTextSize()
        .task {
            #if DEBUG
            if ProcessInfo.processInfo.arguments.contains("-SetlineLoggedSets") {
                runner.prefillForInspection()
            }
            if ProcessInfo.processInfo.arguments.contains("-SetlineAllSets") {
                runner.fillEverythingForInspection()
            }
            if ProcessInfo.processInfo.arguments.contains("-SetlineComplete") {
                runner.prefillForInspection()
                showsComplete = true
            }
            if ProcessInfo.processInfo.arguments.contains("-SetlineRestOpen") {
                runner.toggleTimerExpanded()
            }
            #endif
        }
        .sheet(isPresented: Binding(
            get: { runner.editing != nil },
            set: { if !$0 { closeEntry() } }
        )) {
            // Rows can be removed now, so a stale position opens nothing rather
            // than the wrong set.
            if let editing = runner.editing,
               runner.slots.indices.contains(editing.slot),
               runner.slots[editing.slot].sets.indices.contains(editing.set) {
                let row = runner.slots[editing.slot].sets[editing.set]
                SetEntrySheet(
                    slot: runner.slots[editing.slot],
                    setIndex: editing.set,
                    isCalibration: editing.set == 0 && runner.needsCalibration(slotIndex: editing.slot),
                    // What the card shows is what the sheet opens on.
                    proposedReps: repsDraft[row.id] ?? runner.suggestedReps(slotIndex: editing.slot, setIndex: editing.set),
                    startsPartial: runner.editingStartsPartial,
                    startsOnKeypad: entryOpensOnKeypad,
                    proposedRIR: rirDraft[row.id],
                    onLog: { entry in
                        runner.log(slotIndex: editing.slot, setIndex: editing.set, entry: entry)
                        celebrateIfRecord(slotIndex: editing.slot, setIndex: editing.set)
                        UIImpactFeedbackGenerator(style: .light).impactOccurred()
                        closeEntry()
                        Task { await askAboutNotificationsIfWorthIt() }
                    },
                    onClose: { closeEntry() },
                    onRemove: runner.isAddedSet(slotIndex: editing.slot, setIndex: editing.set)
                        || (!row.isLogged && runner.slots[editing.slot].sets.count > 1)
                        ? { removeSet(slot: editing.slot, set: editing.set) }
                        : nil
                )
            }
        }
        .sheet(isPresented: $asksAboutNotifications) {
            RestNotificationSheet(
                restLabel: runner.restTimer.map { RestPrescription(defaultSeconds: $0.targetSeconds, range: $0.targetSeconds...$0.targetSeconds).displayLabel } ?? "2:00",
                onAllow: {
                    asksAboutNotifications = false
                    Task {
                        await RestNotifier.request()
                        if let timer = runner.restTimer { RestNotifier.schedule(at: timer.fireDate, startedAt: timer.startedAt) }
                    }
                },
                onDecline: { asksAboutNotifications = false }
            )
        }
        .sheet(isPresented: $showsSwap) {
            SwapSheet(
                exercise: runner.current.exercise,
                origin: runner.substitutedOrigin(slotIndex: runner.currentIndex),
                reorder: runner.reorderPlan(slotIndex: runner.currentIndex),
                hasLoggedSets: runner.hasLoggedSets(slotIndex: runner.currentIndex),
                hasOpenSets: !runner.current.isComplete,
                sessionExerciseIDs: runner.sessionExerciseIDs,
                dayLabel: runner.day.short,
                onOutcome: { handle($0) },
                onRecordPain: { flag in Task { await app.record(pain: flag) } },
                onClose: { showsSwap = false }
            )
            .environment(app)
        }
        .sheet(isPresented: $showsPlates) { platesForNextSet }
        .sheet(isPresented: $addingExercise) {
            ExercisePickerSheet(
                rows: ExercisePicker.rows(sessions: app.sessions, favorites: app.favoriteExercises),
                selected: nil,
                onPick: { row in
                    addingExercise = false
                    let index = runner.addExercise(app.exercise(row.exerciseID))
                    showsExerciseList = false
                    show("\(row.name) added. Just for this session.") { runner.removeAddedExercise(at: index) }
                },
                onStar: { row in
                    Task { await app.setFavorite(exerciseID: row.exerciseID, isFavorite: !row.isFavorite) }
                },
                onClose: { addingExercise = false }
            )
        }
        .alert(
            "Finish the session with \(runner.completedSetCount) of \(runner.plannedSetCount) sets?",
            isPresented: $confirmsEarlyFinish
        ) {
            Button("Keep training", role: .cancel) {}
            Button("Finish") { showsComplete = true }
        } message: {
            Text("What you logged is kept. The rest counts as not trained — no penalty for your progress.")
        }
        .fullScreenCover(isPresented: $showsComplete) {
            SessionCompleteView(
                runner: runner,
                previous: app.sessions.first { $0.dayID == runner.day.id && $0.kind == .workout },
                onBack: { showsComplete = false },
                onSave: { createPost in
                    runner.stopRestSignals()
                    let existing = app.sessions.first {
                        $0.dayID == runner.day.id
                            && Calendar.current.isDate($0.date, inSameDayAs: runner.startedAt)
                            && $0.kind == .workout
                    }
                    onFinish(runner.finishedSession(existing: existing), createPost)
                }
            )
        }
    }

    /// Artboard 07: asked in the one moment where the answer is obvious — a
    /// set is logged, the rest is running, and the phone is about to go in a
    /// pocket. Asked once per install, and never if the reader has already
    /// answered the OS.
    private func askAboutNotificationsIfWorthIt() async {
        let key = "setline.notifications.asked"
        #if DEBUG
        // `-SetlineAskNotifications` shows the sheet whatever the simulator
        // has already been told, so its wording and layout stay checkable.
        let forced = ProcessInfo.processInfo.arguments.contains("-SetlineAskNotifications")
        #else
        let forced = false
        #endif
        guard forced || !UserDefaults.standard.bool(forKey: key) else { return }
        guard runner.restTimer != nil else { return }
        if !forced {
            guard await RestNotifier.status() == .notDetermined else { return }
        }
        UserDefaults.standard.set(true, forKey: key)
        asksAboutNotifications = true
    }

    private func closeEntry() {
        runner.editing = nil
        runner.editingStartsPartial = false
        entryOpensOnKeypad = false
    }

    /// Everything the swap sheet can decide, applied in one place. Every
    /// change that can be taken back says so for the design system's undo
    /// window, right above the primary action.
    private func handle(_ outcome: SwapOutcome) {
        let index = runner.currentIndex
        showsSwap = false
        switch outcome {
        case .reorder(let plan):
            runner.takeReorder(plan)
            show("You'll come back to \(plan.current.name) later.") { runner.currentIndex = index }
        case .substitute(let exercise, let reason):
            runner.substitute(slotIndex: index, with: exercise, reason: reason)
            let change = runner.latestUndo(slotIndex: index)?.id
            show("For today: \(exercise.name). Weight starts empty.") {
                _ = runner.undoChange(slotIndex: index, ifLatestIs: change)
            }
        case .replaceInProgram(let exercise, let scope):
            // The origin is what the *program* says, not what a temporary
            // swap left standing here.
            let origin = runner.substitutedOrigin(slotIndex: index) ?? runner.slots[index].exercise
            let replacement = ProgramReplacement(
                originExerciseID: origin.id,
                substituteExerciseID: exercise.id,
                scope: scope,
                dayID: runner.day.id
            )
            runner.replaceInProgram(slotIndex: index, with: exercise, recording: replacement)
            Task { await app.replaceInProgram(replacement) }
            let change = runner.latestUndo(slotIndex: index)?.id
            show("\(exercise.name) is now in your plan · \(scope.label.lowercased()).") {
                // Only while this change is still the latest: the header line
                // may already have reversed it.
                guard let point = runner.undoChange(slotIndex: index, ifLatestIs: change),
                      let record = point.replacement else { return }
                Task { await app.undoReplacement(record) }
            }
        case .custom(let custom):
            Task { await app.addCustomExercise(custom) }
            runner.substitute(slotIndex: index, with: custom.exercise, reason: .preference)
            let change = runner.latestUndo(slotIndex: index)?.id
            show("\(custom.name) added. Set 1 is a calibration set.") {
                _ = runner.undoChange(slotIndex: index, ifLatestIs: change)
            }
        case .reduceLoad:
            let previous = runner.reduceLoad(slotIndex: index)
            show("Weight two steps lighter. Adjust it if that's not right.") {
                runner.restoreOpenWeights(slotIndex: index, from: previous)
            }
        case .limitRange:
            // The option promised these reps would be logged as partial, so the
            // next set opens that way — once the swap sheet has left.
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.45) {
                if !runner.beginPartialSet(slotIndex: index) {
                    show("All sets of this exercise are already logged.", undo: nil)
                }
            }
        case .skipExercise:
            if runner.nextSlotIndex != nil {
                runner.advance()
                show("Skipped. That costs your progress nothing.") { runner.currentIndex = index }
            } else {
                show("That was the last exercise. Finish the session when you're ready.", undo: nil)
            }
        }
    }

    private func show(_ message: String, undo: (() -> Void)?) {
        toast = SessionToast(message: message, undo: undo.map { action in
            { action(); toast = nil }
        })
        AccessibilityNotification.Announcement(message).post()
    }

    /// Adds a working set to the exercise on screen, for this session only.
    /// Nothing is logged: the new row is simply the next one up.
    private func addSet() {
        let index = runner.currentIndex
        guard let row = runner.addSet(slotIndex: index) else { return }
        show("Set \(row.index + 1) added. Just for this session.") {
            _ = runner.removeUntouchedAddedSet(slotIndex: index, setID: row.id)
        }
    }

    /// Takes an added set out again. A logged one was confirmed in the sheet
    /// first; either way the toast can put it back.
    private func removeSet(slot: Int, set: Int) {
        closeEntry()
        guard let removed = runner.removeSet(slotIndex: slot, setIndex: set) else { return }
        show("Set \(set + 1) removed.") { runner.restore(removed, slotIndex: slot) }
    }


    // MARK: - Top bar

    /// The way out on the left — nothing is lost by taking it — and on the
    /// right the clock, the count, and `Afronden` once there is something to
    /// finish.
    private var topBar: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: SL.Space.s3) {
                Button(action: leave) {
                    HStack(spacing: 2) {
                        SLGlyph(name: .chevronLeft, size: 18)
                        Text(leavesWithNothing ? "Training" : "Pause").slBody()
                    }
                    .foregroundStyle(SL.Ink.secondary)
                    .lineLimit(1)
                    .fixedSize()
                    .frame(minHeight: SL.Space.hitMin)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(leavesWithNothing ? "Back to Training" : "Pause the session")
                .accessibilityHint(leavesWithNothing ? "" : "Saves where you are. Resume from Training.")

                Spacer(minLength: 0)

                // At the largest sizes the clock takes a line of its own
                // rather than squeezing both controls into broken words.
                if !typeSize.isAccessibilitySize { clockLine }

                if runner.hasProgress && !runner.isComplete {
                    Button { confirmsEarlyFinish = true } label: {
                        Text("Finish")
                            .slBody()
                            .foregroundStyle(SL.Ink.secondary)
                            .lineLimit(1)
                            .fixedSize()
                            .frame(minHeight: SL.Space.hitMin)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
            if typeSize.isAccessibilitySize {
                clockLine.padding(.leading, SL.Space.s1)
            }
        }
        .padding(.leading, SL.Space.s4)
        .padding(.trailing, SL.Space.gutterSession)
    }

    /// A workout being written down afterwards has no clock to show — it
    /// names the day it is being written for instead, so the sets can never
    /// land on the wrong date without anyone noticing.
    private var clockLine: some View {
        Text(sessionLine)
            .font(.sl(SL.TypeSize.micro, SL.Weight.regular))
            .slNumerals()
            .foregroundStyle(SL.Ink.primary.opacity(0.62))
            .lineLimit(typeSize.isAccessibilitySize ? nil : 1)
            .minimumScaleFactor(0.8)
    }

    private var sessionLine: String {
        let count = "\(runner.completedSetCount) of \(runner.plannedSetCount) sets"
        if runner.isLoggedAfterwards {
            return "\(Schedule.weekdayLabel(runner.startedAt).lowercased()) \(app.display.shortDate(runner.startedAt)) · \(count)"
        }
        return "session \(SLRestPill.clockLabel(runner.elapsedSeconds)) · \(count)"
    }

    /// Pausing keeps the session exactly as it stands. A session in which
    /// nothing was done has nothing to keep, and simply closes.
    private func leave() {
        runner.stopRestSignals()
        if leavesWithNothing {
            onClose()
        } else {
            WorkoutReminder.schedule(dayLabel: runner.day.short, paused: true)
            onPause(runner.snapshot())
        }
    }

    /// The workout as it stands, kept as still open (not paused).
    private func keepOpen() {
        guard !runner.isUntouched else { return }
        var snapshot = runner.snapshot()
        snapshot.runningSince = Date()
        app.keepOpenSession(snapshot)
    }

    // MARK: - The exercise

    private var sessionContent: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: SL.Space.s4) {
                    exerciseHead.id(Self.topAnchor)
                    if showsExerciseList { exerciseList }
                    changeLines
                    aboveTheSets
                    if showsLadder { warmupSection }
                    setsCard
                    if runner.calibrationSummary(slotIndex: runner.currentIndex) != nil {
                        referenceNote
                    }
                    afterSets
                }
                .padding(.horizontal, SL.Space.gutterSession)
                .padding(.top, SL.Space.s2)
                .padding(.bottom, SL.Space.s3)
            }
            .onChange(of: runner.completedSetCount) { _, _ in
                withAnimation(.easeOut(duration: SL.Motion.duration(SL.Motion.base, reduceMotion: reduceMotion))) {
                    proxy.scrollTo(Self.activeAnchor, anchor: .center)
                }
            }
            .onChange(of: runner.currentIndex) { _, _ in
                withAnimation(.easeOut(duration: SL.Motion.duration(SL.Motion.base, reduceMotion: reduceMotion))) {
                    proxy.scrollTo(Self.topAnchor, anchor: .top)
                }
            }
        }
    }

    /// The exercise is its own title; `Wissel` sits beside it, visibly
    /// secondary to logging but always on screen. Long-press is a shortcut for
    /// people who know it, never the only way in.
    private var exerciseHead: some View {
        VStack(alignment: .leading, spacing: SL.Space.s3) {
            exerciseNavigator
            // Where you are in the session, one segment per exercise. The
            // bar is also the way to the full list.
            Button {
                withAnimation(.easeInOut(duration: SL.Motion.duration(SL.Motion.base, reduceMotion: reduceMotion))) {
                    showsExerciseList.toggle()
                }
            } label: {
                HStack(spacing: 3) {
                    ForEach(Array(runner.slots.enumerated()), id: \.element.id) { index, slot in
                        Capsule()
                            .fill(segmentColor(index: index, slot: slot))
                            .frame(height: 4)
                    }
                }
                .frame(minHeight: 20)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Exercise \(runner.currentIndex + 1) of \(runner.slots.count)")
            .accessibilityHint(showsExerciseList ? "Hides the exercise list" : "Shows every exercise of this session")

            let layout = typeSize.isAccessibilitySize
                ? AnyLayout(VStackLayout(alignment: .leading, spacing: SL.Space.s2))
                : AnyLayout(HStackLayout(alignment: .center, spacing: SL.Space.s3))
            layout {
                VStack(alignment: .leading, spacing: 2) {
                    Text(runner.current.exercise.name)
                        .slTitle()
                        .slLineHeight(SL.LineHeight.title, size: SL.TypeSize.title)
                        .foregroundStyle(SL.Ink.primary)
                        .accessibilityAddTraits(.isHeader)
                    Text(headSubtitle)
                        .slMeta()
                        .slNumerals()
                        .foregroundStyle(SL.Ink.secondary)
                        .lineLimit(typeSize.isAccessibilitySize ? nil : 1)
                }
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
                .onLongPressGesture { showsSwap = true }

            }
            exerciseActions
            // The same kind of exercises, one tap away, until the first set is in.
            if !runner.hasLoggedSets(slotIndex: runner.currentIndex), !runner.current.isComplete {
                SwapSuggestionStrip(
                    exercise: runner.current.exercise,
                    sessionExerciseIDs: runner.sessionExerciseIDs,
                    onPick: { exercise, reason in handle(.substitute(exercise, reason)) }
                )
                .id(runner.current.exercise.id)
            }
        }
    }

    /// The two ways off the plan for this exercise, each saying what it
    /// does: changing it opens the alternatives, skipping moves on (with Undo).
    private var exerciseActions: some View {
        let layout = typeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: SL.Space.s2))
            : AnyLayout(HStackLayout(spacing: SL.Space.s2))
        return layout {
            Button { showsSwap = true } label: {
                actionLabel("Change exercise", symbol: "arrow.left.arrow.right")
            }
            .buttonStyle(SLPillButtonStyle())
            .accessibilityLabel("Change \(runner.current.exercise.name)")
            .accessibilityHint("Similar exercises, a lighter option, a different order, or report pain")
            if !runner.current.isComplete {
                Button { handle(.skipExercise) } label: {
                    actionLabel("Skip exercise", symbol: "forward.end")
                }
                .buttonStyle(SLPillButtonStyle(quiet: true))
                .accessibilityLabel("Skip \(runner.current.exercise.name)")
                .accessibilityHint("Moves on to the next exercise. You can undo it.")
            }
        }
    }

    private func actionLabel(_ text: String, symbol: String) -> some View {
        HStack(spacing: 6) {
            Image(systemName: symbol)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(SL.Ink.secondary)
            Text(text)
        }
    }

    /// "Next: Incline bench press"
    private var headSubtitle: String {
        guard let next = runner.nextSlotIndex else { return "Last exercise" }
        return "Next: \(runner.slots[next].exercise.name)"
    }

    /// Where you are, said in words, with the way to the previous and next
    /// exercise and to the whole list — visible buttons, never a gesture to
    /// discover.
    private var exerciseNavigator: some View {
        HStack(spacing: SL.Space.s2) {
            navArrow("chevron.left", label: "Previous exercise", enabled: runner.currentIndex > 0) {
                runner.currentIndex -= 1
            }
            Button {
                withAnimation(.easeInOut(duration: SL.Motion.duration(SL.Motion.base, reduceMotion: reduceMotion))) {
                    showsExerciseList.toggle()
                }
            } label: {
                HStack(spacing: 6) {
                    Text("Exercise \(runner.currentIndex + 1) of \(runner.slots.count)")
                        .slMeta(SL.Weight.semibold)
                        .slNumerals()
                        .foregroundStyle(SL.Ink.primary)
                    Image(systemName: showsExerciseList ? "chevron.up" : "chevron.down")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(SL.Ink.secondary)
                }
                .padding(.horizontal, SL.Space.s3)
                .frame(minHeight: 36)
                .background(Capsule().fill(SL.Surface.raised2))
                .frame(maxWidth: .infinity)
                .frame(minHeight: SL.Space.hitMin)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Exercise \(runner.currentIndex + 1) of \(runner.slots.count)")
            .accessibilityHint(showsExerciseList ? "Hides the exercise list" : "Shows every exercise of this session")
            navArrow("chevron.right", label: "Next exercise", enabled: runner.nextSlotIndex != nil) {
                runner.advance()
            }
        }
    }

    private func navArrow(_ symbol: String, label: String, enabled: Bool, action: @escaping () -> Void) -> some View {
        Button {
            action()
            UISelectionFeedbackGenerator().selectionChanged()
        } label: {
            Image(systemName: symbol)
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(enabled ? SL.Ink.primary : SL.Ink.tertiary.opacity(0.5))
                .frame(width: 36, height: 36)
                .background(Circle().fill(SL.Surface.raised2))
                .frame(width: SL.Space.hitMin, height: SL.Space.hitMin)
                .contentShape(Rectangle())
        }
        .buttonStyle(SLPressStyle(scale: 0.92))
        .disabled(!enabled)
        .accessibilityLabel(label)
    }

    private func segmentColor(index: Int, slot: SessionRunner.ExerciseSlot) -> Color {
        if index == runner.currentIndex { return SL.Signal.action }
        if slot.isComplete { return SL.Ink.secondary }
        return SL.Surface.hairlineStrong
    }

    private static func equipmentLabel(_ equipment: Equipment) -> String {
        switch equipment {
        case .barbell: return "barbell"
        case .dumbbell: return "dumbbells"
        case .machinePlate: return "plate-loaded machine"
        case .machineSelectorised: return "machine"
        case .cable: return "cable"
        case .smith: return "Smith machine"
        case .bodyweight: return "bodyweight"
        case .band: return "band"
        }
    }

    /// Where the exercise on screen came from, when it is not what the
    /// programme had here — with the way back, which stays for the whole
    /// session — and the work that was done before a swap.
    @ViewBuilder
    private var changeLines: some View {
        // Before the calibration set, "geen historiek" is said once, on the
        // line that already says where the exercise came from.
        let calibrating = runner.calibrationPrompt(slotIndex: runner.currentIndex) != nil
        let noHistory = calibrating ? " · no history" : ""
        if let origin = runner.substitutedOrigin(slotIndex: runner.currentIndex) {
            undoLine("Changed from \(origin.name)\(noHistory)", accessibility: "Undo the change from \(origin.name)")
        } else if let replacement = runner.latestUndo(slotIndex: runner.currentIndex)?.replacement {
            // A program change stays reversible here until the workout ends.
            // The toast is the quick way back; this one is still there after
            // the toast has gone. After the workout, undo belongs to program
            // settings.
            let origin = app.exercise(replacement.originExerciseID)
            undoLine(
                "Replaces \(origin.name) in your plan\(noHistory)",
                accessibility: "Undo replacing \(origin.name) in your plan"
            )
        }

        if !runner.current.preserved.isEmpty {
            // Work done here before a swap is kept, and the screen says so.
            Text(preservedLine(runner.current.preserved))
                .slMeta()
                .slNumerals()
                .foregroundStyle(SL.Ink.secondary)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.horizontal, SL.Space.s1)
        }
    }

    /// The quiet, session-long way back from a swap or a program change: a
    /// line and a text action, never a button that competes with logging.
    private func undoLine(_ text: String, accessibility: String) -> some View {
        HStack(alignment: .center, spacing: SL.Space.s3) {
            Text(text)
                .slMeta()
                .foregroundStyle(SL.Ink.secondary)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: SL.Space.s2)
            Button { undoLatestChange() } label: {
                Text("Undo")
                    .slMeta(SL.Weight.semibold)
                    .foregroundStyle(SL.Signal.action)
                    .fixedSize()
                    .frame(minHeight: SL.Space.hitMin)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(accessibility)
        }
        .padding(.horizontal, SL.Space.s1)
        .padding(.vertical, -SL.Space.s2)
    }

    /// Reverses the latest change in the current slot — and, when that was a
    /// program change, takes it out of the program too.
    private func undoLatestChange() {
        let index = runner.currentIndex
        guard let point = runner.undoChange(slotIndex: index) else { return }
        toast = nil
        if let replacement = point.replacement {
            Task { await app.undoReplacement(replacement) }
            show("\(app.exercise(replacement.originExerciseID).name) is back in your plan.", undo: nil)
        }
    }

    /// "Bewaard: Flat bench press · 1 set"
    private func preservedLine(_ results: [ExerciseResult]) -> String {
        let parts = results.map { "\($0.name) · \($0.sets.count) \($0.sets.count == 1 ? "set" : "sets")" }
        return "Kept: " + parts.joined(separator: ", ")
    }

    // MARK: - What SETLINE says before set 1

    /// One line above the sets, and only when it adds something the
    /// pre-filled numbers don't already say: what a calibration set asks for,
    /// or that the weight goes up (or nearly does) today. A plain "keep
    /// building" suggestion says nothing the input card doesn't, so it is not
    /// drawn at all.
    @ViewBuilder
    private var aboveTheSets: some View {
        if let prompt = runner.calibrationPrompt(slotIndex: runner.currentIndex) {
            hintLine(prompt.headline, tone: SL.Signal.action)
        } else if runner.calibrationSummary(slotIndex: runner.currentIndex) != nil {
            // Set 1 is in; the reference it starts is named under the sets.
        } else if runner.showsProposal, let line = suggestionLine {
            Button { explainsSuggestion = true } label: {
                hintLine(line.text, tone: line.tone, explains: true)
            }
            .buttonStyle(.plain)
            .accessibilityHint("Shows why")
            .alert(runner.current.proposal.headline, isPresented: $explainsSuggestion) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(runner.current.proposal.body)
            }
        }
    }

    /// "↑ 102.5 kg today" where the top of the range is confirmed, the
    /// headline where it is close; nothing otherwise.
    private var suggestionLine: (text: String, tone: Color)? {
        let proposal = runner.current.proposal
        switch proposal.tone {
        case .ready:
            // The engine's own suggestion, never the weight the card now
            // holds: lowering it by hand must not read as earned.
            guard let suggested = proposal.weightKg else { return (proposal.headline, SL.Signal.action) }
            let open = runner.proposedWeight(slotIndex: runner.currentIndex) ?? suggested
            if open < suggested {
                return ("\(app.display.kg(suggested)) was suggested · you're on \(app.display.kg(open))", SL.Ink.secondary)
            }
            return ("↑ \(app.display.kg(suggested)) today · you earned it", SL.Signal.action)
        case .close:
            return (proposal.headline, SL.Signal.attention)
        case .neutral, .noReference:
            return nil
        }
    }

    /// A dot and one sentence: the quietest way the screen can say something.
    private func hintLine(_ text: String, tone: Color, explains: Bool = false) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: SL.Space.s2) {
            Circle().fill(tone).frame(width: 7, height: 7)
                .alignmentGuide(.firstTextBaseline) { $0[VerticalAlignment.center] + 4 }
                .accessibilityHidden(true)
            Text(text.slUnbroken)
                .slBody(SL.Weight.medium)
                .slNumerals()
                .foregroundStyle(SL.Ink.primary)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
            if explains {
                Image(systemName: "info.circle")
                    .font(.system(size: 14))
                    .foregroundStyle(SL.Ink.tertiary)
                    .accessibilityHidden(true)
            }
        }
        .padding(.horizontal, SL.Space.s1)
        .frame(minHeight: SL.Space.hitMin)
        .contentShape(Rectangle())
    }

    private var increment: Decimal { runner.current.exercise.incrementKg }

    // MARK: - Warm-up

    /// The ramp is shown when there is one to show and nothing else is sitting
    /// above the sets: not while a proposal is up, and not once set 1 is
    /// written.
    private var showsLadder: Bool {
        !runner.warmupLadder(slotIndex: runner.currentIndex).isEmpty
            && !runner.isWarmupCollapsed(slotIndex: runner.currentIndex)
    }

    /// Generated from today's top set, outside the working sets, with no ring
    /// and no rest timer — and no taps: it is a reference strip, not a log.
    private var warmupSection: some View {
        let ladder = runner.warmupLadder(slotIndex: runner.currentIndex)
        let rows = SetRowPresenter.warmupRows(ladder)
        return VStack(alignment: .leading, spacing: SL.Space.s2) {
            HStack(alignment: .center, spacing: SL.Space.s3) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Warm-up").slLead().foregroundStyle(SL.Ink.primary)
                        .accessibilityAddTraits(.isHeader)
                    Text(warmupLine)
                        .slMeta().slNumerals()
                        .foregroundStyle(SL.Ink.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: SL.Space.s2)
                Button {
                    Task { await app.hideWarmup(exerciseID: runner.current.planned.exerciseID) }
                } label: {
                    Text("Always hide")
                        .slMeta()
                        .foregroundStyle(SL.Ink.secondary)
                        .fixedSize()
                        .frame(minHeight: SL.Space.hitMin)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, SL.Space.s1)

            VStack(spacing: 0) {
                ForEach(Array(rows.enumerated()), id: \.offset) { index, row in
                    SLWarmupRow(label: row.indexLabel, value: "\(row.weightLabel) × \(row.repsLabel)")
                        .overlay(alignment: .top) { if index > 0 { SLHairline() } }
                }
            }
            .slBorderBox()
            .overlay(
                RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous)
                    .strokeBorder(SL.Surface.hairlineStrong, style: StrokeStyle(lineWidth: 1, dash: [4, 4]))
            )

            Text(WarmupPlanner.footnote(
                topSetKg: ladder.last?.weightKg ?? 0,
                formatter: app.display
            ))
            .slMeta()
            .slLineHeight(SL.LineHeight.body, size: SL.TypeSize.meta)
            .foregroundStyle(SL.Ink.secondary)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.horizontal, SL.Space.s1)
        }
    }

    /// "telt niet mee · topset vandaag 102,5 kg × 5"
    private var warmupLine: String {
        guard let topSet = runner.topSetLabel(slotIndex: runner.currentIndex) else { return "doesn't count" }
        return "doesn't count · top set today \(topSet)"
    }

    // MARK: - The sets

    /// One list. Done sets are a line with a check; the set you're on opens
    /// in place with its controls; the sets still to come are quiet lines.
    /// Nothing is shown twice, and the eye only ever moves down.
    private var setsCard: some View {
        let slotIndex = runner.currentIndex
        let rows = runner.rows(for: slotIndex)
        let active = runner.isComplete ? nil : runner.nextIndex(in: runner.current)
        return VStack(spacing: 0) {
            ForEach(Array(rows.enumerated()), id: \.element.index) { position, row in
                Group {
                    if row.index == active {
                        activeSet(slotIndex: slotIndex, setIndex: row.index)
                            .id(Self.activeAnchor)
                    } else {
                        setLine(row, slotIndex: slotIndex)
                    }
                }
                .overlay(alignment: .top) { if position > 0 { SLHairline() } }
            }
            setCountControls(slotIndex: slotIndex)
                .overlay(alignment: .top) { SLHairline() }
        }
        .slBorderBox()
        .slListCard()
    }

    /// Fewer or more sets, today only, in plain sight under the list. Remove
    /// takes the last set still open; done sets are corrected from their row.
    private func setCountControls(slotIndex: Int) -> some View {
        let removable = runner.removableSetIndex(slotIndex: slotIndex)
        return HStack(spacing: 0) {
            Button { removeLastOpenSet() } label: {
                Label("Remove set", systemImage: "minus")
                    .font(.sl(SL.TypeSize.body, SL.Weight.medium))
                    .foregroundStyle(removable == nil ? SL.Ink.tertiary : SL.Ink.primary)
                    .frame(maxWidth: .infinity)
                    .frame(minHeight: 48)
                    .contentShape(Rectangle())
            }
            .buttonStyle(SLRowButtonStyle())
            .disabled(removable == nil)
            .accessibilityHint("Removes the last open set, for this session only")

            Rectangle().fill(SL.Surface.hairline).frame(width: 1, height: 24)

            Button { addSet() } label: {
                Label("Add set", systemImage: "plus")
                    .font(.sl(SL.TypeSize.body, SL.Weight.medium))
                    .foregroundStyle(SL.Signal.action)
                    .frame(maxWidth: .infinity)
                    .frame(minHeight: 48)
                    .contentShape(Rectangle())
            }
            .buttonStyle(SLRowButtonStyle())
            .accessibilityHint("Adds a set to this exercise, for this session only")
        }
    }

    /// Takes the last open set out, for today; the toast puts it back.
    private func removeLastOpenSet() {
        let slot = runner.currentIndex
        guard let index = runner.removableSetIndex(slotIndex: slot),
              let removed = runner.removeSet(slotIndex: slot, setIndex: index)
        else { return }
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        show("Set \(index + 1) removed. Just for this session.") { runner.restore(removed, slotIndex: slot) }
    }

    /// The circle on an open row: one tap logs it as shown, like ticking it
    /// off. A row without a weight yet opens its sheet instead.
    private func quickCheck(slotIndex: Int, setIndex: Int) {
        let set = runner.slots[slotIndex].sets[setIndex]
        let calibrating = setIndex == 0 && runner.needsCalibration(slotIndex: slotIndex)
        guard !calibrating, let weight = set.weightKg, weight >= 0 else {
            entryOpensOnKeypad = (set.weightKg ?? 0) <= 0
            runner.editing = (slotIndex, setIndex)
            return
        }
        save(slotIndex: slotIndex, setIndex: setIndex)
    }

    private static let activeAnchor = "active-set"

    /// A done or upcoming set: one line.
    private func setLine(_ row: SetRowPresentation, slotIndex: Int) -> some View {
        let set = runner.slots[slotIndex].sets[row.index]
        let done = row.status == .written
        let reps = done ? set.reps : openReps(slotIndex: slotIndex, setIndex: row.index)
        let value: String = done
            ? (set.weightKg.map { app.display.setReference(weightKg: $0, reps: set.reps) } ?? "—")
            : (row.weightKind == .awaitingCalibration ? "after set 1" : "× \(reps)")
        let note = done ? dropped(sided(note(for: row), set.side, set.sideReps), set.drops) : nil
        let last = runner.previousSet(slotIndex: slotIndex, setIndex: row.index).map { "last \($0)" }
        return HStack(spacing: 0) {
            Button {
                if done {
                    entryOpensOnKeypad = false
                    runner.editing = (slotIndex, row.index)
                } else {
                    quickCheck(slotIndex: slotIndex, setIndex: row.index)
                }
            } label: {
                checkCircle(done: done)
                    .padding(.leading, SL.Space.s4)
                    .padding(.trailing, SL.Space.s3)
                    .frame(minHeight: 52)
                    .contentShape(Rectangle())
            }
            .buttonStyle(SLPressStyle(scale: 0.9))
            .accessibilityLabel(done ? "Set \(row.indexLabel) done, correct it" : "Log set \(row.indexLabel) as shown, \(value)")

            Button {
                entryOpensOnKeypad = false
                runner.editing = (slotIndex, row.index)
            } label: {
            HStack(spacing: SL.Space.s3) {
                Text(row.isAdded ? "Extra set" : "Set \(row.indexLabel)")
                    .slBody()
                    .foregroundStyle(done ? SL.Ink.primary : SL.Ink.secondary)

                Spacer(minLength: SL.Space.s2)

                if let note {
                    Text(note.text)
                        .slMeta(SL.Weight.semibold)
                        .foregroundStyle(note.tone)
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                } else if !done, let last {
                    Text(last)
                        .slMeta()
                        .monospacedDigit()
                        .foregroundStyle(SL.Ink.tertiary)
                }
                Text(value)
                    .slBody(done ? SL.Weight.semibold : SL.Weight.regular)
                    .monospacedDigit()
                    .foregroundStyle(done ? SL.Ink.primary : SL.Ink.secondary)
                    .frame(minWidth: 72, alignment: .trailing)
                SLGlyph(name: .chevronRight, size: 12).foregroundStyle(SL.Ink.tertiary)
            }
            .padding(.trailing, SL.Space.s4)
            .frame(minHeight: 52)
            .contentShape(Rectangle())
            }
            .buttonStyle(SLRowButtonStyle())
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(spoken(row, value: value, phase: done ? .done : .pending))
            .accessibilityHint(done ? "Opens this set to correct it" : "Opens this set")
        }
    }

    /// Done: a filled lime check. Open: an empty ring that reads as a box to
    /// tick.
    private func checkCircle(done: Bool) -> some View {
        ZStack {
            if done {
                Circle().fill(SL.Signal.action)
                Image(systemName: "checkmark")
                    .font(.system(size: 12, weight: .heavy))
                    .foregroundStyle(SL.Surface.ground)
            } else {
                Circle().strokeBorder(SL.Ink.tertiary, lineWidth: 2)
            }
        }
        .frame(width: 28, height: 28)
    }

    /// The set you're on, open in place: what it is and what it was last
    /// time, then the steppers, the plates, RIR when asked, and Save.
    @ViewBuilder
    private func activeSet(slotIndex: Int, setIndex: Int) -> some View {
        let set = runner.slots[slotIndex].sets[setIndex]
        // Only text too large for the card needs the sheet: a first set, or
        // one without a weight, types its weight right here.
        let needsSheet = typeSize.isAccessibilitySize
        VStack(spacing: SL.Space.s3) {
            inputHead(setIndex: setIndex, set: set, compact: needsSheet)
            if needsSheet {
                // No weight to step from — a calibration set, or a swap that
                // starts empty — or text too large for the row: the sheet has
                // the number field and room for everything.
                Button {
                    entryOpensOnKeypad = (set.weightKg ?? 0) <= 0
                    runner.editing = (slotIndex, setIndex)
                } label: {
                    Text(setIndex == 0 && runner.needsCalibration(slotIndex: slotIndex)
                         ? "Enter calibration set"
                         : "Enter set \(setIndex + 1)")
                }
                .buttonStyle(SLPrimaryButtonStyle(prominent: true))
            } else {
                steppers(slotIndex: slotIndex, setIndex: setIndex, set: set)
                attributeRow(slotIndex: slotIndex, setIndex: setIndex, set: set)
                if showsPlatesButton { plateLine }
                if asksForRIR(slotIndex: slotIndex, setIndex: setIndex) {
                    reserveRow(set)
                }
                saveButton(slotIndex: slotIndex, setIndex: setIndex, set: set)
            }
        }
        .padding(SL.Space.s3)
    }

    /// Every exercise of the session, opened from the progress bar.
    private var exerciseList: some View {
        VStack(spacing: 0) {
            ForEach(Array(runner.slots.enumerated()), id: \.element.id) { index, slot in
                exerciseRow(index: index, slot: slot)
                    .overlay(alignment: .top) { if index > 0 { SLHairline() } }
            }
            // An exercise the plan doesn't have, for today.
            Button { addingExercise = true } label: {
                VStack(spacing: 2) {
                    Label("Add an exercise", systemImage: "plus")
                        .font(.sl(SL.TypeSize.body, SL.Weight.semibold))
                        .foregroundStyle(SL.Signal.action)
                    if runner.slots.count > 1 {
                        Text("Hold an exercise to move it").slMeta().foregroundStyle(SL.Ink.secondary)
                    }
                }
                .frame(maxWidth: .infinity, minHeight: 60)
                .contentShape(Rectangle())
            }
            .buttonStyle(SLRowButtonStyle())
            .overlay(alignment: .top) { SLHairline() }
        }
        .slBorderBox()
        .slListCard()
        .transition(.opacity)
    }

    /// What the set was, where that is more than its numbers.
    private func note(for row: SetRowPresentation) -> SLSetRow.Note? {
        switch row.delta {
        case .personalRecord:
            return .init(text: "PR", tone: SL.Signal.action)
        case .failed:
            return .init(text: "failed", tone: SL.Signal.loss)
        case .paused(let reps):
            // "2 pauze-reps" where only some of them were: the count is part
            // of the set, so the row says which reps it describes.
            return .init(text: reps.map { "last \($0) paused" } ?? "paused", tone: SL.Signal.attention)
        case .partial(let count):
            return .init(text: "partial +\(count)", tone: SL.Signal.attention)
        case .pausedAndPartial(let pausedReps, let count):
            // Two true things about one set; neither hides the other.
            return .init(
                text: "\(pausedReps.map { "last \($0) paused" } ?? "paused") · partial +\(count)",
                tone: SL.Signal.attention
            )
        case .calibration:
            return .init(text: "calibration", tone: SL.Ink.secondary)
        case .baseline:
            return .init(text: "baseline", tone: SL.Ink.secondary)
        case .reserve(let rir):
            return rir == 0
                ? .init(text: "to failure", tone: SL.Signal.attention)
                : .init(text: "RIR \(rir)", tone: SL.Ink.secondary)
        case .difference(let text):
            guard text != "=" else { return nil }
            return .init(text: "\(text) kg", tone: text.hasPrefix("−") ? SL.Ink.secondary : SL.Signal.action)
        case .reference, .added, .none:
            return nil
        }
    }

    /// "Set 2, 85 × 8, vorige keer 82,5 × 8, persoonlijk record"
    private func spoken(_ row: SetRowPresentation, value: String, phase: SLSetRow.Phase) -> String {
        let name = row.isAdded ? "Extra set" : "Set"
        var parts = ["\(name) \(row.indexLabel)"]
        switch phase {
        case .done: parts.append(value)
        case .open: parts.append("open, \(value)")
        case .pending: parts.append(row.weightKind == .awaitingCalibration ? "follows from set 1" : "to do")
        }
        if let previous = runner.previousSet(slotIndex: runner.currentIndex, setIndex: row.index) {
            parts.append("last time \(previous)")
        }
        switch row.delta {
        case .personalRecord: parts.append("personal record")
        case .failed: parts.append("failed set")
        case .paused(let reps): parts.append(reps.map { "\($0) paused reps" } ?? "paused set")
        case .partial(let count): parts.append("\(count) partial reps")
        case .pausedAndPartial(let pausedReps, let count):
            parts.append("\(pausedReps.map { "\($0) paused reps" } ?? "paused set"), \(count) partial reps")
        case .calibration: parts.append("calibration set")
        case .baseline: parts.append("baseline for this exercise")
        case .reserve(let rir): parts.append(rir == 0 ? "to failure" : "RIR \(rir)")
        case .difference(let text): parts.append("\(text) kilos compared with last session")
        case .added: parts.append("just for this session")
        case .reference, .none: break
        }
        return parts.joined(separator: ", ")
    }

    /// Under the sets, once the calibration set is in: what it started, in a
    /// line.
    private var referenceNote: some View {
        VStack(alignment: .leading, spacing: SL.Space.s1) {
            Text("Building a reference · session 1 of \(ExerciseHistory.sessionsBeforeReference). Suggestions start after three.")
            if runner.didStepUpAfterCalibration(slotIndex: runner.currentIndex) {
                Text("RIR 3 or more, so set 2 is one step heavier.")
            }
        }
        .font(.sl(SL.TypeSize.meta, SL.Weight.regular))
        .monospacedDigit()
        .foregroundStyle(SL.Ink.secondary)
        .fixedSize(horizontal: false, vertical: true)
        .padding(.horizontal, SL.Space.s1)
        .accessibilityElement(children: .combine)
    }

    /// The advice line once the exercise's last set is written, then what
    /// comes after it — or that this was the session's last exercise.
    private var afterSets: some View {
        VStack(alignment: .leading, spacing: SL.Space.s2) {
            if let advice = runner.adviceLine(for: runner.currentIndex) {
                hintLine(advice, tone: advice.hasPrefix("Not") ? SL.Ink.tertiary : SL.Signal.action)
                    .transition(.opacity)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: - The session

    /// Every exercise of the session, where you are in it, and the way to
    /// another one. Always one scroll away — including while the rest runs.
    private func exerciseRow(index: Int, slot: SessionRunner.ExerciseSlot) -> some View {
        let isCurrent = index == runner.currentIndex
        let logged = slot.model.loggedSetCount
        let total = slot.model.setCount
        return Button {
            runner.currentIndex = index
            showsExerciseList = false
        } label: {
            HStack(alignment: .center, spacing: SL.Space.s3) {
                Text("\(index + 1)")
                    .slMeta().slNumerals()
                    .foregroundStyle(isCurrent ? SL.Signal.action : SL.Ink.tertiary)
                    .frame(width: 20, alignment: .leading)
                Text(slot.exercise.name)
                    .slBody(isCurrent ? SL.Weight.semibold : SL.Weight.regular)
                    .foregroundStyle(SL.Ink.primary)
                    .lineLimit(typeSize.isAccessibilitySize ? nil : 1)
                    .frame(maxWidth: .infinity, alignment: .leading)
                if slot.isComplete {
                    SLDoneMark()
                } else {
                    Text("\(logged)/\(total)")
                        .slMeta().slNumerals()
                        .foregroundStyle(SL.Ink.secondary)
                }
            }
            .padding(.horizontal, SL.Space.s4)
            .frame(minHeight: SL.Space.hitMin + 4)
            .background(isCurrent ? SL.Signal.action.opacity(0.06) : Color.clear)
            .contentShape(Rectangle())
        }
        .buttonStyle(SLRowButtonStyle())
        // Hold to change the order: machine taken, or a superset partner.
        .contextMenu {
            if !isCurrent, index != runner.currentIndex + 1 {
                Button("Do next", systemImage: "arrow.turn.down.right") {
                    runner.moveExercise(from: index, to: index > runner.currentIndex ? runner.currentIndex + 1 : runner.currentIndex)
                }
            }
            if index > 0 {
                Button("Move up", systemImage: "arrow.up") { runner.moveExercise(from: index, to: index - 1) }
            }
            if index < runner.slots.count - 1 {
                Button("Move down", systemImage: "arrow.down") { runner.moveExercise(from: index, to: index + 1) }
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(slot.exercise.name), \(logged) of \(total) sets\(slot.isComplete ? ", done" : "")")
        .accessibilityAddTraits(isCurrent ? [.isSelected, .isButton] : .isButton)
        .accessibilityActions {
            if index > 0 { Button("Move up") { runner.moveExercise(from: index, to: index - 1) } }
            if index < runner.slots.count - 1 { Button("Move down") { runner.moveExercise(from: index, to: index + 1) } }
        }
    }

    // MARK: - The dock
    //
    // The undo surface, the rest pill and the input card share one bottom
    // inset, so the scroll view always reserves room for all of them. Nothing
    // in the session can end up underneath, and everything touched between
    // sets stays inside the thumb's reach.

    private var dock: some View {
        VStack(spacing: SL.Space.s2) {
            if let toast {
                SLUndoToast(message: toast.message, onUndo: toast.undo, onDismiss: { self.toast = nil })
                    .transition(.opacity)
            }
            // The rest, as one slim bar, only while it runs.
            if let timer = runner.restTimer, !runner.isComplete, timer.remaining(at: runner.now) > 0 {
                restHead(timer)
                    .padding(.horizontal, SL.Space.s3)
                    .padding(.vertical, SL.Space.s2)
                    .background(
                        RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous)
                            .fill(SL.Surface.raised)
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous)
                            .strokeBorder(SL.Surface.hairlineStrong, lineWidth: 1)
                    )
            }
            inputCard
        }
        .padding(.horizontal, SL.Space.gutterSession)
        .padding(.top, SL.Space.s2)
        .padding(.bottom, SL.Space.s1)
        .background(SL.Surface.ground)
    }

    /// One primary action, and it is whichever one is true right now.
    @ViewBuilder
    private var inputCard: some View {
        if runner.isComplete {
            Button { showsComplete = true } label: { Text("Finish session") }
                .buttonStyle(SLPrimaryButtonStyle(prominent: true))
        } else if runner.nextIndex(in: runner.current) != nil {
            // The set up next is edited in its own row in the list.
            EmptyView()
        } else if let next = runner.nextSlotIndex {
            Button { runner.advance() } label: {
                Text("Next · \(runner.slots[next].exercise.name)")
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                    .padding(.horizontal, SL.Space.s3)
            }
            .buttonStyle(SLPrimaryButtonStyle(prominent: true))
        } else if let open = runner.firstOpenSlotIndex {
            // The last exercise is done and an earlier one is not.
            Button { runner.currentIndex = open } label: {
                Text("Continue · \(runner.slots[open].exercise.name)")
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                    .padding(.horizontal, SL.Space.s3)
            }
            .buttonStyle(SLPrimaryButtonStyle(prominent: true))
        }
    }

    /// "Set 2 van 4" and where its numbers came from, then the two tools.
    private func inputHead(setIndex: Int, set: LoggedSet, compact: Bool) -> some View {
        HStack(alignment: .center, spacing: SL.Space.s2) {
            HStack(alignment: .center, spacing: SL.Space.s2) {
                Circle().fill(SL.Signal.action).frame(width: 8, height: 8)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Set \(setIndex + 1) of \(runner.current.sets.count)")
                        .slLead()
                        .slNumerals()
                        .foregroundStyle(SL.Ink.primary)
                    Text(status(setIndex: setIndex, set: set))
                        .slMeta()
                        .slNumerals()
                        .foregroundStyle(SL.Ink.secondary)
                }
                .lineLimit(typeSize.isAccessibilitySize ? nil : 1)
                .minimumScaleFactor(0.8)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityElement(children: .combine)

            if !compact { moreMenu(setIndex: setIndex) }
        }
    }

    /// Everything a set rarely needs, as one native menu: the list says what
    /// each thing is, so nothing has to be guessed from a button's name.
    private func moreMenu(setIndex: Int) -> some View {
        Menu {
            Button("Add an exercise", systemImage: "plus.circle") { addingExercise = true }
            Button("Edit set…", systemImage: "slider.horizontal.3") {
                entryOpensOnKeypad = false
                runner.editing = (runner.currentIndex, setIndex)
            }
            if showsPlatesButton {
                Button("Plate calculator", systemImage: "circle.grid.2x1") { showsPlates = true }
            }
        } label: {
            Image(systemName: "ellipsis")
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(SL.Ink.secondary)
                .frame(width: SL.Space.hitMin, height: SL.Space.hitMin)
                .background(Circle().fill(SL.Surface.raised2))
                .contentShape(Circle())
        }
        .accessibilityLabel("More options for this set")
    }

    /// While resting, the card's head is the rest: a small ring that empties,
    /// the time left, and the two things you might do about it. No separate
    /// panel, no colour shouting — the next set's numbers stay right below.
    private func restHead(_ timer: RestTimerState) -> some View {
        let remaining = timer.remaining(at: runner.now)
        let total = max(timer.targetSeconds + timer.adjustmentSeconds, remaining, 1)
        let fraction = Double(remaining) / Double(total)
        return HStack(alignment: .center, spacing: SL.Space.s3) {
            ZStack {
                Circle().stroke(SL.Surface.hairlineStrong, lineWidth: 3)
                Circle()
                    .trim(from: 0, to: fraction)
                    .stroke(SL.Signal.recovery, style: StrokeStyle(lineWidth: 3, lineCap: .round))
                    .rotationEffect(.degrees(-90))
            }
            .frame(width: 30, height: 30)
            .accessibilityHidden(true)

            if let typed = typingRest {
                // Type a length of its own: "2:30", "90", "2".
                VStack(alignment: .leading, spacing: 0) {
                    // Empty, with the rest as it stands for a hint: typing replaces it.
                    TextField(SLRestPill.clockLabel(timer.length).replacing(/^0(?=\d:)/, with: ""),
                              text: Binding(get: { typed }, set: { typingRest = $0 }))
                        .font(.sl(SL.TypeSize.title, SL.Weight.semibold))
                        .monospacedDigit()
                        .keyboardType(.numbersAndPunctuation)
                        .submitLabel(.done)
                        .focused($restFieldFocused)
                        .padding(.horizontal, SL.Space.s2)
                        .frame(width: 96)
                        .background(RoundedRectangle(cornerRadius: SL.Radius.sm).fill(SL.Surface.raised2))
                        .onSubmit { commitRestLength() }
                        .onChange(of: restFieldFocused) { _, focused in if !focused { commitRestLength() } }
                        .accessibilityLabel("Rest length, minutes and seconds")
                    Text("Rest length")
                        .slMeta()
                        .foregroundStyle(SL.Ink.secondary)
                        .lineLimit(1)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            } else {
                Button {
                    typingRest = ""
                    restFieldFocused = true
                } label: {
                    VStack(alignment: .leading, spacing: 0) {
                        HStack(spacing: 6) {
                            Text(SLRestPill.clockLabel(remaining))
                                .font(.sl(SL.TypeSize.title, SL.Weight.semibold))
                                .monospacedDigit()
                                .foregroundStyle(SL.Ink.primary)
                            Image(systemName: "pencil")
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundStyle(SL.Ink.tertiary)
                        }
                        Text(runner.nextIndex(in: runner.current).map { "Rest · then set \($0 + 1)" } ?? "Rest")
                            .slMeta()
                            .foregroundStyle(SL.Ink.secondary)
                            .lineLimit(1)
                            .minimumScaleFactor(0.75)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Rest, \(remaining / 60) minutes \(remaining % 60) seconds left")
                .accessibilityHint("Change the rest length")
            }

            Button { runner.adjustRest(by: -Int(SL.Metric.restAdjustStep)) } label: {
                Text("−30")
                    .slMeta(SL.Weight.semibold)
                    .monospacedDigit()
                    .foregroundStyle(SL.Ink.primary)
                    .padding(.horizontal, SL.Space.s3)
                    .frame(minHeight: SL.Space.hitMin)
                    .background(Capsule().fill(SL.Surface.raised2))
                    .contentShape(Capsule())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Rest 30 seconds shorter")

            Button { runner.adjustRest(by: Int(SL.Metric.restAdjustStep)) } label: {
                Text("+30")
                    .slMeta(SL.Weight.semibold)
                    .monospacedDigit()
                    .foregroundStyle(SL.Ink.primary)
                    .padding(.horizontal, SL.Space.s3)
                    .frame(minHeight: SL.Space.hitMin)
                    .background(Capsule().fill(SL.Surface.raised2))
                    .contentShape(Capsule())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Rest 30 seconds longer")

            Button { runner.endRest() } label: {
                Text("Skip")
                    .slMeta(SL.Weight.semibold)
                    .foregroundStyle(SL.Ink.secondary)
                    .padding(.horizontal, SL.Space.s2)
                    .frame(minHeight: SL.Space.hitMin)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Skip rest")
        }
        .transition(.opacity)
    }

    /// The typed rest length, once: a length that reads is set, anything
    /// else leaves the rest as it was.
    private func commitRestLength() {
        guard let typed = typingRest else { return }
        typingRest = nil
        if let seconds = RestTimerState.parseLength(typed) { runner.setRestLength(seconds) }
    }

    /// Where the numbers in the card came from, in the design's own words.
    private func status(setIndex: Int, set: LoggedSet) -> String {
        let slotIndex = runner.currentIndex
        if adjusted.contains(set.id) { return "adjusted" }
        if setIndex == 0, runner.needsCalibration(slotIndex: slotIndex) { return "calibration set" }
        guard let weight = set.weightKg else { return "no weight yet" }
        if weight == 0 { return "no weight" }

        let slot = runner.current
        let reference = slot.history.mostRecent
        let prior = reference?.sets.first { $0.index == set.index }
        if let reference, prior?.weightKg == weight {
            return "same as \(app.display.shortDate(reference.date))"
        }
        if slot.sets.prefix(setIndex).last(where: \.isLogged)?.weightKg == weight {
            return "same as your last set"
        }
        if slot.proposal.weightKg == weight {
            return "suggested for today"
        }
        return "ready when you are"
    }

    private func openReps(slotIndex: Int, setIndex: Int) -> Int {
        let set = runner.slots[slotIndex].sets[setIndex]
        return repsDraft[set.id] ?? runner.openingReps(slotIndex: slotIndex, setIndex: setIndex)
    }

    private func steppers(slotIndex: Int, setIndex: Int, set: LoggedSet) -> some View {
        let reps = openReps(slotIndex: slotIndex, setIndex: setIndex)
        let step = runner.slots[slotIndex].exercise.incrementKg
        let changed = adjusted.contains(set.id)
        return HStack(alignment: .top, spacing: SL.Space.s2) {
            SLStepper(
                label: set.weightKg == 0 ? "No weight" : "Weight",
                display: set.weightKg.map(app.display.number) ?? "—",
                isChanged: changed && (openingWeight[set.id].map { $0 != (runner.slots[slotIndex].sets[setIndex].weightKg ?? 0) } ?? false),
                valueHint: "Type the weight",
                // Tap the number and type it, right here.
                onTyped: { text in typeWeight(text, slotIndex: slotIndex, set: set) },
                startsTyping: (set.weightKg ?? 0) <= 0,
                onDecrement: { moveWeight(slotIndex: slotIndex, set: set, by: -step) },
                onIncrement: { moveWeight(slotIndex: slotIndex, set: set, by: step) }
            )
            if let sides = sideRepsDraft[set.id] {
                PerSideRepsTile(reps: Binding(get: { sides }, set: { sideRepsDraft[set.id] = $0 }))
                    .frame(width: 140)
            } else {
            SLStepper(
                label: "Reps",
                display: "\(reps)",
                isChanged: repsDraft[set.id] != nil
                    && repsDraft[set.id] != runner.openingReps(slotIndex: slotIndex, setIndex: setIndex),
                valueHint: "Type the reps",
                onTyped: { text in if let typed = Int(text), typed > 0 { moveReps(set, to: min(typed, 100)) } },
                keyboard: .numberPad,
                onDecrement: { moveReps(set, to: max(1, reps - 1)) },
                onIncrement: { moveReps(set, to: reps + 1) }
            )
            .frame(width: 140)
            }
        }
    }

    /// One step on the weight moves every set still open, which is what makes
    /// the next set one tap again: it takes the correction over.
    private func moveWeight(slotIndex: Int, set: LoggedSet, by delta: Decimal) {
        if openingWeight[set.id] == nil { openingWeight[set.id] = set.weightKg ?? 0 }
        runner.adjustProposedWeight(slotIndex: slotIndex, by: delta)
        markAdjusted(set, slotIndex: slotIndex)
        UISelectionFeedbackGenerator().selectionChanged()
    }

    /// A typed weight — "82,5" or "82.5" — for this set and every open set
    /// after it, as stepping does.
    private func typeWeight(_ text: String, slotIndex: Int, set: LoggedSet) {
        guard let typed = Decimal(string: text.replacingOccurrences(of: ",", with: ".")), typed >= 0, typed < 1000 else { return }
        let current = runner.slots[slotIndex].sets.first { $0.id == set.id }?.weightKg ?? 0
        guard typed != current else { return }
        if openingWeight[set.id] == nil { openingWeight[set.id] = current }
        runner.adjustProposedWeight(slotIndex: slotIndex, by: typed - current)
        markAdjusted(set, slotIndex: slotIndex)
    }

    private func moveReps(_ set: LoggedSet, to reps: Int) {
        repsDraft[set.id] = reps
        markAdjusted(set, slotIndex: runner.currentIndex)
        UISelectionFeedbackGenerator().selectionChanged()
    }

    /// "aangepast" holds for as long as the card differs from what it opened
    /// on; stepping back to the opening values takes the word away again.
    private func markAdjusted(_ set: LoggedSet, slotIndex: Int) {
        guard let position = runner.slots[slotIndex].sets.firstIndex(where: { $0.id == set.id }) else { return }
        let weightMoved = openingWeight[set.id].map { $0 != (runner.slots[slotIndex].sets[position].weightKg ?? 0) } ?? false
        let repsMoved = repsDraft[set.id].map { $0 != runner.openingReps(slotIndex: slotIndex, setIndex: position) } ?? false
        if weightMoved || repsMoved { adjusted.insert(set.id) } else { adjusted.remove(set.id) }
    }

    /// RIR is the optional third tap. By default an exercise asks it on its
    /// last prescribed set and on any set added after it; asking on every set
    /// is an Account setting.
    private func asksForRIR(slotIndex: Int, setIndex: Int) -> Bool {
        // The calibration set's reserve sets the weight of the sets after it.
        RIRPreference.everySet || runner.slots[slotIndex].model.asksForRIR(at: setIndex)
            || (setIndex == 0 && runner.needsCalibration(slotIndex: slotIndex))
    }

    private func reserveRow(_ set: LoggedSet) -> some View {
        let picked = rirDraft[set.id]
        return HStack(alignment: .center, spacing: 6) {
            Text("RIR")
                .slMeta()
                .foregroundStyle(SL.Ink.secondary)
                .frame(minWidth: 30, alignment: .leading)
                .accessibilityHidden(true)
            ForEach(0..<5, id: \.self) { value in
                Button {
                    rirDraft[set.id] = picked == value ? nil : value
                } label: {
                    Text(value == 4 ? "4+" : "\(value)")
                        .slBody(picked == value ? SL.Weight.semibold : SL.Weight.regular)
                        .slNumerals()
                        .foregroundStyle(picked == value ? SL.Signal.action : SL.Ink.primary)
                        .frame(maxWidth: .infinity)
                        .frame(minHeight: SL.Space.hitMin)
                        .background(
                            RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous)
                                .fill(picked == value ? SL.Signal.actionTint : SL.Surface.raised2)
                        )
                        .overlay(
                            RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous)
                                .strokeBorder(picked == value ? SL.Signal.action : Color.clear, lineWidth: 1)
                        )
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(value == 0 ? "Reps in reserve: 0, to failure" : "Reps in reserve: \(value == 4 ? "4 or more" : "\(value)")")
                .accessibilityHint("Optional")
                .accessibilityAddTraits(picked == value ? [.isSelected, .isButton] : .isButton)
            }
        }
    }

    /// "+1 drop" after whatever else the row says.
    private func dropped(_ note: SLSetRow.Note?, _ drops: [DropStep]) -> SLSetRow.Note? {
        guard !drops.isEmpty else { return note }
        let text = drops.count == 1 ? "+1 drop" : "+\(drops.count) drops"
        guard let note else { return .init(text: text, tone: SL.Signal.attention) }
        return .init(text: "\(note.text) · \(text)", tone: note.tone)
    }

    /// A done row's note with the side in front: "L · last 3 paused".
    private func sided(_ note: SLSetRow.Note?, _ side: SetSide?, _ sides: SideReps? = nil) -> SLSetRow.Note? {
        guard let side else { return note }
        // Sides counted apart say so: "L 8 · R 7".
        let label = sides?.label ?? side.label
        guard let note else { return .init(text: label, tone: SL.Ink.secondary) }
        return .init(text: "\(label) · \(note.text)", tone: note.tone)
    }

    // MARK: - Paused, partial, side

    /// The set's rarer facts, in plain sight and off by default: the same four
    /// chips on every set of every exercise — Paused, Partial, Failed, Drop
    /// set — then the side. A count chip turned on becomes its own
    /// "− 3 paused +" inside the card, so a mixed set is logged without
    /// leaving it.
    private func attributeRow(slotIndex: Int, setIndex: Int, set: LoggedSet) -> some View {
        let slot = runner.slots[slotIndex]
        let reps = openReps(slotIndex: slotIndex, setIndex: setIndex)
        let drops = dropsDraft[set.id] ?? []
        let unilateral = slot.exercise.unilateral
        let picked = oneSide(slotIndex: slotIndex, setIndex: setIndex)
        return VStack(alignment: .leading, spacing: SL.Space.s2) {
            // Chips wrap to a second line rather than hide behind a menu.
            SLFlow(spacing: SL.Space.s2) {
                attributeChip("Paused", count: paused(slotIndex: slotIndex, setIndex: setIndex, reps: reps), reps: reps) {
                    pausedDraft[set.id] = $0 ?? 0
                }
                attributeChip("Partial", count: partial(slotIndex: slotIndex, setIndex: setIndex, reps: reps), reps: reps) {
                    partialDraft[set.id] = $0 ?? 0
                }
                toggleChip("Failed", isOn: failureDraft.contains(set.id)) {
                    if failureDraft.contains(set.id) { failureDraft.remove(set.id) } else { failureDraft.insert(set.id) }
                }
                if drops.isEmpty {
                    toggleChip("Drop set", isOn: false) {
                        dropsDraft[set.id] = [DropSetEditor.next(after: set.weightKg ?? 0, reps: reps, step: slot.exercise.incrementKg)]
                    }
                }
                if unilateral {
                    sidePicker(slotIndex: slotIndex, setIndex: setIndex)
                } else if picked == nil {
                    // Any exercise can be done one side at a time: off until asked.
                    toggleChip("One side", isOn: false) {
                        sideDraft[set.id] = previousLogged(slotIndex: slotIndex, setIndex: setIndex)?.side == .left ? .right : .left
                    }
                } else {
                    sidePicker(slotIndex: slotIndex, setIndex: setIndex)
                }
                // Both sides in one set, and they didn't match: count them apart.
                if unilateral, side(slotIndex: slotIndex, setIndex: setIndex) == .both {
                    toggleChip("Per side", isOn: sideRepsDraft[set.id] != nil) {
                        if sideRepsDraft[set.id] != nil {
                            sideRepsDraft[set.id] = nil
                        } else {
                            sideRepsDraft[set.id] = SideReps(left: reps, right: reps)
                        }
                    }
                }
            }
            if !drops.isEmpty {
                DropSetEditor(
                    drops: Binding(get: { dropsDraft[set.id] ?? [] }, set: { dropsDraft[set.id] = $0 }),
                    step: slot.exercise.incrementKg,
                    display: app.display
                )
            }
        }
    }

    /// An on/off chip: quiet off, amber on, like the counted ones.
    private func toggleChip(_ title: String, isOn: Bool, action: @escaping () -> Void) -> some View {
        Button {
            action()
            UISelectionFeedbackGenerator().selectionChanged()
        } label: {
            HStack(spacing: 4) {
                Image(systemName: isOn ? "checkmark" : "plus").font(.system(size: 10, weight: .bold))
                Text(title).font(.sl(SL.TypeSize.meta, isOn ? SL.Weight.semibold : SL.Weight.medium))
            }
            .foregroundStyle(isOn ? SL.Signal.attention : SL.Ink.secondary)
            .padding(.horizontal, SL.Space.s3)
            .frame(height: 34)
            .background(Capsule().fill(isOn ? SL.Signal.attention.opacity(0.14) : SL.Surface.raised2))
            .overlay(Capsule().strokeBorder(isOn ? SL.Signal.attention.opacity(0.5) : .clear, lineWidth: 1))
            .frame(minHeight: SL.Space.hitMin)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(title)
        .accessibilityAddTraits(isOn ? [.isSelected, .isButton] : .isButton)
    }

    /// The exercise's last logged set before this one.
    private func previousLogged(slotIndex: Int, setIndex: Int) -> LoggedSet? {
        runner.slots[slotIndex].sets.prefix(setIndex).last(where: \.isLogged)
    }

    /// Paused reps as the card shows them: only what was chosen on this set.
    /// Every set starts plain — nothing is carried over from the set before or
    /// read off the plan, so a tag is always one the lifter put there. Never
    /// more than the reps.
    private func paused(slotIndex: Int, setIndex: Int, reps: Int) -> Int? {
        let id = runner.slots[slotIndex].sets[setIndex].id
        let count = pausedDraft[id] ?? 0
        return count > 0 ? min(count, reps) : nil
    }

    private func partial(slotIndex: Int, setIndex: Int, reps: Int) -> Int? {
        let id = runner.slots[slotIndex].sets[setIndex].id
        let count = partialDraft[id] ?? 0
        return count > 0 ? min(count, reps) : nil
    }

    /// The side of a set on an exercise that is not one-sided by nature: none
    /// until "One side" is tapped, which picks the side the last set didn't.
    private func oneSide(slotIndex: Int, setIndex: Int) -> SetSide? {
        sideDraft[runner.slots[slotIndex].sets[setIndex].id]
    }

    /// One side is always picked, so a one-sided set never costs a tap:
    /// Both by default (one set, both sides, counted once); after a left
    /// set the right, after a right set the left.
    private func side(slotIndex: Int, setIndex: Int) -> SetSide {
        let id = runner.slots[slotIndex].sets[setIndex].id
        if let chosen = sideDraft[id] { return chosen }
        return SetSidePicker.defaultSide(after: previousLogged(slotIndex: slotIndex, setIndex: setIndex)?.side)
    }

    /// Off: a quiet chip. On: the chip holds its own − n + count; stepping
    /// below one turns it off again.
    private func attributeChip(_ title: String, count: Int?, reps: Int, set: @escaping (Int?) -> Void) -> some View {
        let shape = Capsule()
        return Group {
            if let count {
                HStack(spacing: 0) {
                    Button { set(count > 1 ? count - 1 : nil) } label: {
                        Image(systemName: count > 1 ? "minus" : "xmark")
                            .font(.system(size: 12, weight: .bold))
                            .frame(width: 36, height: SL.Space.hitMin)
                            .contentShape(Rectangle())
                    }
                    .accessibilityLabel(count > 1 ? "Fewer \(title.lowercased()) reps" : "Turn off \(title.lowercased())")
                    Text(title == "Paused" ? "last \(count) paused" : "\(count) partial")
                        .font(.sl(SL.TypeSize.meta, SL.Weight.semibold))
                        .slNumerals()
                        .lineLimit(1)
                        .fixedSize()
                        .contentTransition(.numericText(value: Double(count)))
                    Button { set(min(count + 1, reps)) } label: {
                        Image(systemName: "plus")
                            .font(.system(size: 12, weight: .bold))
                            .frame(width: 36, height: SL.Space.hitMin)
                            .contentShape(Rectangle())
                    }
                    .disabled(count >= reps)
                    .accessibilityLabel("More \(title.lowercased()) reps")
                }
                .foregroundStyle(SL.Signal.attention)
                .background(shape.fill(SL.Signal.attention.opacity(0.14)))
                .overlay(shape.strokeBorder(SL.Signal.attention.opacity(0.5), lineWidth: 1))
                .accessibilityElement(children: .contain)
                .accessibilityLabel(title == "Paused" ? "Last \(count) of \(reps) reps paused" : "\(count) partial reps")
            } else {
                Button { set(1) } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "plus").font(.system(size: 10, weight: .bold))
                        Text(title).font(.sl(SL.TypeSize.meta, SL.Weight.medium))
                    }
                    .foregroundStyle(SL.Ink.secondary)
                    .padding(.horizontal, SL.Space.s3)
                    .frame(height: 34)
                    .background(shape.fill(SL.Surface.raised2))
                    .frame(minHeight: SL.Space.hitMin)
                    .contentShape(Rectangle())
                }
                .accessibilityLabel(title)
                .accessibilityHint(title == "Paused" ? "Marks how many of the reps were paused" : "Marks how many reps were partial range")
            }
        }
        .buttonStyle(.plain)
        .animation(.snappy(duration: 0.2), value: count)
    }

    /// L / R / Both, for a one-sided exercise only.
    private func sidePicker(slotIndex: Int, setIndex: Int) -> some View {
        let id = runner.slots[slotIndex].sets[setIndex].id
        return SetSidePicker(side: Binding(
            get: { side(slotIndex: slotIndex, setIndex: setIndex) },
            set: { picked in
                // On a two-sided exercise, Both is simply the ordinary set again.
                let plain = picked == .both && !runner.slots[slotIndex].exercise.unilateral
                sideDraft[id] = plain ? nil : picked
                if picked != .both { sideRepsDraft[id] = nil }
            }
        ))
    }

    /// The commit: 64 high, and it says what it is about to write.
    private func saveButton(slotIndex: Int, setIndex: Int, set: LoggedSet) -> some View {
        let reps = openReps(slotIndex: slotIndex, setIndex: setIndex)
        let weight = set.weightKg ?? 0
        return Button {
            save(slotIndex: slotIndex, setIndex: setIndex)
        } label: {
            // The numbers are right above, in the steppers; the button only
            // has to say what it does.
            Label("Save set", systemImage: "checkmark")
                .lineLimit(1)
        }
        .buttonStyle(SLPrimaryButtonStyle(prominent: true))
        .disabled(set.weightKg == nil || reps <= 0)
        .accessibilityLabel("Save set, \(app.display.kg(weight)) × \(reps)")
    }

    /// A set that is a personal record gets its moment.
    private func celebrateIfRecord(slotIndex: Int, setIndex: Int) {
        guard let row = runner.rows(for: slotIndex).first(where: { $0.index == setIndex }),
              row.delta == .personalRecord,
              let weight = runner.slots[slotIndex].sets[setIndex].weightKg
        else { return }
        let set = runner.slots[slotIndex].sets[setIndex]
        celebration = Celebration(
            symbol: "trophy.fill",
            title: "New PR",
            detail: "\(runner.slots[slotIndex].exercise.name) · \(app.display.setReference(weightKg: weight, reps: set.reps))"
        )
    }

    /// One tap: writes the set as the card shows it and starts the rest.
    private func save(slotIndex: Int, setIndex: Int) {
        let slot = runner.slots[slotIndex]
        let set = slot.sets[setIndex]
        // 0 is a set without weight — bodyweight, or a drop to nothing.
        guard let weight = set.weightKg, weight >= 0 else { return }
        let sides = slot.exercise.unilateral ? sideRepsDraft[set.id] : nil
        // Sides counted apart: the set is the weaker side.
        let reps = sides?.weaker ?? openReps(slotIndex: slotIndex, setIndex: setIndex)
        guard reps > 0 else { return }
        runner.log(
            slotIndex: slotIndex,
            setIndex: setIndex,
            entry: SessionRunner.SetEntry(
                weightKg: weight,
                reps: reps,
                rir: asksForRIR(slotIndex: slotIndex, setIndex: setIndex) ? rirDraft[set.id] : nil,
                failed: failureDraft.contains(set.id),
                // Only what the chip says, on every exercise alike.
                pausedReps: paused(slotIndex: slotIndex, setIndex: setIndex, reps: reps),
                partialReps: partial(slotIndex: slotIndex, setIndex: setIndex, reps: reps),
                side: slot.exercise.unilateral ? side(slotIndex: slotIndex, setIndex: setIndex) : oneSide(slotIndex: slotIndex, setIndex: setIndex),
                drops: dropsDraft[set.id] ?? [],
                sideReps: .some(sides)
            )
        )
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        SLSound.tick.play()
        AccessibilityNotification.Announcement(
            "Set \(setIndex + 1) saved, \(app.display.kg(weight)) × \(reps)"
        ).post()
        celebrateIfRecord(slotIndex: slotIndex, setIndex: setIndex)
        Task { await askAboutNotificationsIfWorthIt() }
    }

    // MARK: - Schijven

    /// Plates load the bar on a barbell, a smith and a plate-loaded machine,
    /// and only a set with a weight has anything to load.
    private var showsPlatesButton: Bool {
        let loadsPlates: Set<Equipment> = [.barbell, .smith, .machinePlate]
        guard loadsPlates.contains(runner.current.exercise.equipment),
              runner.nextIndex(in: runner.current) != nil,
              let weight = runner.proposedWeight(slotIndex: runner.currentIndex)
        else { return false }
        return weight > 0
    }

    /// What to put on the bar, without asking: "20 + 10 + 2.5 per side". The
    /// line opens the calculator for other bars and nearby loads.
    private var plateLine: some View {
        let weight = runner.proposedWeight(slotIndex: runner.currentIndex) ?? 0
        let rack = app.plateInventory
        let solution = PlateMath.solve(target: weight, bar: rack.barKg, plates: rack.plates)
        let text: String = {
            if weight < rack.barKg { return "Lighter than the \(app.display.kg(rack.barKg)) bar" }
            if solution.perSide.isEmpty { return "Just the bar" }
            let plates = solution.perSide.map { app.display.number($0) }.joined(separator: " + ")
            return solution.isExact ? "\(plates) per side" : "\(plates) per side · \(app.display.kg(solution.total))"
        }()
        return Button { showsPlates = true } label: {
            HStack(spacing: SL.Space.s2) {
                SLGlyph(name: .plates, size: 15).foregroundStyle(SL.Ink.tertiary)
                Text(text)
                    .slMeta()
                    .slNumerals()
                    .foregroundStyle(SL.Ink.secondary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                Spacer(minLength: SL.Space.s1)
                SLGlyph(name: .chevronRight, size: 12).foregroundStyle(SL.Ink.tertiary)
            }
            .padding(.horizontal, SL.Space.s2)
            .frame(minHeight: 36)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Plates: \(text), bar \(app.display.kg(rack.barKg))")
        .accessibilityHint("Opens the plate calculator")
    }

    /// For the set up next. A load chosen here moves every open set, as the
    /// card's own weight stepper does.
    @ViewBuilder
    private var platesForNextSet: some View {
        let index = runner.currentIndex
        let next = runner.nextIndex(in: runner.current) ?? 0
        let weight = runner.proposedWeight(slotIndex: index) ?? 0
        PlateSheet(
            exercise: runner.current.exercise.name,
            setNumber: next + 1,
            reps: runner.current.sets.indices.contains(next) ? openReps(slotIndex: index, setIndex: next) : 0,
            target: weight,
            onChoose: { load in
                if runner.current.sets.indices.contains(next) {
                    moveWeight(slotIndex: index, set: runner.current.sets[next], by: load - weight)
                }
                showsPlates = false
            },
            onClose: { showsPlates = false }
        )
        .environment(app)
    }
}
