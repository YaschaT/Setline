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
    @State private var runner: SessionRunner
    @State private var showsComplete = false
    @State private var confirmsEarlyFinish = false

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
            value: runner.isTimerExpanded
        )
        .onReceive(clock) { _ in runner.tick() }
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
            set: { if !$0 { runner.editing = nil } }
        )) {
            if let editing = runner.editing {
                SetEntrySheet(
                    slot: runner.slots[editing.slot],
                    setIndex: editing.set,
                    onLog: { weight, reps, rir, failed in
                        runner.log(
                            slotIndex: editing.slot,
                            setIndex: editing.set,
                            weight: weight,
                            reps: reps,
                            rir: rir,
                            failed: failed
                        )
                        UIImpactFeedbackGenerator(style: .light).impactOccurred()
                        runner.editing = nil
                    },
                    onClose: { runner.editing = nil }
                )
            }
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
                onSave: {
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

    // MARK: Chrome

    /// Pause leaves; Afronden appears only once there is something to finish.
    private var header: some View {
        HStack(spacing: SL.Space.s3) {
            Button { onPause(runner.snapshot()) } label: {
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
                    .padding(.vertical, SL.Space.s2)
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
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(slot.exercise.name)\(slot.isComplete ? ", afgerond" : "")")
        .accessibilityAddTraits(isCurrent ? [.isSelected, .isButton] : .isButton)
    }

    private var sessionContent: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                exerciseHeader
                if runner.showsProposal { proposalCard.padding(.top, SL.Space.s5) }
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
            Text(runner.current.exercise.name)
                .slDisplay()
                .foregroundStyle(SL.Ink.primary)
                .fixedSize(horizontal: false, vertical: true)

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
                HStack(spacing: SL.Space.s2) {
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

    private var increment: Decimal { runner.current.exercise.incrementKg }

    private func toneLabel(_ tone: ProposalTone) -> String {
        switch tone {
        case .ready: return "Bovengrens bevestigd"
        case .close: return "Bijna"
        case .neutral: return "Voorstel"
        case .noReference: return "Referentie"
        }
    }

    private var setRows: some View {
        SLSetGrid(referenceLabel: runner.columnHeaderDate) {
            VStack(spacing: SLSetColumn.rowGap) {
                ForEach(runner.rows(for: runner.currentIndex), id: \.index) { row in
                    SLSetRow(row: row) {
                        runner.editing = (runner.currentIndex, row.index)
                    }
                }
            }
        }
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
    // The timer and the commit action share one bottom inset, so the scroll
    // view always reserves room for both. Nothing in the session can end up
    // underneath them, and the timer can never cover the primary action.

    private var bottomBar: some View {
        VStack(spacing: SL.Space.s3) {
            if let timer = runner.restTimer {
                SLFloatingTimer(
                    title: "Rust · \(runner.restRoleLabel) \(RestPrescription.forRole(runner.current.planned.role).displayLabel)",
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
                Text("Begin set \(next + 1)")
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
