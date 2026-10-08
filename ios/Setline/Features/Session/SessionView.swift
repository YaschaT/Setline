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
    /// The session's full exercise list, folded away until asked for.
    @State private var showsExerciseList = false
    @State private var asksAboutNotifications = false
    /// Reps chosen in the input card for a set that is not saved yet. Kept by
    /// set, so the next set opens on its own target again.
    @State private var repsDraft: [UUID: Int] = [:]
    /// Reps in reserve picked in the card, where the set asks for them.
    @State private var rirDraft: [UUID: Int] = [:]
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

    let onFinish: (TrainingSession) -> Void
    let onPause: (ActiveSessionSnapshot) -> Void
    /// Leaves a session nothing was done in, without parking it.
    let onClose: () -> Void

    private let clock = Timer.publish(every: 1, on: .main, in: .common).autoconnect()
    private static let topAnchor = "session-top"

    init(
        day: WorkoutDay,
        app: AppState,
        resuming snapshot: ActiveSessionSnapshot?,
        loggingFor date: Date? = nil,
        onFinish: @escaping (TrainingSession) -> Void,
        onPause: @escaping (ActiveSessionSnapshot) -> Void,
        onClose: @escaping () -> Void
    ) {
        _runner = State(initialValue: SessionRunner(day: day, app: app, restoring: snapshot, loggingFor: date))
        self.onFinish = onFinish
        self.onPause = onPause
        self.onClose = onClose
    }

    var body: some View {
        ZStack {
            SL.Surface.ground.ignoresSafeArea()

            VStack(spacing: 0) {
                topBar
                sessionContent
            }
        }
        .safeAreaInset(edge: .bottom) { dock }
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
                        UIImpactFeedbackGenerator(style: .light).impactOccurred()
                        closeEntry()
                        Task { await askAboutNotificationsIfWorthIt() }
                    },
                    onClose: { closeEntry() },
                    onRemove: runner.isAddedSet(slotIndex: editing.slot, setIndex: editing.set)
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
                onSave: {
                    runner.stopRestSignals()
                    let existing = app.sessions.first {
                        $0.dayID == runner.day.id
                            && Calendar.current.isDate($0.date, inSameDayAs: runner.startedAt)
                            && $0.kind == .workout
                    }
                    onFinish(runner.finishedSession(existing: existing))
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
        guard let removed = runner.removeAddedSet(slotIndex: slot, setIndex: set) else { return }
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
                        Text(runner.isUntouched ? "Training" : "Pause").slBody()
                    }
                    .foregroundStyle(SL.Ink.secondary)
                    .lineLimit(1)
                    .fixedSize()
                    .frame(minHeight: SL.Space.hitMin)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(runner.isUntouched ? "Back to Training" : "Pause the session")
                .accessibilityHint(runner.isUntouched ? "" : "Saves where you are. Resume from Training.")

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
        if runner.isUntouched {
            onClose()
        } else {
            onPause(runner.snapshot())
        }
    }

    // MARK: - The exercise

    private var sessionContent: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: SL.Space.s4) {
                    exerciseHead.id(Self.topAnchor)
                    changeLines
                    aboveTheSets
                    if showsLadder { warmupSection }
                    setsCard
                    if runner.calibrationSummary(slotIndex: runner.currentIndex) != nil {
                        referenceNote
                    }
                    afterSets
                    sessionSection
                }
                .padding(.horizontal, SL.Space.gutterSession)
                .padding(.top, SL.Space.s2)
                .padding(.bottom, SL.Space.s3)
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
        let layout = typeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: SL.Space.s2))
            : AnyLayout(HStackLayout(alignment: .center, spacing: SL.Space.s3))
        return layout {
            VStack(alignment: .leading, spacing: 2) {
                Text(runner.current.exercise.name)
                    .slTitle()
                    .slLineHeight(SL.LineHeight.title, size: SL.TypeSize.title)
                    .foregroundStyle(SL.Ink.primary)
                    .accessibilityAddTraits(.isHeader)
                Text("Exercise \(runner.currentIndex + 1) of \(runner.slots.count) · \(Self.equipmentLabel(runner.current.exercise.equipment))")
                    .slBody()
                    .slNumerals()
                    .foregroundStyle(SL.Ink.secondary)
            }
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
            .onLongPressGesture { showsSwap = true }

            Button { showsSwap = true } label: {
                HStack(spacing: 6) {
                    Text("Swap")
                    SLGlyph(name: .chevronRight, size: 14).foregroundStyle(SL.Ink.secondary)
                }
            }
            .buttonStyle(SLPillButtonStyle())
            .accessibilityLabel("Swap \(runner.current.exercise.name)")
            .accessibilityHint("Alternatives, change the order or report pain")
        }
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
            undoLine("Swapped from \(origin.name)\(noHistory)", accessibility: "Undo the swap from \(origin.name)")
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
            let weight = runner.proposedWeight(slotIndex: runner.currentIndex).map { app.display.kg($0) }
            return (weight.map { "↑ \($0) today · you earned it" } ?? proposal.headline, SL.Signal.action)
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

    /// The previous session in the card's head, then one row per set.
    private var setsCard: some View {
        let slotIndex = runner.currentIndex
        let rows = runner.rows(for: slotIndex)
        return VStack(spacing: 0) {
            cardHead
            ForEach(rows, id: \.index) { row in
                setRow(row, slotIndex: slotIndex)
                    .overlay(alignment: .top) { SLHairline() }
            }
            Button { addSet() } label: {
                HStack(spacing: 6) {
                    SLGlyph(name: .plus, size: 14)
                    Text("Add set").slBody()
                }
                .foregroundStyle(SL.Ink.secondary)
                .frame(maxWidth: .infinity)
                .frame(minHeight: SL.Space.hitMin)
                .contentShape(Rectangle())
            }
            .buttonStyle(SLRowButtonStyle())
            .overlay(alignment: .top) { SLHairline() }
            .accessibilityLabel("Add a set to \(runner.current.exercise.name)")
            .accessibilityHint("Just for this session. Your plan doesn't change.")
        }
        .slBorderBox()
        .slListCard()
    }

    /// "Vorige sessie · 2 sep" and what was lifted then — or, where there is
    /// no then, what the sets are compared against instead.
    private var cardHead: some View {
        let slot = runner.current
        let layout = typeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: SL.Space.s1))
            : AnyLayout(HStackLayout(alignment: .firstTextBaseline, spacing: SL.Space.s3))
        return layout {
            if let previous = runner.previousSummary(for: slot) {
                Text("Last session · \(app.display.shortDate(previous.date))")
                    .slMeta().slNumerals()
                    .foregroundStyle(SL.Ink.secondary)
                    .fixedSize()
                Spacer(minLength: 0)
                ((previous.weight.map {
                    Text($0 + " ").font(.sl(SL.TypeSize.lead, SL.Weight.semibold)).foregroundStyle(SL.Ink.primary)
                } ?? Text(""))
                    + Text(previous.detail)
                        .font(.sl(SL.TypeSize.lead, previous.weight == nil ? SL.Weight.semibold : SL.Weight.regular))
                        .foregroundStyle(previous.weight == nil ? SL.Ink.primary : SL.Ink.meta))
                    .slNumerals()
                    .multilineTextAlignment(.trailing)
                    .fixedSize(horizontal: false, vertical: true)
            } else if let summary = runner.calibrationSummary(slotIndex: runner.currentIndex) {
                Text("Calibrated at")
                    .slMeta()
                    .foregroundStyle(SL.Ink.secondary)
                    .fixedSize()
                Spacer(minLength: 0)
                Text(summary)
                    .slLead().slNumerals()
                    .foregroundStyle(SL.Ink.primary)
                    .multilineTextAlignment(.trailing)
            } else {
                Text("Last session")
                    .slMeta()
                    .foregroundStyle(SL.Ink.secondary)
                    .fixedSize()
                Spacer(minLength: 0)
                Text("no history")
                    .slBody()
                    .foregroundStyle(SL.Ink.secondary)
            }
        }
        .padding(.horizontal, SL.Space.s4)
        .padding(.vertical, SL.Space.s3)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }

    private func setRow(_ row: SetRowPresentation, slotIndex: Int) -> some View {
        let set = runner.slots[slotIndex].sets[row.index]
        let phase: SLSetRow.Phase = row.status == .written ? .done : row.status == .nextUp ? .open : .pending
        var label = "Set \(row.indexLabel)"
        if row.isAdded { label += " · extra" }

        let value: String
        switch phase {
        case .done:
            value = set.weightKg.map { app.display.setReference(weightKg: $0, reps: set.reps) } ?? "—"
        case .open:
            let reps = openReps(slotIndex: slotIndex, setIndex: row.index)
            value = "\(set.weightKg.map(app.display.number) ?? "—") × \(reps)"
        case .pending:
            value = row.weightKind == .awaitingCalibration ? row.weightLabel : "—"
        }

        return SLSetRow(
            label: label,
            phase: phase,
            note: note(for: row),
            previous: runner.previousSet(slotIndex: slotIndex, setIndex: row.index).map { "last \($0)" },
            value: value,
            valueIsSentence: phase == .pending && row.weightKind == .awaitingCalibration,
            spoken: spoken(row, value: value, phase: phase),
            onTap: { runner.editing = (slotIndex, row.index) }
        )
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
            return .init(text: reps.map { "\($0) paused reps" } ?? "paused", tone: SL.Signal.attention)
        case .partial(let count):
            return .init(text: "partial +\(count)", tone: SL.Signal.attention)
        case .pausedAndPartial(let pausedReps, let count):
            // Two true things about one set; neither hides the other.
            return .init(
                text: "\(pausedReps.map { "\($0) paused reps" } ?? "paused") · partial +\(count)",
                tone: SL.Signal.attention
            )
        case .calibration:
            return .init(text: "calibration", tone: SL.Ink.secondary)
        case .baseline:
            return .init(text: "baseline", tone: SL.Ink.secondary)
        case .reserve(let rir):
            return .init(text: "RIR \(rir)", tone: SL.Ink.secondary)
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
        case .reserve(let rir): parts.append("RIR \(rir)")
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
            Text(upNextLine.slUnbroken)
                .slMeta().slNumerals()
                .foregroundStyle(SL.Ink.secondary)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.horizontal, SL.Space.s1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var upNextLine: String {
        guard let next = runner.nextSlotIndex else { return "Last exercise of the session" }
        let slot = runner.slots[next]
        let reps = slot.planned.sets.first?.repRange.upperBound ?? 0
        return "Next · \(slot.exercise.name) · \(slot.planned.targetSets) × \(reps)"
    }

    // MARK: - The session

    /// Every exercise of the session, where you are in it, and the way to
    /// another one. Always one scroll away — including while the rest runs.
    private var sessionSection: some View {
        VStack(alignment: .leading, spacing: SL.Space.s2) {
            // Folded: the list is a way to jump, not something to read
            // between sets.
            Button {
                withAnimation(.easeInOut(duration: SL.Motion.duration(SL.Motion.base, reduceMotion: reduceMotion))) {
                    showsExerciseList.toggle()
                }
            } label: {
                HStack(spacing: SL.Space.s2) {
                    Text("All exercises").slBody(SL.Weight.medium).foregroundStyle(SL.Ink.primary)
                    Text("\(runner.completedSetCount) of \(runner.plannedSetCount) sets")
                        .slMeta().slNumerals().foregroundStyle(SL.Ink.secondary)
                    Spacer(minLength: SL.Space.s2)
                    SLGlyph(name: .chevronDown, size: 13)
                        .foregroundStyle(SL.Ink.tertiary)
                        .rotationEffect(.degrees(showsExerciseList ? 180 : 0))
                }
                .padding(.horizontal, SL.Space.s1)
                .frame(minHeight: SL.Space.hitMin)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityHint(showsExerciseList ? "Hides the list" : "Shows every exercise of this session")

            if showsExerciseList {
                VStack(spacing: 0) {
                    ForEach(Array(runner.slots.enumerated()), id: \.element.id) { index, slot in
                        exerciseRow(index: index, slot: slot)
                            .overlay(alignment: .top) { if index > 0 { SLHairline() } }
                    }
                }
                .slBorderBox()
                .slListCard()
                .transition(.opacity)
            }

            if runner.hasProgress {
                Button {
                    if runner.isComplete { showsComplete = true } else { confirmsEarlyFinish = true }
                } label: { Text("Finish training") }
                    .buttonStyle(SLOutlineButtonStyle())
                    .padding(.top, SL.Space.s1)
            }
        }
        .padding(.top, SL.Space.s2)
    }

    private func exerciseRow(index: Int, slot: SessionRunner.ExerciseSlot) -> some View {
        let isCurrent = index == runner.currentIndex
        let logged = slot.model.loggedSetCount
        let total = slot.model.setCount
        return Button { runner.currentIndex = index } label: {
            HStack(alignment: .center, spacing: SL.Space.s3) {
                Text("\(index + 1)")
                    .slMeta().slNumerals()
                    .foregroundStyle(isCurrent ? SL.Signal.action : SL.Ink.secondary)
                    .frame(width: 24, alignment: .leading)
                VStack(alignment: .leading, spacing: 3) {
                    Text(slot.exercise.name)
                        .slLead()
                        .slLineHeight(1.3, size: SL.TypeSize.lead)
                        .foregroundStyle(SL.Ink.primary)
                    Text("\(logged) of \(total) sets\(slot.isComplete ? " · done" : "")")
                        .slBody().slNumerals()
                        .slLineHeight(1.35, size: SL.TypeSize.body)
                        .foregroundStyle(SL.Ink.secondary)
                }
                .fixedSize(horizontal: false, vertical: true)
                .multilineTextAlignment(.leading)
                .frame(maxWidth: .infinity, alignment: .leading)
                if slot.isComplete {
                    SLDoneMark()
                } else if isCurrent {
                    Text("NOW")
                        .font(.sl(SL.TypeSize.micro, SL.Weight.semibold))
                        .tracking(SL.TypeSize.micro * 0.06)
                        .foregroundStyle(SL.Signal.action)
                        .accessibilityHidden(true)
                }
            }
            .padding(.horizontal, SL.Space.s4)
            .padding(.vertical, SL.Space.s3)
            .frame(minHeight: 72)
            .background(isCurrent ? SL.Signal.action.opacity(0.06) : Color.clear)
            .contentShape(Rectangle())
        }
        .buttonStyle(SLRowButtonStyle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(slot.exercise.name), \(logged) of \(total) sets\(slot.isComplete ? ", done" : "")")
        .accessibilityAddTraits(isCurrent ? [.isSelected, .isButton] : .isButton)
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
            // A finished session has no rest left to take.
            if let timer = runner.restTimer, !runner.isComplete {
                SLRestPill(
                    title: runner.restTitle,
                    remaining: timer.remaining(at: runner.now),
                    total: max(timer.targetSeconds + timer.adjustmentSeconds, timer.remaining(at: runner.now)),
                    planned: timer.targetSeconds,
                    isExpanded: runner.isTimerExpanded,
                    onAdjust: { runner.adjustRest(by: $0) },
                    onReset: { runner.resetRest() },
                    onToggleExpanded: { runner.toggleTimerExpanded() },
                    onSkip: { runner.endRest() }
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
        let slotIndex = runner.currentIndex
        if runner.isComplete {
            Button { showsComplete = true } label: { Text("Finish session") }
                .buttonStyle(SLPrimaryButtonStyle(prominent: true))
        } else if let next = runner.nextIndex(in: runner.current) {
            let set = runner.current.sets[next]
            let needsSheet = (next == 0 && runner.needsCalibration(slotIndex: slotIndex))
                || (set.weightKg ?? 0) <= 0
                || typeSize.isAccessibilitySize
            VStack(spacing: SL.Space.s2) {
                inputHead(setIndex: next, set: set, compact: needsSheet)
                if needsSheet {
                    // No weight to step from — a calibration set, or a swap
                    // that starts empty — or text too large for the card: the
                    // sheet has the number field and room for everything.
                    Button {
                        entryOpensOnKeypad = (set.weightKg ?? 0) <= 0
                        runner.editing = (slotIndex, next)
                    } label: {
                        Text(next == 0 && runner.needsCalibration(slotIndex: slotIndex)
                             ? "Enter calibration set"
                             : "Enter set \(next + 1)")
                    }
                    .buttonStyle(SLPrimaryButtonStyle(prominent: true))
                } else {
                    steppers(slotIndex: slotIndex, setIndex: next, set: set)
                    if showsPlatesButton { plateLine }
                    if asksForRIR(slotIndex: slotIndex, setIndex: next) {
                        reserveRow(set)
                    }
                    saveButton(slotIndex: slotIndex, setIndex: next, set: set)
                }
            }
            .padding(SL.Space.s3)
            .slBorderBox()
            .background(
                RoundedRectangle(cornerRadius: SL.Radius.xl, style: .continuous)
                    .fill(SL.Surface.raised)
            )
            .overlay(
                RoundedRectangle(cornerRadius: SL.Radius.xl, style: .continuous)
                    .strokeBorder(SL.Surface.hairlineStrong, lineWidth: 1)
            )
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

            if !compact {
                // Everything a set rarely needs — failed, paused, partial,
                // RIR off-schedule, a typed weight — behind one quiet button.
                Button {
                    entryOpensOnKeypad = false
                    runner.editing = (runner.currentIndex, setIndex)
                } label: {
                    Image(systemName: "ellipsis")
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(SL.Ink.secondary)
                        .frame(width: SL.Space.hitMin, height: SL.Space.hitMin)
                        .background(Circle().fill(SL.Surface.raised2))
                        .contentShape(Circle())
                }
                .buttonStyle(.plain)
                .slFocusRing(Circle())
                .accessibilityLabel("More options for this set")
                .accessibilityHint("Failed, paused or partial reps, RIR, or type a weight")
            }
        }
    }

    /// Where the numbers in the card came from, in the design's own words.
    private func status(setIndex: Int, set: LoggedSet) -> String {
        let slotIndex = runner.currentIndex
        if adjusted.contains(set.id) { return "adjusted" }
        if setIndex == 0, runner.needsCalibration(slotIndex: slotIndex) { return "calibration set" }
        guard let weight = set.weightKg, weight > 0 else { return "no weight yet" }

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
                label: "Weight",
                display: set.weightKg.map(app.display.number) ?? "—",
                isChanged: changed && runner.slots[slotIndex].sets[setIndex].weightKg != openingWeight[set.id],
                onTapValue: {
                    // A load off the step: the sheet has the number field.
                    entryOpensOnKeypad = true
                    runner.editing = (slotIndex, setIndex)
                },
                valueHint: "Type the weight",
                onDecrement: { moveWeight(slotIndex: slotIndex, set: set, by: -step) },
                onIncrement: { moveWeight(slotIndex: slotIndex, set: set, by: step) }
            )
            SLStepper(
                label: "Reps",
                display: "\(reps)",
                isChanged: repsDraft[set.id] != nil
                    && repsDraft[set.id] != runner.openingReps(slotIndex: slotIndex, setIndex: setIndex),
                onDecrement: { moveReps(set, to: max(1, reps - 1)) },
                onIncrement: { moveReps(set, to: reps + 1) }
            )
            .frame(width: 140)
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
        RIRPreference.everySet || runner.slots[slotIndex].model.asksForRIR(at: setIndex)
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
                .accessibilityLabel("Reps in reserve: \(value == 4 ? "4 or more" : "\(value)")")
                .accessibilityHint("Optional")
                .accessibilityAddTraits(picked == value ? [.isSelected, .isButton] : .isButton)
            }
        }
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
            Text("Save set")
                .lineLimit(1)
        }
        .buttonStyle(SLPrimaryButtonStyle(prominent: true))
        .disabled(weight <= 0 || reps <= 0)
        .accessibilityLabel("Save set, \(app.display.kg(weight)) × \(reps)")
    }

    /// One tap: writes the set as the card shows it and starts the rest.
    private func save(slotIndex: Int, setIndex: Int) {
        let slot = runner.slots[slotIndex]
        let set = slot.sets[setIndex]
        guard let weight = set.weightKg, weight > 0 else { return }
        let reps = openReps(slotIndex: slotIndex, setIndex: setIndex)
        guard reps > 0 else { return }
        runner.log(
            slotIndex: slotIndex,
            setIndex: setIndex,
            entry: SessionRunner.SetEntry(
                weightKg: weight,
                reps: reps,
                rir: asksForRIR(slotIndex: slotIndex, setIndex: setIndex) ? rirDraft[set.id] : nil,
                failed: false,
                // A planned paused exercise is performed paused throughout,
                // which is what the plan prescribes.
                pausedReps: slot.planned.modifiers.pauseEnabled ? reps : nil,
                partialReps: nil
            )
        )
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        AccessibilityNotification.Announcement(
            "Set \(setIndex + 1) saved, \(app.display.kg(weight)) × \(reps)"
        ).post()
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
