import SwiftUI

/// The five places the bar leads to — SETLINE Main's own five. The redesign
/// put `Loggen` here and reached Account from an avatar; on iOS Account stays
/// a tab and logging starts from Training.
enum SLTab: String, CaseIterable, Identifiable {
    case training, voeding, progressie, friends, fotos, account

    var id: String { rawValue }

    var label: String {
        switch self {
        case .training: return "Training"
        case .voeding: return "Nutrition"
        case .progressie: return "Progress"
        case .friends: return "Friends"
        case .fotos: return "Photos"
        case .account: return "Account"
        }
    }

    /// The redesign's own strokes — a calendar, a fork and knife, a rising
    /// line and a camera, each on a 22pt grid at 1.7 — and Main's outlined
    /// account circle, which the redesign has no glyph for.
    var artwork: String {
        switch self {
        case .training: return "TabTraining"
        case .voeding: return "TabVoeding"
        case .progressie: return "TabProgressie"
        case .friends: return "person.2"
        case .fotos: return "TabFotos"
        case .account: return "TabAccount"
        }
    }
}

/// The tab bar: inset 21 from the sides, 56 high, radius 22, on surface-1
/// inside the hairline. The active tab sits on a raised neutral pill that
/// slides to the tab chosen — a lime icon, its label in ink at 600 — so where
/// you are reads at a glance and not only by colour, and lime stays for
/// actions and gains.
///
/// A custom bar rather than the stock one: the inset floating shape is not
/// achievable with `TabView`'s own bar.
struct SLTabBar: View {
    @Binding var selection: SLTab
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Namespace private var pill

    /// The pill sits 4 in from each tab's edges; its corners follow the bar's.
    private static let pillInset: CGFloat = 4

    var body: some View {
        HStack(spacing: 0) {
            ForEach(SLTab.allCases) { tab in
                let isActive = selection == tab
                Button {
                    selection = tab
                } label: {
                    VStack(spacing: 3) {
                        // Deliberately unscaled, like the 11pt label beneath
                        // it: letting the bar follow Dynamic Type burst it open
                        // and struck the labels through at accessibility sizes.
                        Group {
                            // Friends has no drawn glyph; the system's two
                            // people, at the same optical size, stand in.
                            if tab == .friends {
                                Image(systemName: tab.artwork)
                                    .font(.system(size: 17, weight: .regular))
                            } else {
                                Image(tab.artwork)
                                    .renderingMode(.template)
                                    .resizable()
                            }
                        }
                            .frame(width: 22, height: 22)
                            .foregroundStyle(isActive ? SL.Signal.action : SL.Ink.secondary)
                            .accessibilityHidden(true)
                        Text(tab.label)
                            .font(.slFixed(SL.TypeSize.tab, isActive ? SL.Weight.semibold : SL.Weight.regular))
                            .lineLimit(1)
                    }
                    .foregroundStyle(isActive ? SL.Ink.primary : SL.Ink.secondary)
                    .frame(maxWidth: .infinity)
                    .frame(height: SL.Metric.tabItemHeight)
                    .background {
                        if isActive {
                            RoundedRectangle(cornerRadius: SL.Radius.xl - Self.pillInset - 1, style: .continuous)
                                // The line colour as a fill: one step above the bar, visible
                                // without a border of its own.
                                .fill(SL.Surface.hairline)
                                .padding(Self.pillInset)
                                .matchedGeometryEffect(id: "pill", in: pill)
                        }
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .slFocusRing(RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous))
                .accessibilityLabel(tab.label)
                .accessibilityAddTraits(isActive ? [.isSelected, .isButton] : .isButton)
            }
        }
        .animation(reduceMotion ? nil : .spring(response: 0.32, dampingFraction: 0.86), value: selection)
        .slBorderBox()
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
