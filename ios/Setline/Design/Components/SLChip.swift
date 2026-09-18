import SwiftUI

/// One chip, in the sizes and states the handoff draws.
///
/// Always a rounded rectangle — never a capsule. Selected is a raised2 fill
/// with a stronger edge; an unselected choice keeps a solid .16 edge on the
/// raised surface (31a, 31c); an option that is simply not on — a plate this
/// gym does not have — is dashed and quieter (06, and the component sheet).
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
        /// Off, rather than merely unchosen: dashed edge, no fill.
        case off
    }

    let title: String
    var size: Size = .regular
    var look: Look = .unselected
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.sl(SL.TypeSize.body, look == .selected ? SL.Weight.semibold : SL.Weight.medium))
                .slNumerals()
                .foregroundStyle(look == .selected ? SL.Ink.primary : look == .off ? SL.Ink.tertiary : SL.Ink.secondary)
                .padding(.horizontal, size.padding)
                .frame(minHeight: size.height)
                .background(
                    RoundedRectangle(cornerRadius: size.radius, style: .continuous)
                        .fill(look == .selected ? SL.Surface.raised2 : look == .off ? .clear : SL.Surface.raised)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: size.radius, style: .continuous)
                        .strokeBorder(
                            // The component sheet's selected chip has a .16
                            // edge; 31a's larger choice chips take .28.
                            look == .selected && size == .large ? SL.Surface.selection : SL.Surface.hairlineStrong,
                            style: StrokeStyle(lineWidth: 1, dash: look == .off ? [4, 4] : [])
                        )
                )
                .contentShape(RoundedRectangle(cornerRadius: size.radius, style: .continuous))
        }
        .buttonStyle(.plain)
        .slFocusRing(RoundedRectangle(cornerRadius: size.radius, style: .continuous))
        .accessibilityAddTraits(look == .selected ? [.isSelected, .isButton] : .isButton)
    }
}
