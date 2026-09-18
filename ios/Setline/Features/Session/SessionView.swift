import SwiftUI
import SetlineCore

/// Artboards 11R / 12R / 13R / 29 / 30.
///
/// The tab bar is gone by the time this appears: mid-set there is exactly
/// one task, so the session is a full-screen presentation over the tab
/// shell, not a tab-embedded push.
struct SessionView: View {
    @Environment(AppState.self) private var app
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.dynamicTypeSize) private var typeSize
    @State private var runner: SessionRunner
    @State private var showsComplete = false
    @State private var confirmsEarlyFinish = false
    @State private var showsSwap = false
    @State private var toast: SessionToast?
    /// Proposal cards opened with `Toon` at accessibility text sizes.
    @State private var expandedProposals: Set<Int> = []
    @State private var asksAboutNotifications = false

    /// What just happened, and how to take it back.
    struct SessionToast: Identifiable {
        let id = UUID()
        let message: String
        let undo: (() -> Void)?
    }

    let onFinish: (TrainingSession) -> Void
    let onPause: (ActiveSessionSnapshot) -> Void

    private let clock = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    init(
        day: WorkoutDay,
        app: AppState,
        resuming snapshot: ActiveSessionSnapshot?,
        onFinish: @escaping (TrainingSession) -> Void,
        onPause: @escaping (ActiveSessionSnapshot) -> Void
    ) {
        _runner = State(initialValue: SessionRunner(day: day, app: app, restoring: snapshot))
        self.onFinish = onFinish
        self.onPause = onPause
    }

    var body: some View {
        ZStack {
            SL.Surface.ground.ignoresSafeArea()

            VStack(spacing: 0) {
                header
                exerciseNav
                sessionContent
            }
        }
        .safeAreaInset(edge: .bottom) { bottomBar }
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
        }
        .task(id: toast?.id) {
            guard let id = toast?.id, !UIAccessibility.isVoiceOverRunning else { return }
            try? await Task.sleep(for: .seconds(SL.Metric.undoWindow))
            if toast?.id == id { toast = nil }
        }
        .onAppear { runner.configureWarmups(hidden: app.hiddenWarmups) }
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
                SetEntrySheet(
                    slot: runner.slots[editing.slot],
                    setIndex: editing.set,
                    isCalibration: editing.set == 0 && runner.needsCalibration(slotIndex: editing.slot),
                    proposedReps: runner.suggestedReps(slotIndex: editing.slot, setIndex: editing.set),
                    startsPartial: runner.editingStartsPartial,
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
                        if let timer = runner.restTimer { RestNotifier.schedule(at: timer.fireDate) }
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
                onOutcome: { handle($0) },
                onRecordPain: { flag in Task { await app.record(pain: flag) } },
                onClose: { showsSwap = false }
            )
            .environment(app)
        }
        .alert(
            "Sessie afronden met \(runner.completedSetCount) van \(runner.plannedSetCount) sets?",
            isPresented: $confirmsEarlyFinish
        ) {
            Button("Verder trainen", role: .cancel) {}
            Button("Afronden") { showsComplete = true }
        } message: {
            Text("Wat je logde blijft bewaard. De rest telt als niet getraind — geen straf voor je progressie.")
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
            show("Je komt later terug voor \(plan.current.name).") { runner.currentIndex = index }
        case .substitute(let exercise, let reason):
            runner.substitute(slotIndex: index, with: exercise, reason: reason)
            let change = runner.latestUndo(slotIndex: index)?.id
            show("Voor vandaag: \(exercise.name). Gewicht start leeg.") {
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
            show("\(exercise.name) staat nu in je schema · \(scope.label.lowercased()).") {
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
            show("\(custom.name) toegevoegd. Set 1 is een kalibratieset.") {
                _ = runner.undoChange(slotIndex: index, ifLatestIs: change)
            }
        case .reduceLoad:
            let previous = runner.reduceLoad(slotIndex: index)
            show("Gewicht twee stappen lichter. Pas aan als dat niet klopt.") {
                runner.restoreOpenWeights(slotIndex: index, from: previous)
            }
        case .limitRange:
            // The option promised these reps would be logged as partial, so the
            // next set opens that way — once the swap sheet has left.
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.45) {
                if !runner.beginPartialSet(slotIndex: index) {
                    show("Alle sets van deze oefening zijn al gelogd.", undo: nil)
                }
            }
        case .skipExercise:
            if runner.nextSlotIndex != nil {
                runner.advance()
                show("Overgeslagen. Dat kost je progressie niets.") { runner.currentIndex = index }
            } else {
                show("Dit was de laatste oefening. Rond de sessie af wanneer je klaar bent.", undo: nil)
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
        show("Set \(row.index + 1) toegevoegd. Alleen voor deze sessie.") {
            _ = runner.removeUntouchedAddedSet(slotIndex: index, setID: row.id)
        }
    }

    /// Takes an added set out again. A logged one was confirmed in the sheet
    /// first; either way the toast can put it back.
    private func removeSet(slot: Int, set: Int) {
        closeEntry()
        guard let removed = runner.removeAddedSet(slotIndex: slot, setIndex: set) else { return }
        show("Set \(set + 1) verwijderd.") { runner.restore(removed, slotIndex: slot) }
    }

    // MARK: Chrome

    /// Pause leaves; Afronden appears only once there is something to finish.
    private var header: some View {
        HStack(spacing: SL.Space.s3) {
            Button {
                runner.stopRestSignals()
                onPause(runner.snapshot())
            } label: {
                Text("Pauzeer").slBody(SL.Weight.medium)
                    .foregroundStyle(SL.Ink.secondary)
                    .slHitTarget()
            }
            .buttonStyle(.plain)

            Spacer(minLength: 0)

            Text("\(RestTimerState.clockLabel(runner.elapsedSeconds)) · SET \(runner.completedSetCount)/\(runner.plannedSetCount)")
                .slMeta(SL.Weight.medium).slNumerals()
                .foregroundStyle(SL.Ink.tertiary)
                .lineLimit(1)

            if runner.hasProgress && !runner.isComplete {
                Button { confirmsEarlyFinish = true } label: {
                    Text("Afronden").slBody(SL.Weight.medium)
                        .foregroundStyle(SL.Ink.secondary)
                        .slHitTarget()
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, SL.Space.gutterSession)
        .padding(.top, SL.Space.s3)
    }

    /// Where you are and how to move, directly under the header and always
    /// on screen — including while the rest timer runs.
    ///
    /// Subordinate to the exercise below it: 13pt, no fill on the inactive
    /// chips, and a hairline to seat it against the content.
    private var exerciseNav: some View {
        VStack(spacing: 0) {
            ScrollViewReader { proxy in
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: SL.Space.s2) {
                        ForEach(Array(runner.slots.enumerated()), id: \.element.id) { index, slot in
                            navChip(index: index, slot: slot).id(index)
                        }
                    }
                    .padding(.horizontal, SL.Space.gutterSession)
                    // The chips' hit areas now carry the vertical room this
                    // padding used to, so the strip keeps its height.
                    .padding(.vertical, SL.Space.s1)
                }
                .onChange(of: runner.currentIndex) { _, index in
                    withAnimation(.easeOut(duration: SL.Motion.duration(SL.Motion.base, reduceMotion: reduceMotion))) {
                        proxy.scrollTo(index, anchor: .center)
                    }
                }
            }
            SLHairline()
        }
    }

    private func navChip(index: Int, slot: SessionRunner.ExerciseSlot) -> some View {
        let isCurrent = index == runner.currentIndex
        return Button { runner.currentIndex = index } label: {
            Text(slot.exercise.name)
                .slMeta(isCurrent ? SL.Weight.semibold : SL.Weight.regular)
                .foregroundStyle(
                    isCurrent ? SL.Ink.primary : (slot.isComplete ? SL.Ink.tertiary : SL.Ink.secondary)
                )
                .lineLimit(1)
                .padding(.horizontal, SL.Space.s3)
                .frame(minHeight: 36)
                .background(
                    Capsule().fill(isCurrent ? SL.Surface.raised2 : .clear)
                )
                .overlay(
                    Capsule().strokeBorder(isCurrent ? SL.Surface.selection : .clear, lineWidth: 1)
                )
                // The capsule stays 36 high; the tappable area is 44.
                .frame(minHeight: SL.Space.hitMin)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(slot.exercise.name)\(slot.isComplete ? ", afgerond" : "")")
        .accessibilityAddTraits(isCurrent ? [.isSelected, .isButton] : .isButton)
    }

    private var sessionContent: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                exerciseHeader
                if let prompt = runner.calibrationPrompt(slotIndex: runner.currentIndex) {
                    calibrationCard(prompt).padding(.top, SL.Space.s5)
                } else if let summary = runner.calibrationSummary(slotIndex: runner.currentIndex) {
                    calibratedSummary(summary).padding(.top, SL.Space.s5)
                } else if runner.showsProposal {
                    if typeSize.isAccessibilitySize && !expandedProposals.contains(runner.currentIndex) {
                        compactProposal.padding(.top, SL.Space.s5)
                    } else {
                        proposalCard.padding(.top, SL.Space.s5)
                    }
                }
                warmupSection.padding(.top, SL.Space.s5)
                setRows.padding(.top, SL.Space.s5)
                if let advice = runner.adviceLine(for: runner.currentIndex) {
                    Text(advice)
                        .slLead(SL.Weight.medium)
                        .foregroundStyle(SL.Ink.primary)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, SL.Space.s4)
                        .transition(.opacity)
                }
                upNext.padding(.top, SL.Space.s5)
            }
            .padding(.horizontal, SL.Space.gutterSession)
            .padding(.top, SL.Space.s4)
            .padding(.bottom, SL.Space.s6)
        }
    }

    private var exerciseHeader: some View {
        VStack(alignment: .leading, spacing: 0) {
            // The title and the swap affordance share a row. `Wissel` is
            // visibly secondary to logging — 13pt, tertiary ink, no fill —
            // but it is on screen: long-press is a shortcut for people who
            // know it, never the only way in.
            HStack(alignment: .firstTextBaseline, spacing: SL.Space.s3) {
                Text(runner.current.exercise.name)
                    .slDisplay()
                    .foregroundStyle(SL.Ink.primary)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: SL.Space.s2)
                Button { showsSwap = true } label: {
                    Text("Wissel")
                        .slMeta(SL.Weight.medium)
                        .foregroundStyle(SL.Ink.tertiary)
                        .padding(.horizontal, SL.Space.s3)
                        .frame(minHeight: 34)
                        .background(Capsule().fill(SL.Surface.raised))
                        .overlay(Capsule().strokeBorder(SL.Surface.hairline, lineWidth: 1))
                        // Visually 34 high; the tappable area is 44.
                        .frame(minHeight: SL.Space.hitMin)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Wissel \(runner.current.exercise.name)")
                .accessibilityHint("Alternatieven, volgorde wijzigen of iets voelen")
            }
            .contentShape(Rectangle())
            .onLongPressGesture { showsSwap = true }

            if let origin = runner.substitutedOrigin(slotIndex: runner.currentIndex) {
                undoLine("Gewisseld van \(origin.name)", accessibility: "Wissel naar \(origin.name) ongedaan maken")
            } else if let replacement = runner.latestUndo(slotIndex: runner.currentIndex)?.replacement {
                // A program change stays reversible here until the workout
                // ends. The toast is the quick way back; this one is still
                // there after the toast has gone. After the workout, undo
                // belongs to program settings.
                let origin = app.exercise(replacement.originExerciseID)
                undoLine(
                    "Vervangt \(origin.name) in je schema",
                    accessibility: "Vervanging van \(origin.name) in je schema ongedaan maken"
                )
            }

            if !runner.current.preserved.isEmpty {
                // Work done here before a swap is kept, and the screen says so.
                Text(preservedLine(runner.current.preserved))
                    .slMeta()
                    .foregroundStyle(SL.Ink.tertiary)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 6)
            }

            Group {
                if let previous = runner.previousLine(for: runner.current) {
                    HStack(alignment: .firstTextBaseline, spacing: SL.Space.s2) {
                        SLEyebrow(text: previous.label)
                        Text(previous.detail)
                            .slLead()
                            .slNumerals()
                            .foregroundStyle(SL.Ink.primary)
                    }
                } else {
                    Text("Geen historiek voor deze oefening.")
                        .slBody()
                        .foregroundStyle(SL.Ink.secondary)
                }
            }
            .padding(.top, 10)
        }
    }

    /// The quiet, session-long way back from a swap or a program change: an
    /// eyebrow and a text action, never a button that competes with logging.
    private func undoLine(_ text: String, accessibility: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: SL.Space.s3) {
            SLEyebrow(text: text)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: SL.Space.s2)
            Button { undoLatestChange() } label: {
                Text("Ongedaan maken").slMeta(SL.Weight.medium)
                    .foregroundStyle(SL.Ink.secondary)
                    .fixedSize()
                    .slHitTarget()
            }
            .buttonStyle(.plain)
            .accessibilityLabel(accessibility)
        }
        .padding(.top, 8)
    }

    /// Reverses the latest change in the current slot — and, when that was a
    /// program change, takes it out of the program too.
    private func undoLatestChange() {
        let index = runner.currentIndex
        guard let point = runner.undoChange(slotIndex: index) else { return }
        toast = nil
        if let replacement = point.replacement {
            Task { await app.undoReplacement(replacement) }
            show("\(app.exercise(replacement.originExerciseID).name) staat weer in je schema.", undo: nil)
        }
    }

    /// "Bewaard: Flat bench press · 1 set"
    private func preservedLine(_ results: [ExerciseResult]) -> String {
        let parts = results.map { "\($0.name) · \($0.sets.count) \($0.sets.count == 1 ? "set" : "sets")" }
        return "Bewaard: " + parts.joined(separator: ", ")
    }

    /// One component, four tones. None of them applies anything.
    private var proposalCard: some View {
        let proposal = runner.current.proposal
        return VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .center) {
                SLEyebrow(
                    text: proposal.label ?? toneLabel(proposal.tone),
                    color: proposal.tone == .ready ? SL.Signal.action : SL.Ink.tertiary
                )
                Spacer()
                Button {
                    runner.dismissProposal(slotIndex: runner.currentIndex)
                } label: {
                    Text("Sluiten").slBody().foregroundStyle(SL.Ink.tertiary).slHitTarget()
                }
                .buttonStyle(.plain)
            }

            Text(proposal.headline)
                .slTitle()
                .lineSpacing(SL.TypeSize.title * 0.3)
                .foregroundStyle(SL.Ink.primary)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 10)

            if proposal.tone != .noReference {
                Group {
                    if typeSize.isAccessibilitySize {
                        VStack(spacing: SL.Space.s2) { proposalSteppers }
                    } else {
                        HStack(spacing: SL.Space.s2) { proposalSteppers }
                    }
                }
                .padding(.top, SL.Space.s4)
            }

            Text(proposal.body)
                .slMeta()
                .lineSpacing(SL.TypeSize.meta * (SL.LineHeight.body - 1))
                .foregroundStyle(SL.Ink.secondary)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 14)
        }
        .padding(SL.Space.s5)
        .frame(maxWidth: .infinity, alignment: .leading)
        .slCardStrong(fill: SL.Surface.raised2)
    }

    @ViewBuilder
    private var proposalSteppers: some View {
        SLStepper(
            label: "Gewicht",
            display: app.display.number(runner.proposedWeight(slotIndex: runner.currentIndex) ?? 0),
            level: .onRaised2,
            onDecrement: { runner.adjustProposedWeight(slotIndex: runner.currentIndex, by: -increment) },
            onIncrement: { runner.adjustProposedWeight(slotIndex: runner.currentIndex, by: increment) }
        )
        SLStepper(
            label: "Mik op",
            display: "\(runner.proposedRepTarget(slotIndex: runner.currentIndex))",
            level: .onRaised2,
            onDecrement: { runner.adjustProposedReps(slotIndex: runner.currentIndex, by: -1) },
            onIncrement: { runner.adjustProposedReps(slotIndex: runner.currentIndex, by: 1) }
        )
    }

    /// At accessibility sizes the full card pushes the first set row off the
    /// screen. The same proposal on one line; `Toon` opens the full card.
    private var compactProposal: some View {
        let proposal = runner.current.proposal
        return VStack(alignment: .leading, spacing: 0) {
            SLEyebrow(
                text: proposal.label ?? toneLabel(proposal.tone),
                color: proposal.tone == .ready ? SL.Signal.action : SL.Ink.tertiary
            )
            Text(compactProposalSummary)
                .slLead()
                .slNumerals()
                .foregroundStyle(SL.Ink.primary)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 6)
            HStack {
                Button { expandedProposals.insert(runner.currentIndex) } label: {
                    Text("Toon").slBody(SL.Weight.semibold).foregroundStyle(SL.Ink.secondary).slHitTarget()
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Toon het volledige voorstel")
                Spacer()
                Button { runner.dismissProposal(slotIndex: runner.currentIndex) } label: {
                    Text("Sluiten").slBody().foregroundStyle(SL.Ink.tertiary).slHitTarget()
                }
                .buttonStyle(.plain)
            }
            .padding(.top, SL.Space.s2)
        }
        .padding(SL.Space.s4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .slCardStrong(fill: SL.Surface.raised2)
    }

    private var compactProposalSummary: String {
        let index = runner.currentIndex
        let proposal = runner.current.proposal
        guard proposal.tone != .noReference else { return proposal.headline }
        let weight = runner.proposedWeight(slotIndex: index).map { app.display.kg($0) } ?? "—"
        guard let targets = runner.proposedTargets(slotIndex: index) else { return weight }
        return "\(weight) · mik op \(ProgressionEngine.repsLabel(targets))"
    }

    private var increment: Decimal { runner.current.exercise.incrementKg }

    /// Artboard 28. Same slot, same size and radius as the proposal card it
    /// replaces — the app asks for a weight instead of proposing one.
    private func calibrationCard(_ prompt: CalibrationPrompt) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            SLEyebrow(text: prompt.contextLabel)
            SLEyebrow(text: "Set 1 · kalibratie").padding(.top, 10)
            Text(prompt.headline)
                .slTitle()
                .lineSpacing(SL.TypeSize.title * 0.3)
                .foregroundStyle(SL.Ink.primary)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 6)
            Text(prompt.body)
                .slMeta()
                .lineSpacing(SL.TypeSize.meta * (SL.LineHeight.body - 1))
                .foregroundStyle(SL.Ink.secondary)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 14)
        }
        .padding(SL.Space.s5)
        .frame(maxWidth: .infinity, alignment: .leading)
        .slCardStrong(fill: SL.Surface.raised2)
    }

    /// Artboard 28b, plus the one honest extra: say so when the set was easy
    /// enough that the next one starts a step higher.
    private func calibratedSummary(_ summary: String) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            SLEyebrow(text: "Gekalibreerd op")
            Text(summary)
                .slLead().slNumerals()
                .foregroundStyle(SL.Ink.primary)
                .padding(.top, 4)
            if runner.didStepUpAfterCalibration(slotIndex: runner.currentIndex) {
                Text("RIR 3 of meer: set 2 staat één stap hoger. Pas aan als dat niet klopt.")
                    .slMeta()
                    .foregroundStyle(SL.Ink.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 6)
            }
        }
        .padding(SL.Space.s4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .slCard(radius: SL.Radius.lg)
    }

    private func toneLabel(_ tone: ProposalTone) -> String {
        switch tone {
        case .ready: return "Bovengrens bevestigd"
        case .close: return "Bijna"
        case .neutral: return "Voorstel"
        case .noReference: return "Referentie"
        }
    }

    /// Artboard 30. Generated from today's top set, outside the working-set
    /// card, dashed, with no status dot and no rest timer — and no taps: it is
    /// a reference strip, not a log.
    @ViewBuilder
    private var warmupSection: some View {
        let ladder = runner.warmupLadder(slotIndex: runner.currentIndex)
        if !ladder.isEmpty {
            if runner.isWarmupCollapsed(slotIndex: runner.currentIndex) {
                Button { runner.showWarmup(slotIndex: runner.currentIndex) } label: {
                    HStack(spacing: SL.Space.s2) {
                        Text(runner.collapsedWarmupLabel(slotIndex: runner.currentIndex))
                            .slMeta()
                            .foregroundStyle(SL.Ink.tertiary)
                        Text("Toon")
                            .slMeta(SL.Weight.semibold)
                            .foregroundStyle(SL.Ink.secondary)
                        Spacer(minLength: 0)
                    }
                    .frame(minHeight: SL.Space.hitMin)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("\(runner.collapsedWarmupLabel(slotIndex: runner.currentIndex)), tonen")
            } else {
                VStack(alignment: .leading, spacing: 0) {
                    if let topSet = runner.topSetLabel(slotIndex: runner.currentIndex) {
                        HStack(alignment: .firstTextBaseline, spacing: SL.Space.s2) {
                            SLEyebrow(text: "Topset vandaag")
                            Text(topSet).slLead().slNumerals().foregroundStyle(SL.Ink.primary)
                        }
                        .padding(.bottom, SL.Space.s4)
                    }

                    HStack {
                        SLEyebrow(text: "Opwarmen · telt niet mee")
                        Spacer()
                        Button {
                            Task { await app.hideWarmup(exerciseID: runner.current.planned.exerciseID) }
                        } label: {
                            Text("Altijd verbergen").slMeta().foregroundStyle(SL.Ink.tertiary).slHitTarget()
                        }
                        .buttonStyle(.plain)
                    }
                    .padding(.bottom, SL.Space.s2)

                    VStack(spacing: SLSetColumn.rowGap) {
                        ForEach(SetRowPresenter.warmupRows(ladder), id: \.index) { row in
                            SLSetRow(row: row) {}
                        }
                    }

                    Text(WarmupPlanner.footnote(
                        topSetKg: ladder.last?.weightKg ?? 0,
                        formatter: app.display
                    ))
                    .slMeta()
                    .lineSpacing(SL.TypeSize.meta * (SL.LineHeight.body - 1))
                    .foregroundStyle(SL.Ink.tertiary)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, SL.Space.s3)

                    SLEyebrow(text: "Werksets").padding(.top, SL.Space.s5)
                }
            }
        }
    }

    private var setRows: some View {
        SLSetGrid(referenceLabel: runner.columnHeader(slotIndex: runner.currentIndex)) {
            VStack(spacing: SLSetColumn.rowGap) {
                ForEach(runner.rows(for: runner.currentIndex), id: \.index) { row in
                    SLSetRow(row: row) {
                        runner.editing = (runner.currentIndex, row.index)
                    }
                }
            }
            addSetButton.padding(.top, SL.Space.s1)
        }
    }

    /// The grid's own footer: one more working set, for this session only.
    ///
    /// A text action, not a row — no fill, no dashes (those mean warm-up) and
    /// no lime, so logging stays the screen's one commit action. The plus
    /// sits in the set column, where the next number would be.
    private var addSetButton: some View {
        Button { addSet() } label: {
            HStack(spacing: SL.Space.s2) {
                Image(systemName: "plus")
                    .font(.sl(SL.TypeSize.meta, SL.Weight.semibold))
                Text("Set toevoegen")
                    .slBody(SL.Weight.medium)
                Spacer(minLength: 0)
            }
            .foregroundStyle(SL.Ink.secondary)
            .padding(.horizontal, SLSetColumn.rowInset)
            .frame(minHeight: SL.Space.hitMin)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Set toevoegen aan \(runner.current.exercise.name)")
        .accessibilityHint("Alleen voor deze sessie. Je schema verandert niet.")
    }

    @ViewBuilder
    private var upNext: some View {
        if let next = runner.nextSlotIndex {
            let slot = runner.slots[next]
            VStack(alignment: .leading, spacing: SL.Space.s2) {
                SLEyebrow(text: "Volgende")
                Button { runner.advance() } label: {
                    HStack {
                        Text(slot.exercise.name).slBody().foregroundStyle(SL.Ink.secondary)
                        Spacer()
                        Text("\(slot.planned.targetSets) × \(slot.planned.sets.first?.repRange.upperBound ?? 0)")
                            .slMeta().slNumerals()
                            .foregroundStyle(SL.Ink.tertiary)
                        Image(systemName: "chevron.right")
                            .font(.sl(SL.TypeSize.meta, SL.Weight.semibold))
                            .foregroundStyle(SL.Ink.tertiary)
                    }
                    .frame(minHeight: SL.Space.hitMin)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Volgende oefening, \(slot.exercise.name)")
            }
        }
    }

    // MARK: Bottom bar
    //
    // The undo surface, the timer and the commit action share one bottom
    // inset, so the scroll view always reserves room for all of them. Nothing
    // in the session can end up underneath, and nothing covers the primary
    // action.

    private var bottomBar: some View {
        VStack(spacing: SL.Space.s3) {
            if let toast {
                SLUndoToast(message: toast.message, onUndo: toast.undo, onDismiss: { self.toast = nil })
                    .transition(.opacity)
            }
            if let timer = runner.restTimer {
                SLFloatingTimer(
                    title: runner.restTitle,
                    remaining: timer.remaining(at: runner.now),
                    total: timer.targetSeconds + timer.adjustmentSeconds,
                    isExpanded: runner.isTimerExpanded,
                    onAdjust: { runner.adjustRest(by: $0) },
                    onToggleExpanded: { runner.toggleTimerExpanded() },
                    onSkip: { runner.endRest() }
                )
            }
            primaryAction
        }
        .padding(.horizontal, SL.Space.gutterSession)
        .padding(.top, SL.Space.s3)
        .padding(.bottom, SL.Space.s3)
        .background(SL.Surface.ground)
    }

    /// One primary action, and it is whichever one is true right now.
    @ViewBuilder
    private var primaryAction: some View {
        if runner.isComplete {
            Button { showsComplete = true } label: { Text("Sessie afronden") }
                .buttonStyle(SLPrimaryButtonStyle())
        } else if let next = runner.nextIndex(in: runner.current) {
            Button { runner.editing = (runner.currentIndex, next) } label: {
                Text(next == 0 && runner.needsCalibration(slotIndex: runner.currentIndex)
                     ? "Kalibratieset invoeren"
                     : "Begin set \(next + 1)")
            }
            .buttonStyle(SLPrimaryButtonStyle())
        } else if let next = runner.nextSlotIndex {
            Button { runner.advance() } label: {
                Text("Volgende · \(runner.slots[next].exercise.name)")
            }
            .buttonStyle(SLPrimaryButtonStyle())
        }
    }
}
