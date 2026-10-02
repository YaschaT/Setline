import SwiftUI

/// Redesign 1b · − value +, one tap per step.
///
/// A tile on surface-2 with its label centred above: two 44pt buttons and the
/// number between them at 34. A value the reader has moved off what was
/// proposed turns lime inside a lime edge ("aangepast"), so a correction is
/// visible before it is saved.
///
/// No keyboard and no modal on the default path; where the design gives the
/// number a destination of its own, tapping it goes there.
struct SLStepper: View {
    enum Level {
        /// The input card and the set sheet: the value at 34.
        case onRaised
        /// A supporting control inside a card: the value at 21.
        case onRaised2
    }

    let label: String
    let display: String
    var level: Level = .onRaised
    /// Set when no plate can produce the next increment:
    /// "gewicht · uit (geen schijven)".
    var disabledNote: String?
    /// The value was changed by hand and not saved yet.
    var isChanged = false
    /// Tapping the value itself, where the design gives it a destination —
    /// the weight opens a number field for a load off the step.
    var onTapValue: (() -> Void)?
    var valueHint: String?
    let onDecrement: () -> Void
    let onIncrement: () -> Void

    @Environment(\.dynamicTypeSize) private var typeSize

    private var valueSize: CGFloat { level == .onRaised ? SL.TypeSize.display : SL.TypeSize.title }
    private var ink: Color {
        if disabledNote != nil { return SL.Ink.tertiary }
        return isChanged ? SL.Signal.action : SL.Ink.primary
    }

    /// The number keeps every one of its characters at every text size: it
    /// shrinks a little before it would ever be cut.
    @ViewBuilder
    private func value(fills: Bool) -> some View {
        let text = Text(display)
            .font(.sl(valueSize, SL.Weight.semibold))
            .monospacedDigit()
            .slLineHeight(1, size: valueSize)
            .foregroundStyle(ink)
            .lineLimit(1)
            .minimumScaleFactor(0.6)
            .fixedSize(horizontal: false, vertical: fills)
            .frame(maxWidth: .infinity, alignment: fills ? .leading : .center)

        if let onTapValue {
            Button(action: onTapValue) {
                text
                    .frame(minHeight: SL.Space.hitMin)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        } else {
            text
        }
    }

    var body: some View {
        VStack(alignment: .center, spacing: 2) {
            Text((disabledNote.map { "\(label) · \($0)" } ?? label).lowercased())
                .slMeta()
                .foregroundStyle(SL.Ink.secondary)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                .frame(maxWidth: .infinity, alignment: typeSize.isAccessibilitySize ? .leading : .center)

            if typeSize.isAccessibilitySize {
                // At accessibility sizes the number gets the whole row and the
                // controls move to their own: squeezed between two buttons it
                // would be the one thing on screen that could not be read.
                value(fills: true)
                HStack(spacing: SL.Space.s2) {
                    control("−", expands: true, action: onDecrement)
                    control("+", expands: true, action: onIncrement)
                }
                .padding(.top, SL.Space.s1)
            } else {
                HStack(spacing: 0) {
                    control("−", action: onDecrement)
                    value(fills: false)
                    control("+", action: onIncrement)
                }
            }
        }
        .padding(.horizontal, SL.Space.s2)
        .padding(.top, SL.Space.s2)
        .padding(.bottom, 10)
        .frame(maxWidth: .infinity)
        .background(
            RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous)
                .fill(SL.Surface.raised2)
        )
        // Drawn inside, so the tile keeps its size when the edge appears.
        .overlay(
            RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous)
                .strokeBorder(isChanged ? SL.Signal.action : Color.clear, lineWidth: 1)
        )
        // One adjustable element: swipe up or down to step, and the value's
        // own destination as a named action.
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(label), \(display)\(isChanged ? ", aangepast" : "")")
        .accessibilityAdjustableAction { direction in
            switch direction {
            case .increment: onIncrement()
            case .decrement: onDecrement()
            @unknown default: break
            }
        }
        .accessibilityActions {
            if let onTapValue {
                Button(valueHint ?? "Waarde typen", action: onTapValue)
            }
        }
    }

    private func control(_ glyph: String, expands: Bool = false, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(glyph)
                .font(.sl(SL.TypeSize.title, SL.Weight.semibold))
                .foregroundStyle(disabledNote == nil ? SL.Ink.primary : SL.Ink.tertiary)
                .frame(minWidth: SL.Space.hitMin, maxWidth: expands ? .infinity : nil, minHeight: SL.Space.hitMin)
        }
        .buttonStyle(SLStepButtonStyle())
        .disabled(disabledNote != nil)
    }
}

/// A stepper's − and +: the hairline grey at rest, one step lighter while it
/// is held.
private struct SLStepButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        let shape = RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous)
        return configuration.label
            .background(shape.fill(configuration.isPressed ? SL.Surface.hairlineStrong : SL.Surface.hairline))
            .contentShape(shape)
            .slFocusRing(shape)
    }
}
