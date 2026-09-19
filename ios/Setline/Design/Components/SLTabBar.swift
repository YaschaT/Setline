import SwiftUI

enum SLTab: String, CaseIterable, Identifiable {
    case training, voeding, progressie, fotos, account

    var id: String { rawValue }

    var label: String {
        switch self {
        case .training: return "Training"
        case .voeding: return "Voeding"
        case .progressie: return "Progressie"
        case .fotos: return "Foto's"
        case .account: return "Account"
        }
    }

    /// The design's own artwork: the Material Symbols Rounded glyphs the
    /// artboards draw (`exercise`, `nutrition`, `trending_up`,
    /// `photo_camera`, `account_circle`; weight 400, unfilled), bundled as
    /// template vectors in the asset catalog. The font the HTML loads carries
    /// no fill axis, so the active tab is drawn outlined too — in lime.
    var artwork: String {
        switch self {
        case .training: return "TabTraining"
        case .voeding: return "TabVoeding"
        case .progressie: return "TabProgressie"
        case .fotos: return "TabFotos"
        case .account: return "TabAccount"
        }
    }
}

/// Floating bar, inset 21 from the sides and resting on the home band; radius
/// 22; 70 high as the artboards draw it, with 56-high items.
///
/// A custom bar rather than the stock one: the inset floating shape and the
/// lime active fill are not achievable with `TabView`'s own bar.
struct SLTabBar: View {
    @Binding var selection: SLTab

    var body: some View {
        HStack(spacing: 2) {
            ForEach(SLTab.allCases) { tab in
                Button { selection = tab } label: {
                    VStack(spacing: 5) {
                        // Deliberately unscaled, like the 11pt label beneath
                        // it: letting the bar follow Dynamic Type burst it open
                        // and struck the labels through at accessibility sizes.
                        Image(tab.artwork)
                            .renderingMode(.template)
                            .resizable()
                            .frame(width: 20, height: 20)
                            .foregroundStyle(selection == tab ? SL.Signal.action : SL.Ink.tertiary)
                            .accessibilityHidden(true)
                        Text(tab.label)
                            .font(.system(
                                size: SL.TypeSize.tab,
                                weight: selection == tab ? SL.Weight.semibold : SL.Weight.regular
                            ))
                            .foregroundStyle(selection == tab ? SL.Ink.primary : SL.Ink.tertiary)
                    }
                    .frame(maxWidth: .infinity)
                    .frame(minHeight: SL.Metric.tabItemHeight)
                    .background(
                        RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous)
                            .fill(selection == tab ? SL.Surface.raised2 : .clear)
                    )
                    .contentShape(Rectangle())
                    .slFocusRing(RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous))
                }
                .buttonStyle(.plain)
                .accessibilityLabel(tab.label)
                .accessibilityAddTraits(selection == tab ? [.isSelected, .isButton] : .isButton)
            }
        }
        // 6 of padding inside the 1pt border, as the HTML draws it.
        .padding(7)
        .frame(minHeight: SL.Metric.tabBarHeight)
        .background(
            RoundedRectangle(cornerRadius: SL.Radius.xl, style: .continuous)
                .fill(SL.Surface.raised)
        )
        .overlay(
            RoundedRectangle(cornerRadius: SL.Radius.xl, style: .continuous)
                .strokeBorder(SL.Surface.hairline, lineWidth: 1)
        )
        .padding(.horizontal, SL.Space.tabInset)
    }
}
