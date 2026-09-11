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
    let onLog: (SessionRunner.SetEntry) -> Void
    let onClose: () -> Void

    @State private var weight: Decimal
    @State private var reps: Int
    @State private var rir: Int?
    @State private var failed = false
    @State private var paused: Bool
    @State private var partialReps: Int?
    @State private var showsKeypad = false
    @State private var keypadText = ""
    @FocusState private var keypadFocused: Bool

    private let display = NumberDisplay.dutch

    init(
        slot: SessionRunner.ExerciseSlot,
        setIndex: Int,
        isCalibration: Bool = false,
        onLog: @escaping (SessionRunner.SetEntry) -> Void,
        onClose: @escaping () -> Void
    ) {
        self.slot = slot
        self.setIndex = setIndex
        self.isCalibration = isCalibration
        self.onLog = onLog
        self.onClose = onClose

        let draft = slot.sets[setIndex]
        let reference = slot.history.mostRecent?.sets.first { $0.index == setIndex }
        _weight = State(initialValue: draft.weightKg ?? reference?.weightKg ?? 0)
        _reps = State(initialValue: isCalibration
            ? Calibration.targetReps
            : (draft.reps > 0
                ? draft.reps
                : (slot.proposal.targetReps ?? reference?.reps ?? slot.planned.sets[setIndex].repRange.upperBound)))
        // Stepping to a first weight from zero is 30-odd taps. A calibration
        // set opens on the keypad instead.
        _showsKeypad = State(initialValue: isCalibration)
        _keypadText = State(initialValue: "")
        // A planned paused exercise opens with pause already on, because that
        // is what the plan prescribes; anywhere else it is off until asked for.
        _paused = State(initialValue: slot.planned.modifiers.pauseEnabled)
        _partialReps = State(initialValue: nil)
    }

    /// RIR is the third, optional tap, and by default only the last set of an
    /// exercise is asked (addendum 11R). Per-set entry is an Account setting.
    private var asksForRIR: Bool { isCalibration || setIndex == slot.sets.count - 1 }

    /// The sheet's height, fixed for as long as it is open.
    ///
    /// It deliberately does not react to the keypad or the partial-rep row.
    /// A detent that grows while the keyboard is up cannot be satisfied — the
    /// sheet stops resizing and taps land nowhere, which is exactly what
    /// happened to the `Partieel` chip. Anything that appears later scrolls
    /// instead.
    private var sheetHeight: CGFloat {
        var height: CGFloat = 412        // grabber, head, steppers, chips, pill, footnote
        if asksForRIR { height += 86 }
        if isCalibration { height += 56 } // the keypad it opens on
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

            HStack(spacing: SL.Space.s2) {
                SLStepper(
                    label: "Gewicht",
                    display: display.number(weight),
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
            .padding(.bottom, SL.Space.s4)

            if asksForRIR { rirRow.padding(.bottom, SL.Space.s4) }

            chips.padding(.bottom, SL.Space.s4)

            if partialReps != nil { partialRow.padding(.bottom, SL.Space.s4) }

            if showsKeypad { keypad.padding(.bottom, SL.Space.s3) }

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
            .padding(.top, 0)

            Text(asksForRIR
                 ? "Gewicht en reps zijn een volledige set. RIR mag leeg blijven."
                 : "Gewicht en reps zijn een volledige set.")
                .slMeta()
                .foregroundStyle(SL.Ink.secondary)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)
                .padding(.top, SL.Space.s3)
        }
        .padding(.horizontal, SL.Space.gutterSession)
        .padding(.top, SL.Space.s4)
        .padding(.bottom, 42)
        .frame(maxWidth: .infinity, alignment: .leading)
        }
        .scrollBounceBehavior(.basedOnSize)
        .background(SL.Surface.raised)
        .task {
            if isCalibration { keypadFocused = true }
        }
        .presentationDetents([.height(sheetHeight)])
        .presentationBackground(SL.Surface.raised)
        .presentationDragIndicator(.hidden)
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

    /// Four chips do not fit one 402pt row, and a horizontal scroller hid
    /// the fourth behind a gesture nobody would go looking for mid-set. Two
    /// rows of two: input on top, what happened to the set underneath, and
    /// everything reachable without scrolling.
    private var chips: some View {
        VStack(spacing: SL.Space.s2) {
            HStack(spacing: SL.Space.s2) {
                chip("Toetsenblok", isOn: showsKeypad) {
                    showsKeypad.toggle()
                    keypadText = weight > 0 ? display.number(weight) : ""
                    keypadFocused = showsKeypad
                }
                chip("Mislukt", isOn: failed) { failed.toggle() }
            }
            HStack(spacing: SL.Space.s2) {
                chip(pauseChipLabel, isOn: paused) { paused.toggle() }
                chip("Partieel", isOn: partialReps != nil) {
                    partialReps = partialReps == nil ? 1 : nil
                }
            }
        }
    }

    /// Digits plus at most one decimal separator.
    static func numericOnly(_ text: String) -> String {
        var seenSeparator = false
        return String(text.compactMap { character -> Character? in
            if character.isNumber { return character }
            if character == "," || character == "." {
                if seenSeparator { return nil }
                seenSeparator = true
                return ","
            }
            return nil
        })
    }

    private var pauseChipLabel: String {
        guard let seconds = slot.planned.modifiers.pauseSeconds, paused else { return "Pauze" }
        return "Pauze \(Int(seconds))s"
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

    private func chip(_ title: String, isOn: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .slBody()
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                .foregroundStyle(isOn ? SL.Ink.primary : SL.Ink.secondary)
                .padding(.horizontal, 18)
                .frame(maxWidth: .infinity)
                .frame(minHeight: SL.Metric.chipHeight)
                .background(
                    RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous)
                        .fill(isOn ? SL.Surface.raised2 : Color.clear)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous)
                        .strokeBorder(
                            isOn ? SL.Surface.selection : SL.Surface.hairline,
                            style: StrokeStyle(lineWidth: 1, dash: isOn ? [] : [4, 4])
                        )
                )
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
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
                    let filtered = Self.numericOnly(new)
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
