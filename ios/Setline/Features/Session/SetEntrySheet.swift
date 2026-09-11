import SwiftUI
import SetlineCore

/// Tap 1 of 2 opens this, pre-filled from the previous session. Tap 2 is
/// `Log set`. Changing weight or reps is optional and costs extra taps; it is
/// never on the default path.
struct SetEntrySheet: View {
    let slot: SessionRunner.ExerciseSlot
    let setIndex: Int
    let onLog: (Decimal, Int, Int?, Bool) -> Void
    let onClose: () -> Void

    @State private var weight: Decimal
    @State private var reps: Int
    @State private var rir: Int?
    @State private var failed = false
    @State private var showsKeypad = false
    @State private var keypadText = ""
    @FocusState private var keypadFocused: Bool

    private let display = NumberDisplay.dutch

    init(
        slot: SessionRunner.ExerciseSlot,
        setIndex: Int,
        onLog: @escaping (Decimal, Int, Int?, Bool) -> Void,
        onClose: @escaping () -> Void
    ) {
        self.slot = slot
        self.setIndex = setIndex
        self.onLog = onLog
        self.onClose = onClose

        let draft = slot.sets[setIndex]
        let reference = slot.history.mostRecent?.sets.first { $0.index == setIndex }
        _weight = State(initialValue: draft.weightKg ?? reference?.weightKg ?? 0)
        _reps = State(initialValue: draft.reps > 0
            ? draft.reps
            : (slot.proposal.targetReps ?? reference?.reps ?? slot.planned.sets[setIndex].repRange.upperBound))
    }

    /// RIR is the third, optional tap, and by default only the last set of an
    /// exercise is asked (addendum 11R). Per-set entry is an Account setting.
    private var asksForRIR: Bool { setIndex == slot.sets.count - 1 }

    /// The sheet hugs its content. `.presentationSizing(.fitted)` over-expands
    /// for this layout, so the height is summed from what is actually shown:
    /// grabber and head, the two steppers, the chips, the pill and footnote,
    /// plus the 42pt bottom the artboard specifies.
    private var sheetHeight: CGFloat {
        var height: CGFloat = 360
        if asksForRIR { height += 86 }
        if showsKeypad { height += 56 }
        return height
    }

    private var increment: Decimal { slot.exercise.incrementKg }

    var body: some View {
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

            if showsKeypad { keypad.padding(.bottom, SL.Space.s3) }

            Button {
                onLog(weight, reps, rir, failed)
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
        .background(SL.Surface.raised)
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
        let last = setIndex == slot.sets.count - 1
        return last ? "Set \(setIndex + 1) · laatste set" : "Set \(setIndex + 1)"
    }

    private var referenceLabel: String? {
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

    private var chips: some View {
        HStack(spacing: SL.Space.s2) {
            chip("Toetsenblok", isOn: showsKeypad) {
                showsKeypad.toggle()
                keypadText = display.number(weight)
                keypadFocused = showsKeypad
            }
            chip("Mislukt", isOn: failed) { failed.toggle() }
            Spacer()
        }
    }

    private func chip(_ title: String, isOn: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .slBody()
                .foregroundStyle(isOn ? SL.Ink.primary : SL.Ink.secondary)
                .padding(.horizontal, 18)
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
                    if let parsed = Decimal(string: new.replacingOccurrences(of: ",", with: ".")) {
                        weight = parsed
                    }
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
