import SwiftUI

/// "Duration  − 45 min +": how long the workout took, in steps of five.
/// Used where the clock can't know — a workout written down afterwards — and
/// wherever a saved workout is corrected.
struct DurationRow: View {
    @Binding var minutes: Int
    /// Says where the number came from: "from the clock", "planned".
    var note: String?

    var body: some View {
        HStack(spacing: SL.Space.s3) {
            VStack(alignment: .leading, spacing: 2) {
                Text("Duration").slBody(SL.Weight.medium).foregroundStyle(SL.Ink.primary)
                if let note {
                    Text(note).slMeta().foregroundStyle(SL.Ink.secondary)
                }
            }
            Spacer(minLength: SL.Space.s2)
            HStack(spacing: 0) {
                step("minus", label: "Five minutes less") { minutes = max(5, minutes - 5) }
                Text("\(minutes) min")
                    .font(.sl(SL.TypeSize.body, SL.Weight.semibold))
                    .monospacedDigit()
                    .foregroundStyle(SL.Ink.primary)
                    .frame(minWidth: 64)
                    .contentTransition(.numericText(value: Double(minutes)))
                step("plus", label: "Five minutes more") { minutes = min(300, minutes + 5) }
            }
            .background(Capsule().fill(SL.Surface.raised2))
        }
        .padding(.horizontal, SL.Space.s4)
        .padding(.vertical, SL.Space.s2)
        .background(RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous).fill(SL.Surface.raised))
        .overlay(RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous).strokeBorder(SL.Surface.hairline, lineWidth: 1))
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Duration, \(minutes) minutes")
    }

    private func step(_ symbol: String, label: String, action: @escaping () -> Void) -> some View {
        Button {
            withAnimation(.snappy(duration: 0.15)) { action() }
            UISelectionFeedbackGenerator().selectionChanged()
        } label: {
            Image(systemName: symbol)
                .font(.system(size: 13, weight: .bold))
                .foregroundStyle(SL.Ink.primary)
                .frame(width: 44, height: SL.Space.hitMin)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}
