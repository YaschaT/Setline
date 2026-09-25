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
    /// Taking the set out of the session altogether. `nil` where that is not
    /// offered; the words beneath say which of the two this sheet can do.
    let onDelete: (() -> Void)?
    let onClose: () -> Void

    @State private var weight: Decimal
    @State private var reps: Int
    @State private var rir: Int?
    @State private var pausedReps: Int?
    @State private var partialReps: Int?
    @State private var height: CGFloat?

    init(
        exerciseName: String,
        setNumber: Int,
        increment: Decimal,
        display: NumberDisplay,
        original: LoggedSet,
        onApply: @escaping (LoggedSet) -> Void,
        onDelete: (() -> Void)? = nil,
        onClose: @escaping () -> Void
    ) {
        self.exerciseName = exerciseName
        self.setNumber = setNumber
        self.increment = increment
        self.display = display
        self.original = original
        self.onApply = onApply
        self.onDelete = onDelete
        self.onClose = onClose
        _weight = State(initialValue: original.weightKg ?? 0)
        _reps = State(initialValue: original.reps)
        _rir = State(initialValue: original.rirReported)
        // A stored set that was paused throughout carries no count, and opens
        // on every rep — the same reading the entry sheet gives it.
        _pausedReps = State(initialValue: original.pausedReps
            ?? (original.modifiers.pauseEnabled ? original.reps : nil))
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
                if let paused = pausedReps { pausedRow(paused).padding(.bottom, SL.Space.s4) }
                if partialReps != nil { partialRow.padding(.bottom, SL.Space.s4) }

                Button { onApply(corrected) } label: { Text("Klaar") }
                    .buttonStyle(SLPrimaryButtonStyle())
                    .disabled(!isLogged)

                if let onDelete {
                    // A set that was never performed is not a set to correct.
                    // It leaves the session, and the words under the button
                    // say that this one action reaches further than the other.
                    Button(action: onDelete) {
                        Text("Verwijder deze set")
                            .slBody(SL.Weight.medium)
                            .foregroundStyle(SL.Signal.loss)
                            .frame(maxWidth: .infinity)
                            .frame(minHeight: SL.Space.hitMin)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .padding(.top, SL.Space.s2)
                }

                Text(onDelete == nil
                     ? "Alleen deze set verandert."
                     : "Alleen deze set verandert. Verwijderen haalt hem uit de sessie.")
                    .slMeta()
                    .slLineHeight(SL.LineHeight.body, size: SL.TypeSize.meta)
                    .fixedSize(horizontal: false, vertical: true)
                    .foregroundStyle(SL.Ink.tertiary)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .multilineTextAlignment(.center)
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
    /// warm-up, what it stood in for — is carried over from the set as it was
    /// logged.
    private var corrected: LoggedSet {
        var set = original
        set.weightKg = weight
        set.reps = reps
        set.rirReported = rir
        let isPaused = (pausedReps ?? 0) > 0
        set.modifiers = SetModifiers(
            pauseEnabled: isPaused,
            pauseSeconds: isPaused ? (original.modifiers.pauseSeconds ?? 2) : nil,
            restrictedROM: original.modifiers.restrictedROM
        )
        set.pausedReps = LoggedSet.pausedRepsWithin(pausedReps, reps: reps)
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
            chip("Pauze-reps", isOn: pausedReps != nil) {
                pausedReps = pausedReps == nil ? max(1, reps) : nil
            }
            chip("Partieel", isOn: partialReps != nil) {
                partialReps = partialReps == nil ? 1 : nil
            }
        }
    }

    /// The same reading the entry sheet gives a set: paused reps are some of
    /// the reps performed, so the count stops at the rep number.
    private func pausedRow(_ count: Int) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline) {
                SLEyebrow(text: "Pauze-reps")
                Spacer()
                Text(count >= reps ? "elke rep gepauzeerd" : "van \(reps) reps")
                    .slMeta()
                    .slNumerals()
                    .foregroundStyle(SL.Ink.tertiary)
                    .lineLimit(1).minimumScaleFactor(0.8)
            }
            .padding(.bottom, SL.Space.s2)
            SLStepper(
                label: "Gepauzeerd",
                display: "\(min(count, max(1, reps)))",
                onDecrement: { pausedReps = max(1, min(count, reps) - 1) },
                onIncrement: { pausedReps = min(max(1, reps), count + 1) }
            )
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
