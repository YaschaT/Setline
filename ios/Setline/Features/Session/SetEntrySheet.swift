import SwiftUI
import SetlineCore

/// Everything one set can carry, for the times the input card is not enough.
///
/// The default path never comes here: a set is saved from the card under the
/// exercise in one tap. This sheet opens from `Meer`, from the weight itself,
/// or from a row — to correct a set already written, to type a weight off the
/// step, or to say what the set was: reps in reserve, failed, paused, partial,
/// to failure, a drop set, and on a one-sided exercise the side. It is also
/// the whole logger at accessibility text sizes, so nothing the card offers
/// is missing here.
struct SetEntrySheet: View {
    let slot: SessionRunner.ExerciseSlot
    let setIndex: Int
    /// The first set of an exercise with no history (artboard 28).
    let isCalibration: Bool
    /// What SETLINE proposed for *this* row, from its own range.
    let proposedReps: Int?
    let onLog: (SessionRunner.SetEntry) -> Void
    let onClose: () -> Void
    /// Takes the row out of the session. Only a set added during the session
    /// has one — a prescribed set is skipped by leaving it open.
    let onRemove: (() -> Void)?

    @Environment(\.dynamicTypeSize) private var typeSize
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    @State private var weight: Decimal
    @State private var reps: Int
    @State private var rir: Int?
    @State private var failed = false
    /// How many of this set's reps were paused. `nil` is none; the chip
    /// opens it on every rep, which is what the pause chip always meant.
    @State private var pausedReps: Int?
    @State private var partialReps: Int?
    /// One-sided exercises only; always one picked.
    @State private var side: SetSide
    /// A drop set's lighter rounds.
    @State private var drops: [DropStep]
    @State private var showsKeypad = false
    @State private var keypadText = ""
    @State private var showsPlates = false
    @State private var confirmsRemoval = false
    /// The sheet's height, measured once as it opens and then held: 11R's
    /// sheet hugs its content, and a detent must never grow while the
    /// keyboard is up.
    @State private var openingHeight: CGFloat?
    @FocusState private var keypadFocused: Bool

    private let display = NumberDisplay.english

    init(
        slot: SessionRunner.ExerciseSlot,
        setIndex: Int,
        isCalibration: Bool = false,
        proposedReps: Int? = nil,
        startsPartial: Bool = false,
        startsOnKeypad: Bool = false,
        proposedRIR: Int? = nil,
        onLog: @escaping (SessionRunner.SetEntry) -> Void,
        onClose: @escaping () -> Void,
        onRemove: (() -> Void)? = nil
    ) {
        self.slot = slot
        self.setIndex = setIndex
        self.isCalibration = isCalibration
        self.proposedReps = proposedReps
        self.onLog = onLog
        self.onClose = onClose
        self.onRemove = onRemove

        let draft = slot.sets[setIndex]
        let reference = slot.history.mostRecent?.sets.first { $0.index == setIndex }
        // A row added during the session has no range of its own.
        let plannedTop = slot.planned.sets.indices.contains(setIndex)
            ? slot.planned.sets[setIndex].repRange.upperBound
            : (slot.planned.sets.last?.repRange.upperBound ?? 8)
        _weight = State(initialValue: draft.weightKg ?? reference?.weightKg ?? 0)
        let openingReps = isCalibration
            ? Calibration.targetReps
            : (draft.reps > 0
                ? draft.reps
                : (proposedReps ?? reference?.reps ?? plannedTop))
        _reps = State(initialValue: openingReps)
        // Stepping to a first weight from zero is 30-odd taps. A calibration
        // set opens on the keypad instead.
        _showsKeypad = State(initialValue: isCalibration || startsOnKeypad)
        _keypadText = State(initialValue: "")
        // A set being corrected opens on what it holds; one still open, on the
        // reserve already picked in the card.
        _rir = State(initialValue: draft.isLogged ? draft.rirReported : proposedRIR)
        _failed = State(initialValue: draft.isLogged && draft.flags.contains(.failed))
        let previousSide = slot.sets.prefix(setIndex).last(where: \.isLogged)?.side
        // A two-sided exercise is both sides until one is picked.
        _side = State(initialValue: draft.side ?? (slot.exercise.unilateral ? SetSidePicker.defaultSide(after: previousSide) : .both))
        _drops = State(initialValue: draft.drops)
        if draft.isLogged {
            // A correction changes what it is asked to change. Opening a
            // written set on the plan's defaults would quietly strip the pause
            // or the partial reps it was logged with.
            _pausedReps = State(initialValue: draft.modifiers.pauseEnabled ? (draft.pausedReps ?? draft.reps) : nil)
            _partialReps = State(initialValue: (draft.partialReps ?? 0) > 0 ? draft.partialReps : nil)
        } else {
            // Off until asked for, on every exercise alike.
            _pausedReps = State(initialValue: nil)
            // The pain flow's "Beperk de beweging" opens the set with partial
            // on, because that is what it promised.
            _partialReps = State(initialValue: startsPartial ? 1 : nil)
        }
    }

    /// RIR is the third, optional tap. By default an exercise asks it on its
    /// last prescribed set (addendum 11R) and on any set added after it.
    /// Per-set entry is an Account setting.
    private var asksForRIR: Bool {
        isCalibration || RIRPreference.everySet || slot.model.asksForRIR(at: setIndex)
    }

    /// 11R while the reserve is still empty; 12R once it is set, which is when
    /// it is worth saying where asking on every set is switched on.
    private var footnote: String {
        guard asksForRIR else { return "Weight and reps make a complete set." }
        if pointsToAccount { return "Turn on asking for every set in Account." }
        return "Weight and reps make a complete set. RIR can stay empty."
    }

    /// 12R: once RIR is set on the one set that asks, the footnote says where
    /// to have it asked on every set.
    private var pointsToAccount: Bool {
        asksForRIR && rir != nil && !RIRPreference.everySet
    }

    /// The row already holds a written set: this is a correction.
    private var isCorrection: Bool {
        slot.sets.indices.contains(setIndex) && slot.sets[setIndex].isLogged
    }

    /// A set added during this session rather than prescribed.
    private var isAddedSet: Bool {
        slot.sets.indices.contains(setIndex) && slot.sets[setIndex].origin == .sessionAdded
    }

    private var canRemove: Bool { onRemove != nil }

    /// The first frame's estimate, until the content has been measured.
    ///
    /// Either way the height is fixed for as long as the sheet is open: it
    /// never reacts to the keypad or the partial-rep row. A detent that grows
    /// while the keyboard is up cannot be satisfied — the sheet stops resizing
    /// and taps land nowhere, which is exactly what happened to the `Partieel`
    /// chip. Anything that appears later scrolls instead.
    private var sheetHeight: CGFloat {
        var height: CGFloat = 391        // grabber, head, steppers, chips, pill, footnote
        height += 52                      // the side row, on every exercise
        if asksForRIR { height += 86 }
        if showsKeypad { height += 56 }   // the keypad it opens on
        if canRemove { height += 52 }     // the quiet way back out
        return height
    }

    private var increment: Decimal { slot.exercise.incrementKg }

    private static let logControlsID = "log-controls"
    private static let pausedRowID = "paused-row"
    private static let partialRowID = "partial-row"
    private static let dropsRowID = "drops-row"

    /// Brings what a chip just opened into view. At ordinary sizes that is
    /// the commit and its footnote, which take the opened row with them; at
    /// accessibility sizes the commit is pinned below the content and always
    /// in view, so it is the opened row itself, just above the commit.
    private func reveal(_ scroller: ScrollViewProxy, row: String) {
        let target = isAccessibilityLayout ? row : Self.logControlsID
        Task { @MainActor in
            withAnimation(reduceMotion ? nil : .easeOut(duration: SL.Motion.base)) {
                scroller.scrollTo(target, anchor: .bottom)
            }
        }
    }

    var body: some View {
        ScrollViewReader { scroller in
        ScrollView {
        VStack(alignment: .leading, spacing: 0) {
            grabber

            HStack(alignment: .firstTextBaseline) {
                SLEyebrow(text: setLabel)
                Spacer()
                if let reference = referenceLabel {
                    Text(reference).slMeta().slNumerals().foregroundStyle(SL.Ink.secondary)
                }
            }
            .padding(.bottom, 14)

            Group {
                if isAccessibilityLayout {
                    VStack(spacing: SL.Space.s2) { steppers }
                } else {
                    SLFlexPair { steppers }
                }
            }
            .padding(.bottom, SL.Space.s4)

            if asksForRIR { rirRow.padding(.bottom, SL.Space.s4) }

            chips.padding(.bottom, SL.Space.s4)

            // Every exercise can be done one side at a time.
            HStack {
                SLEyebrow(text: "Side")
                Spacer()
                SetSidePicker(side: $side)
            }
            .padding(.bottom, SL.Space.s4)

            if !drops.isEmpty {
                DropSetEditor(drops: $drops, step: increment, display: display)
                    .id(Self.dropsRowID)
                    .padding(.bottom, SL.Space.s4)
            }

            if let paused = pausedReps { pausedRow(paused).id(Self.pausedRowID).padding(.bottom, SL.Space.s4) }

            if partialReps != nil { partialRow.id(Self.partialRowID).padding(.bottom, SL.Space.s4) }

            if showsKeypad { keypad.padding(.bottom, SL.Space.s3) }

            if !isAccessibilityLayout { logControls.id(Self.logControlsID) }
        }
        .padding(.horizontal, SL.Space.gutterSession)
        .padding(.top, SL.Space.s4)
        // 11R ends the sheet 42 above the frame's edge, home band included.
        .padding(.bottom, SL.Space.sessionBlockBottom)
        .frame(maxWidth: .infinity, alignment: .leading)
        .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { height in
            if openingHeight == nil { openingHeight = height }
        }
        }
        .scrollBounceBehavior(.basedOnSize)
        // The sheet's height is fixed once it opens, so a pause or partial
        // row opened afterwards lands below its edge, taking the commit with
        // it. Bring them back into view: the set stays one tap from saved.
        .onChange(of: pausedReps != nil) { _, opened in if opened { reveal(scroller, row: Self.pausedRowID) } }
        .onChange(of: partialReps != nil) { _, opened in if opened { reveal(scroller, row: Self.partialRowID) } }
        .onChange(of: drops.count) { before, after in if after > before { reveal(scroller, row: Self.dropsRowID) } }
        }
        .background(SL.Surface.raised)
        .safeAreaInset(edge: .bottom) {
            // At accessibility sizes the sheet takes the full height and the
            // commit action is pinned, so it is reachable without scrolling.
            if isAccessibilityLayout {
                logControls
                    .padding(.horizontal, SL.Space.gutterSession)
                    .padding(.top, SL.Space.s3)
                    .padding(.bottom, SL.Space.s2)
                    .background(SL.Surface.raised)
            }
        }
        .task {
            // The keyboard comes up once the sheet has settled on its measured
            // height, never while that height is still being decided.
            guard showsKeypad else { return }
            try? await Task.sleep(for: .milliseconds(400))
            keypadFocused = true
        }
        .presentationDetents(isAccessibilityLayout ? [.large] : [.height(openingHeight ?? sheetHeight)])
        .presentationBackground(SL.Surface.raised)
        .presentationDragIndicator(.hidden)
        .sheet(isPresented: $showsPlates) {
            PlateSheet(
                exercise: slot.exercise.name,
                setNumber: setIndex + 1,
                reps: reps,
                target: weight,
                onChoose: { load in
                    weight = load
                    showsPlates = false
                },
                onClose: { showsPlates = false }
            )
        }
        .alert("Remove set \(setIndex + 1)?", isPresented: $confirmsRemoval) {
            Button("Cancel", role: .cancel) {}
            Button("Remove", role: .destructive) { onRemove?() }
        } message: {
            Text(removalMessage)
        }
    }

    private var isAccessibilityLayout: Bool { typeSize.isAccessibilitySize }

    @ViewBuilder
    private var steppers: some View {
        SLStepper(
            label: "Weight",
            display: display.number(weight),
            onTapValue: { showsPlates = true },
            onDecrement: { weight = max(0, weight - increment) },
            onIncrement: { weight += increment }
        )
        SLStepper(
            label: "Reps",
            display: "\(reps)",
            onDecrement: { reps = max(0, reps - 1) },
            onIncrement: { reps += 1 }
        )
    }

    private var logControls: some View {
        VStack(spacing: 0) {
            Button {
                onLog(SessionRunner.SetEntry(
                    weightKg: weight,
                    reps: reps,
                    rir: rir,
                    failed: failed,
                    pausedReps: pausedReps,
                    partialReps: partialReps,
                    side: slot.exercise.unilateral || side != .both ? side : nil,
                    drops: drops
                ))
            } label: {
                Text(isCorrection ? "Update set \(setIndex + 1)" : "Save set")
            }
            .buttonStyle(SLPrimaryButtonStyle())
            .disabled(weight < 0 || reps <= 0)

            Text(footnote)
                .slMeta()
                // 11R sets its footnote in `text2`; 12R's pointer to Account
                // steps back to `text3`.
                .foregroundStyle(pointsToAccount ? SL.Ink.tertiary : SL.Ink.secondary)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)
                .padding(.top, SL.Space.s3)

            if canRemove {
                Button(action: requestRemoval) {
                    Text("Remove set \(setIndex + 1)")
                        .slBody(SL.Weight.medium)
                        .foregroundStyle(SL.Ink.secondary)
                        .frame(maxWidth: .infinity)
                        .frame(minHeight: SL.Space.hitMin)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .padding(.top, SL.Space.s2)
                .accessibilityHint("Only from this session. Your plan doesn't change.")
            }
        }
    }

    /// An empty row simply goes. A written set is real work, so it asks first.
    private func requestRemoval() {
        if slot.sets.indices.contains(setIndex), slot.sets[setIndex].isLogged {
            confirmsRemoval = true
        } else {
            onRemove?()
        }
    }

    /// What a confirmed removal takes out, in the set's logged numbers.
    private var removalMessage: String {
        guard slot.sets.indices.contains(setIndex), let weight = slot.sets[setIndex].weightKg else {
            return "This set disappears from this session. Your plan doesn't change."
        }
        return "\(display.kg(weight)) × \(slot.sets[setIndex].reps) disappears from this session. Your plan doesn't change."
    }

    private var grabber: some View {
        HStack {
            Spacer()
            RoundedRectangle(cornerRadius: 3, style: .continuous)
                .fill(SL.Surface.hairlineStrong)
                .frame(width: 36, height: 5)
            Spacer()
        }
        .padding(.top, SL.Space.s3)
    }

    private var setLabel: String {
        if isCalibration { return "Set 1 · calibration" }
        if isAddedSet { return "Set \(setIndex + 1) · extra" }
        // Once a set is added, the last prescribed set is no longer the last.
        let last = setIndex == slot.sets.count - 1
        return last ? "Set \(setIndex + 1) · last set" : "Set \(setIndex + 1)"
    }

    private var referenceLabel: String? {
        if isCalibration { return "aim for \(Calibration.targetReps) · RIR \(Calibration.targetRIR)" }
        guard let reference = slot.history.mostRecent?.sets.first(where: { $0.index == setIndex }),
              let weight = reference.weightKg
        else { return nil }
        return "last \(display.setReference(weightKg: weight, reps: reference.reps))"
    }

    private var rirRow: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline) {
                SLEyebrow(text: "Reps in reserve")
                Spacer()
                Text(rir.map(rirCaption) ?? "optional")
                    .slMeta()
                    .foregroundStyle(SL.Ink.tertiary)
            }
            .padding(.bottom, SL.Space.s2)
            HStack(spacing: 6) {
                ForEach(0..<5, id: \.self) { value in
                    Button {
                        rir = (rir == value) ? nil : value
                    } label: {
                        Text(value == 4 ? "4+" : "\(value)")
                            .slLead()
                            .slNumerals()
                            .foregroundStyle(rir == value ? SL.Signal.action : SL.Ink.primary)
                            .frame(maxWidth: .infinity)
                            .frame(minHeight: SL.Metric.chipHeight)
                            .background(
                                RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous)
                                    .fill(rir == value ? SL.Signal.actionTint : SL.Surface.raised2)
                            )
                            .overlay(
                                RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous)
                                    .strokeBorder(
                                        rir == value ? SL.Signal.action : Color.clear,
                                        lineWidth: 1
                                    )
                            )
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("RIR \(value == 4 ? "4 or more" : "\(value)")")
                    .accessibilityAddTraits(rir == value ? [.isSelected, .isButton] : .isButton)
                }
            }
        }
    }

    private func rirCaption(_ value: Int) -> String {
        switch value {
        case 0: return "0 · nothing left"
        case 1: return "1 · one more in the tank"
        case 2: return "2 · two more in the tank"
        case 3: return "3 · well short of failure"
        default: return "4+ · far from failure"
        }
    }

    /// The sheet's tools as 12 and 11–13 draw them: one row of equal 44pt
    /// buttons, 6 apart — `Toetsenblok`, `Mislukt`, `Pauze-reps`, and 16R's
    /// `Partieel`. At accessibility sizes they take two rows so every label
    /// stays whole.
    private var chips: some View {
        let toetsenblok = chip("Keypad", isOn: showsKeypad) {
            showsKeypad.toggle()
            keypadText = weight > 0 ? display.number(weight) : ""
            keypadFocused = showsKeypad
        }
        let mislukt = chip("Failed", isOn: failed) { failed.toggle() }
        // On, it opens at every rep — the whole-set pause the chip used to
        // be — and the row below narrows it to the reps that were paused.
        let pauze = chip("Paused reps", isOn: pausedReps != nil) {
            pausedReps = pausedReps == nil ? max(1, reps) : nil
        }
        let partieel = chip("Partial", isOn: partialReps != nil) {
            partialReps = partialReps == nil ? 1 : nil
        }
        // Where the reserve row shows, its 0 is "to failure"; elsewhere a chip.
        let falen = chip("To failure", isOn: rir == 0) { rir = rir == 0 ? nil : 0 }
        let drop = chip("Drop set", isOn: !drops.isEmpty) {
            drops = drops.isEmpty ? [DropSetEditor.next(after: weight, reps: reps, step: increment)] : []
        }
        return Group {
            if isAccessibilityLayout {
                VStack(spacing: 6) {
                    HStack(spacing: 6) { toetsenblok; mislukt }
                    HStack(spacing: 6) { pauze; partieel }
                    HStack(spacing: 6) { if !asksForRIR { falen }; drop }
                }
            } else {
                VStack(spacing: 6) {
                    HStack(spacing: 6) { toetsenblok; mislukt; pauze }
                    HStack(spacing: 6) { partieel; if !asksForRIR { falen }; drop }
                }
            }
        }
    }

    /// Paused reps are a count *inside* the reps: six reps with the last two
    /// paused is one set of six. The stepper therefore never passes the reps
    /// performed, and every rep paused simply makes it a paused set.
    private func pausedRow(_ count: Int) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline) {
                SLEyebrow(text: "Paused reps")
                Spacer()
                Text(count >= reps ? "every rep paused" : "of \(reps) reps")
                    .slMeta()
                    .slNumerals()
                    .foregroundStyle(SL.Ink.tertiary)
                    .lineLimit(1).minimumScaleFactor(0.8)
            }
            .padding(.bottom, SL.Space.s2)
            SLStepper(
                label: "Paused",
                display: "\(min(count, max(1, reps)))",
                onDecrement: { pausedReps = max(1, min(count, reps) - 1) },
                onIncrement: { pausedReps = min(max(1, reps), count + 1) }
            )
        }
    }

    /// Partial reps are a count, not a rep type — they are recorded beside the
    /// rep number, never inside it.
    private var partialRow: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline) {
                SLEyebrow(text: "Partial reps")
                Spacer()
                Text("don't count toward your progress")
                    .slMeta()
                    .foregroundStyle(SL.Ink.tertiary)
                    .lineLimit(1).minimumScaleFactor(0.8)
            }
            .padding(.bottom, SL.Space.s2)
            HStack(spacing: 6) {
                ForEach(1..<5) { value in
                    Button { partialReps = value } label: {
                        Text(value == 4 ? "4+" : "\(value)")
                            .slLead()
                            .slNumerals()
                            .foregroundStyle(partialReps == value ? SL.Signal.action : SL.Ink.primary)
                            .frame(maxWidth: .infinity)
                            .frame(minHeight: SL.Metric.chipHeight)
                            .background(
                                RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous)
                                    .fill(partialReps == value ? SL.Signal.actionTint : SL.Surface.raised2)
                            )
                            .overlay(
                                RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous)
                                    .strokeBorder(partialReps == value ? SL.Signal.action : .clear, lineWidth: 1)
                            )
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("\(value == 4 ? "Four or more" : "\(value)") partial reps")
                    .accessibilityAddTraits(partialReps == value ? [.isSelected, .isButton] : .isButton)
                }
            }
        }
    }

    /// Surface-2 at 13 in ink-2; on, the lime tint inside a lime edge — the
    /// same selected state the reserve chips beside it use.
    private func chip(_ title: String, isOn: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .slMeta(SL.Weight.medium)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                .foregroundStyle(isOn ? SL.Signal.action : SL.Ink.secondary)
                .padding(.horizontal, 6)
                .frame(maxWidth: .infinity)
                .frame(minHeight: SL.Metric.chipHeight)
                .background(
                    RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous)
                        .fill(isOn ? SL.Signal.actionTint : SL.Surface.raised2)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous)
                        .strokeBorder(isOn ? SL.Signal.action : .clear, lineWidth: 1)
                )
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .slFocusRing(RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous))
        .accessibilityAddTraits(isOn ? [.isSelected, .isButton] : .isButton)
    }

    /// One tap away, for the rare jump. Never the default input.
    private var keypad: some View {
        HStack(spacing: SL.Space.s3) {
            SLEyebrow(text: "Weight")
            TextField("", text: $keypadText)
                .keyboardType(.decimalPad)
                .font(.sl(16, SL.Weight.semibold))
                .slNumerals()
                .foregroundStyle(SL.Ink.primary)
                .tint(SL.Signal.action)
                .focused($keypadFocused)
                .onChange(of: keypadText) { _, new in
                    // `.decimalPad` governs the on-screen keyboard only; a
                    // hardware keyboard can send anything. Keep the field to
                    // digits and one separator so nothing else can land in it.
                    let filtered = NumberInput.numericOnly(new)
                    if filtered != new { keypadText = filtered }
                    weight = Decimal(string: filtered.replacingOccurrences(of: ",", with: ".")) ?? 0
                }
        }
        .padding(.horizontal, SL.Space.s3)
        .frame(minHeight: SL.Space.hitMin)
        .background(
            RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous)
                .fill(SL.Surface.raised2)
        )
    }
}
