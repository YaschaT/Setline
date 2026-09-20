import SwiftUI
import SetlineCore

/// One logged set, corrected after the fact.
///
/// The vocabulary is the set sheet's (11R/12R) — two steppers, RIR as optional
/// chips, pause and partials as chips — because correcting a set is the same
/// decision as logging it, made later. What it is not is a second place to
/// log: the set keeps its exercise, its place and its origin, and a correction
/// can never empty it. Weight and reps therefore have a floor.
struct SetCorrectionSheet: View {
    @Environment(\.dynamicTypeSize) private var typeSize

    let exerciseName: String
    let setNumber: Int
    let increment: Decimal
    let display: NumberDisplay
    let original: LoggedSet
    let onApply: (LoggedSet) -> Void
    let onClose: () -> Void

    @State private var weight: Decimal
    @State private var reps: Int
    @State private var rir: Int?
    @State private var paused: Bool
    @State private var partialReps: Int?
    @State private var height: CGFloat?

    init(
        exerciseName: String,
        setNumber: Int,
        increment: Decimal,
        display: NumberDisplay,
        original: LoggedSet,
        onApply: @escaping (LoggedSet) -> Void,
        onClose: @escaping () -> Void
    ) {
        self.exerciseName = exerciseName
        self.setNumber = setNumber
        self.increment = increment
        self.display = display
        self.original = original
        self.onApply = onApply
        self.onClose = onClose
        _weight = State(initialValue: original.weightKg ?? 0)
        _reps = State(initialValue: original.reps)
        _rir = State(initialValue: original.rirReported)
        _paused = State(initialValue: original.modifiers.pauseEnabled)
        _partialReps = State(initialValue: original.partialReps)
    }

    private var isAccessibilityLayout: Bool { typeSize.isAccessibilitySize }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                grabber

                HStack(alignment: .firstTextBaseline) {
                    SLEyebrow(text: "Set \(setNumber)")
                    Spacer(minLength: SL.Space.s3)
                    Text(exerciseName)
                        .slMeta()
                        .foregroundStyle(SL.Ink.secondary)
                        .lineLimit(1)
                        .truncationMode(.tail)
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

                rirRow.padding(.bottom, SL.Space.s4)
                tools.padding(.bottom, SL.Space.s4)
                if partialReps != nil { partialRow.padding(.bottom, SL.Space.s4) }

                Button { onApply(corrected) } label: { Text("Klaar") }
                    .buttonStyle(SLPrimaryButtonStyle())
                    .disabled(!isLogged)

                Text("Alleen deze set verandert.")
                    .slMeta()
                    .foregroundStyle(SL.Ink.tertiary)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding(.top, SL.Space.s3)
            }
            .padding(.horizontal, SL.Space.gutterSession)
            .padding(.top, SL.Space.s4)
            .padding(.bottom, SL.Space.sessionBlockBottom)
            .frame(maxWidth: .infinity, alignment: .leading)
            .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { measured in
                if height == nil { height = measured }
            }
        }
        .scrollBounceBehavior(.basedOnSize)
        .background(SL.Surface.raised)
        .presentationDetents(isAccessibilityLayout ? [.large] : [.height(height ?? 420)])
        .presentationDragIndicator(.hidden)
        .presentationBackground(SL.Surface.raised)
        .slRespondsToTextSize()
    }

    /// The set as corrected. Everything the sheet does not ask about — origin,
    /// warm-up, what it stood in for, a legacy paused-rep count — is carried
    /// over from the set as it was logged.
    private var corrected: LoggedSet {
        var set = original
        set.weightKg = weight
        set.reps = reps
        set.rirReported = rir
        set.modifiers = SetModifiers(
            pauseEnabled: paused,
            pauseSeconds: paused ? (original.modifiers.pauseSeconds ?? 2) : nil,
            restrictedROM: original.modifiers.restrictedROM
        )
        set.partialReps = (partialReps ?? 0) > 0 ? partialReps : nil
        return set
    }

    private var isLogged: Bool { weight > 0 && reps > 0 }

    private var grabber: some View {
        RoundedRectangle(cornerRadius: 3, style: .continuous)
            .fill(SL.Surface.hairlineStrong)
            .frame(width: 36, height: 5)
            .frame(maxWidth: .infinity)
            .padding(.bottom, SL.Space.s4)
            .accessibilityHidden(true)
    }

    @ViewBuilder
    private var steppers: some View {
        SLStepper(
            label: "Gewicht",
            display: display.number(weight),
            onDecrement: { weight = max(increment, weight - increment) },
            onIncrement: { weight += increment }
        )
        SLStepper(
            label: "Reps",
            display: "\(reps)",
            onDecrement: { reps = max(1, reps - 1) },
            onIncrement: { reps += 1 }
        )
    }

    private var rirRow: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline) {
                SLEyebrow(text: "Reps in reserve")
                Spacer()
                Text(rir == nil ? "niet gelogd" : "tik opnieuw om te wissen")
                    .slMeta()
                    .foregroundStyle(SL.Ink.tertiary)
                    .lineLimit(1).minimumScaleFactor(0.8)
            }
            .padding(.bottom, SL.Space.s2)
            HStack(spacing: 6) {
                ForEach(0..<5) { value in
                    Button { rir = (rir == value) ? nil : value } label: {
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
                                    .strokeBorder(rir == value ? SL.Surface.selection : .clear, lineWidth: 1)
                            )
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(value == 4 ? "RIR vier of meer" : "RIR \(value)")
                    .accessibilityAddTraits(rir == value ? [.isSelected, .isButton] : .isButton)
                }
            }
        }
    }

    private var tools: some View {
        HStack(spacing: 6) {
            chip("Pauze-reps", isOn: paused) { paused.toggle() }
            chip("Partieel", isOn: partialReps != nil) {
                partialReps = partialReps == nil ? 1 : nil
            }
        }
    }

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
                .font(.sl(SL.TypeSize.meta, SL.Weight.medium))
                .foregroundStyle(isOn ? SL.Ink.primary : SL.Ink.secondary)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
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
        .accessibilityAddTraits(isOn ? [.isSelected, .isButton] : .isButton)
    }
}
