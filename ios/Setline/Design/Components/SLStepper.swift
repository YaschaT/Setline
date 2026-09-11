import SwiftUI

/// − value + with a 44×44 minimum per control and the label above.
///
/// The tile nests tonally inside whatever surface it sits on, which is why
/// the two Phase 1 uses are inverted: on the sheet (`raised`) the tile is
/// `raised2` with `raised` buttons; inside the proposal card (`raised2`) the
/// tile is `raised` with `raised2` buttons.
struct SLStepper: View {
    enum Level {
        /// Set-entry sheet (11R): tile radius 16, value at display size.
        case onRaised
        /// Proposal card (29): tile radius 12, value at title size.
        case onRaised2
    }

    let label: String
    let display: String
    var level: Level = .onRaised
    /// Set when no plate can produce the next increment:
    /// "GEWICHT · UIT (geen schijven)".
    var disabledNote: String?
    let onDecrement: () -> Void
    let onIncrement: () -> Void

    private var tileRadius: CGFloat { level == .onRaised ? SL.Radius.lg : SL.Radius.md }
    private var tileFill: Color { level == .onRaised ? SL.Surface.raised2 : SL.Surface.raised }
    private var buttonRadius: CGFloat { level == .onRaised ? SL.Radius.md : SL.Radius.sm }
    private var buttonFill: Color { level == .onRaised ? SL.Surface.raised : SL.Surface.raised2 }
    private var valueSize: CGFloat { level == .onRaised ? SL.TypeSize.display : SL.TypeSize.title }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            SLEyebrow(
                text: disabledNote.map { "\(label) · \($0)" } ?? label,
                size: SL.TypeSize.micro
            )

            HStack(spacing: 0) {
                control("−", action: onDecrement)
                Spacer(minLength: 0)
                Text(display)
                    .font(.sl(valueSize, SL.Weight.semibold))
                    .slNumerals()
                    .foregroundStyle(disabledNote == nil ? SL.Ink.primary : SL.Ink.tertiary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                Spacer(minLength: 0)
                control("+", action: onIncrement)
            }
            .padding(.top, 6)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity)
        .background(
            RoundedRectangle(cornerRadius: tileRadius, style: .continuous).fill(tileFill)
        )
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(label), \(display)")
        .accessibilityAdjustableAction { direction in
            switch direction {
            case .increment: onIncrement()
            case .decrement: onDecrement()
            @unknown default: break
            }
        }
    }

    private func control(_ glyph: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(glyph)
                .font(.sl(SL.TypeSize.title, SL.Weight.semibold))
                .foregroundStyle(disabledNote == nil ? SL.Ink.primary : SL.Ink.tertiary)
                .frame(minWidth: SL.Space.hitMin, minHeight: SL.Space.hitMin)
                .background(
                    RoundedRectangle(cornerRadius: buttonRadius, style: .continuous).fill(buttonFill)
                )
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(disabledNote != nil)
        .accessibilityHidden(true)
    }
}
