import SwiftUI

/// One chip, in the sizes and states the handoff draws.
///
/// Always a rounded rectangle — never a capsule. Selected is a raised2 fill
/// with a stronger edge; an unselected choice keeps a solid .16 edge on the
/// raised surface (31a); 31c's self-check draws the same chip at regular
/// weight, and its "Geen daarvan" recedes onto the card's own fill; an option
/// that is simply not on — a plate this gym does not have — is dashed and
/// quieter (06, and the component sheet).
struct SLChip: View {
    enum Size {
        /// 44 high, radius 12 — the component sheet and artboards 20, 31c.
        case regular
        /// 48 high, radius 16 — the region choices on 31a.
        case large

        var height: CGFloat { self == .regular ? SL.Metric.chipHeight : 48 }
        var radius: CGFloat { self == .regular ? SL.Radius.md : SL.Radius.lg }
        var padding: CGFloat { self == .regular ? SL.Space.s4 : 18 }
    }

    enum Look {
        case selected
        /// A choice that is available and not taken: solid edge, raised fill.
        case unselected
        /// 31c's signals: the unselected chip at regular weight — a tick, not
        /// a pick.
        case check
        /// 31c's "Geen daarvan": raised2 like the card it sits on, with the
        /// faint edge and tertiary ink.
        case quiet
        /// Off, rather than merely unchosen: dashed edge, no fill.
        case off

        var weight: Font.Weight {
            switch self {
            case .selected: return SL.Weight.semibold
            case .unselected, .off: return SL.Weight.medium
            case .check, .quiet: return SL.Weight.regular
            }
        }

        var ink: Color {
            switch self {
            case .selected: return SL.Ink.primary
            case .unselected, .check: return SL.Ink.secondary
            case .quiet, .off: return SL.Ink.tertiary
            }
        }

        var fill: Color {
            switch self {
            case .selected, .quiet: return SL.Surface.raised2
            case .unselected, .check: return SL.Surface.raised
            case .off: return .clear
            }
        }
    }

    let title: String
    var size: Size = .regular
    var look: Look = .unselected
    /// An artboard's own side padding where it differs from the size's —
    /// 06's plate chips use 18.
    var horizontalPadding: CGFloat? = nil
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.sl(SL.TypeSize.body, look.weight))
                .slNumerals()
                .foregroundStyle(look.ink)
                .padding(.horizontal, horizontalPadding ?? size.padding)
                .frame(minHeight: size.height)
                .background(
                    RoundedRectangle(cornerRadius: size.radius, style: .continuous)
                        .fill(look.fill)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: size.radius, style: .continuous)
                        .strokeBorder(edge, style: StrokeStyle(lineWidth: 1, dash: look == .off ? [4, 4] : []))
                )
                .contentShape(RoundedRectangle(cornerRadius: size.radius, style: .continuous))
        }
        .buttonStyle(.plain)
        .slFocusRing(RoundedRectangle(cornerRadius: size.radius, style: .continuous))
        .accessibilityAddTraits(look == .selected ? [.isSelected, .isButton] : .isButton)
    }

    /// The component sheet's selected chip has a .16 edge; 31a's larger
    /// choice chips take .28, and 31c's quiet chip the faint .08.
    private var edge: Color {
        switch look {
        case .selected: return size == .large ? SL.Surface.selection : SL.Surface.hairlineStrong
        case .quiet: return SL.Surface.hairline
        case .unselected, .check, .off: return SL.Surface.hairlineStrong
        }
    }
}
