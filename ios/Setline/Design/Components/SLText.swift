import SwiftUI

/// The eyebrow above a card, a section or a value.
///
/// 13pt / weight 500 / `text3` is the artboards' default (`VANDAAG · MAANDAG
/// 7 SEP`, `VOLUME`, `BOVENGRENS BEVESTIGD`). 12pt is the narrower variant
/// used for column headers and field labels.
///
/// No tracking: none of the Phase 1 artboards letterspaces these. Only the
/// cold-open wordmark (0.18em) and 02a's kicker (0.14em) do, and both are
/// later phases.
struct SLEyebrow: View {
    let text: String
    var size: CGFloat = SL.TypeSize.meta
    var color: Color = SL.Ink.tertiary

    var body: some View {
        Text(text.uppercased())
            .font(.sl(size, SL.Weight.medium))
            .foregroundStyle(color)
    }
}

extension Text {
    func slDisplay(_ size: CGFloat = SL.TypeSize.display) -> Text {
        font(.sl(size, SL.Weight.semibold))
    }

    func slTitle() -> Text {
        font(.sl(SL.TypeSize.title, SL.Weight.semibold))
    }

    func slLead(_ weight: Font.Weight = SL.Weight.semibold) -> Text {
        font(.sl(SL.TypeSize.lead, weight))
    }

    func slBody(_ weight: Font.Weight = SL.Weight.regular) -> Text {
        font(.sl(SL.TypeSize.body, weight))
    }

    func slMeta(_ weight: Font.Weight = SL.Weight.regular) -> Text {
        font(.sl(SL.TypeSize.meta, weight))
    }
}

/// A 1px hairline. The system has exactly two border weights.
struct SLHairline: View {
    var strong: Bool = false
    var body: some View {
        Rectangle()
            .fill(strong ? SL.Surface.hairlineStrong : SL.Surface.hairline)
            .frame(height: 1)
    }
}

extension View {
    /// Today's card and the proposal card keep the `raised` (or `raised2`)
    /// fill the artboard gives them and take the stronger hairline as their
    /// border — `slCard(loud:)` raises the fill instead, which is a different
    /// treatment.
    func slCardStrong(radius: CGFloat = SL.Radius.xl, fill: Color = SL.Surface.raised) -> some View {
        background(
            RoundedRectangle(cornerRadius: radius, style: .continuous).fill(fill)
        )
        .overlay(
            RoundedRectangle(cornerRadius: radius, style: .continuous)
                .strokeBorder(SL.Surface.hairlineStrong, lineWidth: 1)
        )
    }

    /// Clears the 44pt floor without growing the visible element — the
    /// system's stated way of handling small text controls.
    func slHitTarget() -> some View {
        frame(minWidth: SL.Space.hitMin, minHeight: SL.Space.hitMin)
            .contentShape(Rectangle())
    }
}
