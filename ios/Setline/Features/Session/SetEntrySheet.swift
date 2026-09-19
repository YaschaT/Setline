import SwiftUI
import SetlineCore

/// Tap 1 of 2 opens this, pre-filled from the previous session. Tap 2 is
/// `Log set`. Changing weight or reps is optional and costs extra taps; it is
/// never on the default path.
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

    @State private var weight: Decimal
    @State private var reps: Int
    @State private var rir: Int?
    @State private var failed = false
    @State private var paused: Bool
    @State private var partialReps: Int?
    @State private var showsKeypad = false
    @State private var keypadText = ""
    @State private var showsPlates = false
    @State private var confirmsRemoval = false
    /// The sheet's height, measured once as it opens and then held: 11R's
    /// sheet hugs its content, and a detent must never grow while the
    /// keyboard is up.
    @State private var openingHeight: CGFloat?
    @FocusState private var keypadFocused: Bool

    private let display = NumberDisplay.dutch

    init(
        slot: SessionRunner.ExerciseSlot,
        setIndex: Int,
        isCalibration: Bool = false,
        proposedReps: Int? = nil,
        startsPartial: Bool = false,
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
        _reps = State(initialValue: isCalibration
            ? Calibration.targetReps
            : (draft.reps > 0
                ? draft.reps
                : (proposedReps ?? reference?.reps ?? plannedTop)))
        // Stepping to a first weight from zero is 30-odd taps. A calibration
        // set opens on the keypad instead.
        _showsKeypad = State(initialValue: isCalibration)
        _keypadText = State(initialValue: "")
        // A planned paused exercise opens with pause already on, because that
        // is what the plan prescribes; anywhere else it is off until asked for.
        _paused = State(initialValue: slot.planned.modifiers.pauseEnabled)
        // The pain flow's "Beperk de beweging" opens the set with partial on,
        // because that is what it promised.
        _partialReps = State(initialValue: startsPartial ? 1 : nil)
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
        guard asksForRIR else { return "Gewicht en reps zijn een volledige set." }
        if pointsToAccount { return "Per set vragen zet je aan in Account." }
        return "Gewicht en reps zijn een volledige set. RIR mag leeg blijven."
    }

    /// 12R: once RIR is set on the one set that asks, the footnote says where
    /// to have it asked on every set.
    private var pointsToAccount: Bool {
        asksForRIR && rir != nil && !RIRPreference.everySet
    }

    /// A set added during this session rather than prescribed.
    private var isAddedSet: Bool {
        slot.sets.indices.contains(setIndex) && slot.sets[setIndex].origin == .sessionAdded
    }

    private var canRemove: Bool { isAddedSet && onRemove != nil }

    /// The first frame's estimate, until the content has been measured.
    ///
    /// Either way the height is fixed for as long as the sheet is open: it
    /// never reacts to the keypad or the partial-rep row. A detent that grows
    /// while the keyboard is up cannot be satisfied — the sheet stops resizing
    /// and taps land nowhere, which is exactly what happened to the `Partieel`
    /// chip. Anything that appears later scrolls instead.
    private var sheetHeight: CGFloat {
        var height: CGFloat = 391        // grabber, head, steppers, chips, pill, footnote
        if asksForRIR { height += 86 }
        if isCalibration { height += 56 } // the keypad it opens on
        if canRemove { height += 52 }     // the quiet way back out
        return height
    }

    private var increment: Decimal { slot.exercise.incrementKg }

    var body: some View {
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

            if partialReps != nil { partialRow.padding(.bottom, SL.Space.s4) }

            if showsKeypad { keypad.padding(.bottom, SL.Space.s3) }

            if !isAccessibilityLayout { logControls }
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
            guard isCalibration else { return }
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
        .alert("Set \(setIndex + 1) verwijderen?", isPresented: $confirmsRemoval) {
            Button("Annuleer", role: .cancel) {}
            Button("Verwijder", role: .destructive) { onRemove?() }
        } message: {
            Text(removalMessage)
        }
    }

    private var isAccessibilityLayout: Bool { typeSize.isAccessibilitySize }

    @ViewBuilder
    private var steppers: some View {
        SLStepper(
            label: "Gewicht",
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
                    paused: paused,
                    partialReps: partialReps
                ))
            } label: {
                Text("Log set")
            }
            .buttonStyle(SLPrimaryButtonStyle())
            .disabled(weight <= 0 || reps <= 0)

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
                    Text("Verwijder set \(setIndex + 1)")
                        .slBody(SL.Weight.medium)
                        .foregroundStyle(SL.Ink.secondary)
                        .frame(maxWidth: .infinity)
                        .frame(minHeight: SL.Space.hitMin)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .padding(.top, SL.Space.s2)
                .accessibilityHint("Alleen uit deze sessie. Je schema verandert niet.")
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
            return "Deze set verdwijnt uit deze sessie. Je schema verandert niet."
        }
        return "\(display.kg(weight)) × \(slot.sets[setIndex].reps) verdwijnt uit deze sessie. Je schema verandert niet."
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
        if isCalibration { return "Set 1 · kalibratie" }
        if isAddedSet { return "Set \(setIndex + 1) · extra" }
        // Once a set is added, the last prescribed set is no longer the last.
        let last = setIndex == slot.sets.count - 1
        return last ? "Set \(setIndex + 1) · laatste set" : "Set \(setIndex + 1)"
    }

    private var referenceLabel: String? {
        if isCalibration { return "mik op \(Calibration.targetReps) · RIR \(Calibration.targetRIR)" }
        guard let reference = slot.history.mostRecent?.sets.first(where: { $0.index == setIndex }),
              let weight = reference.weightKg
        else { return nil }
        return "vorige \(display.setReference(weightKg: weight, reps: reference.reps))"
    }

    private var rirRow: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline) {
                SLEyebrow(text: "Reps in reserve")
                Spacer()
                Text(rir.map(rirCaption) ?? "optioneel")
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
                            .foregroundStyle(rir == value ? SL.Ink.primary : SL.Ink.secondary)
                            .frame(maxWidth: .infinity)
                            .frame(minHeight: SL.Metric.chipHeight)
                            .background(
                                RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous)
                                    .fill(SL.Surface.raised2)
                            )
                            .overlay(
                                RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous)
                                    .strokeBorder(
                                        rir == value ? SL.Surface.selection : Color.clear,
                                        lineWidth: 1
                                    )
                            )
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("RIR \(value == 4 ? "4 of meer" : "\(value)")")
                    .accessibilityAddTraits(rir == value ? [.isSelected, .isButton] : .isButton)
                }
            }
        }
    }

    private func rirCaption(_ value: Int) -> String {
        switch value {
        case 0: return "0 · niets meer over"
        case 1: return "1 · nog één in de tank"
        case 2: return "2 · nog twee in de tank"
        case 3: return "3 · ruim voor falen"
        default: return "4+ · ver van falen"
        }
    }

    /// The sheet's tools as 12 and 11–13 draw them: one row of equal 44pt
    /// buttons, 6 apart — `Toetsenblok`, `Mislukt`, `Pauze-reps`, and 16R's
    /// `Partieel`. At accessibility sizes they take two rows so every label
    /// stays whole.
    private var chips: some View {
        let toetsenblok = chip("Toetsenblok", isOn: showsKeypad) {
            showsKeypad.toggle()
            keypadText = weight > 0 ? display.number(weight) : ""
            keypadFocused = showsKeypad
        }
        let mislukt = chip("Mislukt", isOn: failed) { failed.toggle() }
        let pauze = chip("Pauze-reps", isOn: paused) { paused.toggle() }
        let partieel = chip("Partieel", isOn: partialReps != nil) {
            partialReps = partialReps == nil ? 1 : nil
        }
        return Group {
            if isAccessibilityLayout {
                VStack(spacing: 6) {
                    HStack(spacing: 6) { toetsenblok; mislukt }
                    HStack(spacing: 6) { pauze; partieel }
                }
            } else {
                HStack(spacing: 6) { toetsenblok; mislukt; pauze; partieel }
            }
        }
    }

    /// Partial reps are a count, not a rep type — they are recorded beside the
    /// rep number, never inside it.
    private var partialRow: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline) {
                SLEyebrow(text: "Partiële reps")
                Spacer()
                Text("tellen niet mee in je progressie")
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
                            .foregroundStyle(partialReps == value ? SL.Ink.primary : SL.Ink.secondary)
                            .frame(maxWidth: .infinity)
                            .frame(minHeight: SL.Metric.chipHeight)
                            .background(
                                RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous)
                                    .fill(SL.Surface.raised2)
                            )
                            .overlay(
                                RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous)
                                    .strokeBorder(partialReps == value ? SL.Surface.selection : .clear, lineWidth: 1)
                            )
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("\(value == 4 ? "Vier of meer" : "\(value)") partiële reps")
                    .accessibilityAddTraits(partialReps == value ? [.isSelected, .isButton] : .isButton)
                }
            }
        }
    }

    /// raised2 at 13/500 in `text2`; on, the .28 edge and white — the same
    /// selected state the RIR chips beside it use (12R).
    private func chip(_ title: String, isOn: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .slMeta(SL.Weight.medium)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                .foregroundStyle(isOn ? SL.Ink.primary : SL.Ink.secondary)
                .padding(.horizontal, 6)
                .frame(maxWidth: .infinity)
                .frame(minHeight: SL.Metric.chipHeight)
                .background(
                    RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous)
                        .fill(SL.Surface.raised2)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous)
                        .strokeBorder(isOn ? SL.Surface.selection : .clear, lineWidth: 1)
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
            SLEyebrow(text: "Gewicht")
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
