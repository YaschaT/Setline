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

    /// SF Symbols, per the handoff's mapping table. The HTML uses Material
    /// Symbols only because a browser has no SF Symbols.
    var symbol: String {
        switch self {
        case .training: return "figure.strengthtraining.traditional"
        case .voeding: return "fork.knife"
        case .progressie: return "chart.line.uptrend.xyaxis"
        case .fotos: return "camera"
        case .account: return "person.crop.circle"
        }
    }
}

/// Floating bar, inset 21 from left, right and bottom; height 56; radius 22.
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
                        Image(systemName: tab.symbol)
                            // Deliberately unscaled, like the 11pt label beside
                            // it. The handoff fixes this bar at 56 high with a
                            // 20pt icon; letting the icon follow Dynamic Type
                            // while the label stays put burst the bar open and
                            // struck the labels through at accessibility sizes.
                            .font(.system(size: 20, weight: SL.Weight.regular))
                            .symbolVariant(selection == tab ? .fill : .none)
                            .foregroundStyle(selection == tab ? SL.Signal.action : SL.Ink.tertiary)
                            .frame(height: 20)
                        Text(tab.label)
                            .font(.system(
                                size: SL.TypeSize.tab,
                                weight: selection == tab ? SL.Weight.semibold : SL.Weight.regular
                            ))
                            .foregroundStyle(selection == tab ? SL.Ink.primary : SL.Ink.tertiary)
                    }
                    .frame(maxWidth: .infinity)
                    .frame(minHeight: SL.Metric.tabBarHeight - 12)
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
        .padding(6)
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
