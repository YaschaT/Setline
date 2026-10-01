import SwiftUI
import SetlineCore

/// The rest timer: addendum 13R expanded, the live artboard 11–13 compact.
///
/// It opens expanded the moment a set is written — label, time, ±15, the
/// progress track and a lime `Overslaan` — and steps back to 11–13's single
/// row after a few seconds: `RUST`, the time, ±15 and a lime `Klaar`. Either
/// way it takes the commit pill's place at the foot of the session, as both
/// artboards draw it, so its button is the screen's one action while the rest
/// runs. The only translucent surface in the app.
struct SLFloatingTimer: View {
    @Environment(\.dynamicTypeSize) private var typeSize

    let title: String
    let remaining: Int
    let total: Int
    let isExpanded: Bool
    let onAdjust: (Int) -> Void
    let onToggleExpanded: () -> Void
    let onSkip: () -> Void

    var body: some View {
        Group {
            // The compact row has no room for three 56pt buttons beside a
            // large clock at accessibility sizes, so it stays expanded there.
            if isExpanded || typeSize.isAccessibilitySize { expanded } else { compact }
        }
        .slBorderBox()
        .background(
            RoundedRectangle(cornerRadius: SL.Radius.xl, style: .continuous)
                .fill(SL.Surface.floatFill)
                .background(
                    RoundedRectangle(cornerRadius: SL.Radius.xl, style: .continuous)
                        .fill(.ultraThinMaterial)
                )
        )
        .overlay(
            RoundedRectangle(cornerRadius: SL.Radius.xl, style: .continuous)
                .strokeBorder(SL.Surface.hairlineStrong, lineWidth: 1)
        )
        .shadow(color: SL.Elevation.floatColor, radius: SL.Elevation.floatRadius, y: SL.Elevation.floatY)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Rust, \(remaining / 60) minuten \(remaining % 60) seconden resterend")
    }

    // MARK: Expanded — artboard 13R

    private var expanded: some View {
        VStack(spacing: 0) {
            HStack(alignment: .center, spacing: 10) {
                Button(action: onToggleExpanded) {
                    VStack(alignment: .leading, spacing: 0) {
                        label(title)
                        clock
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Timer inklappen")

                adjustButton("−15", by: -15)
                adjustButton("+15", by: 15)
            }

            progressTrack
                .padding(.top, 14)
                .padding(.bottom, SL.Space.s3)

            Button(action: onSkip) {
                Text("Overslaan")
                    .font(.sl(SL.TypeSize.body, SL.Weight.semibold))
                    .foregroundStyle(SL.Signal.onAction)
                    .frame(maxWidth: .infinity)
                    .frame(minHeight: SL.Space.hitMin)
                    .background(
                        RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous)
                            .fill(SL.Signal.action)
                    )
                    .contentShape(RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous))
            }
            .buttonStyle(.plain)
            .slFocusRing(RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous))
        }
        .padding(.leading, SL.Space.s5)
        .padding(.trailing, SL.Space.s4)
        .padding(.vertical, SL.Space.s4)
    }

    // MARK: Compact — artboard 11–13

    private var compact: some View {
        HStack(alignment: .center, spacing: 10) {
            Button(action: onToggleExpanded) {
                VStack(alignment: .leading, spacing: 0) {
                    label("Rust")
                    clock
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Timer uitklappen")

            adjustButton("−15", by: -15)
            adjustButton("+15", by: 15)

            Button(action: onSkip) {
                Text("Klaar")
                    .font(.sl(SL.TypeSize.meta, SL.Weight.semibold))
                    .foregroundStyle(SL.Signal.onAction)
                    .frame(width: 56, height: 56)
                    .background(
                        RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous)
                            .fill(SL.Signal.action)
                    )
                    .contentShape(RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous))
            }
            .buttonStyle(.plain)
            .slFocusRing(RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous))
        }
        // 11–13: a 76-high row inside 6 of padding and the border — 90 across.
        .frame(minHeight: 76)
        .padding(.leading, SL.Space.s5)
        .padding([.trailing, .vertical], 6)
    }

    // MARK: Pieces

    /// "RUST · PRIMAIRE LIFT 3:00" — 12/500 `text3` after the 16pt timer.
    private func label(_ text: String) -> some View {
        HStack(spacing: 6) {
            SLGlyph(name: .timer, size: 16)
            // At accessibility sizes it wraps rather than ending in "PRIMAI…".
            Text(text.uppercased())
                .font(.sl(SL.TypeSize.micro, SL.Weight.medium))
                .lineLimit(typeSize.isAccessibilitySize ? nil : 1)
                .minimumScaleFactor(0.8)
                .fixedSize(horizontal: false, vertical: typeSize.isAccessibilitySize)
        }
        .foregroundStyle(SL.Ink.tertiary)
    }

    private var clock: some View {
        Text(RestTimerState.clockLabel(remaining))
            .font(.sl(SL.TypeSize.display, SL.Weight.semibold))
            .slNumerals()
            .foregroundStyle(SL.Ink.primary)
            .slLineHeight(SL.LineHeight.display, size: SL.TypeSize.display)
            .accessibilityHidden(true)
    }

    /// A 2pt track, no sweep animation — under Reduce Motion it simply
    /// updates once a second, which is what it does anyway.
    private var progressTrack: some View {
        GeometryReader { proxy in
            ZStack(alignment: .leading) {
                Capsule().fill(SL.Surface.hairlineStrong)
                Capsule()
                    .fill(SL.Ink.secondary)
                    .frame(width: proxy.size.width * fraction)
            }
        }
        .frame(height: 2)
        .accessibilityHidden(true)
    }

    private var fraction: Double {
        guard total > 0 else { return 0 }
        return min(1, max(0, Double(remaining) / Double(total)))
    }

    private func adjustButton(_ label: String, by seconds: Int) -> some View {
        Button { onAdjust(seconds) } label: {
            Text(label)
                .font(.sl(SL.TypeSize.body, SL.Weight.semibold))
                .slNumerals()
                .foregroundStyle(SL.Ink.primary)
                .frame(width: 56, height: 56)
                // 13R: 56 inside the .16 edge, 58 across.
                .slBorderBox()
                .background(
                    RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous)
                        .fill(SL.Surface.raised)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous)
                        .strokeBorder(SL.Surface.hairlineStrong, lineWidth: 1)
                )
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .slFocusRing(RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous))
        .accessibilityLabel(seconds > 0 ? "Vijftien seconden langer" : "Vijftien seconden korter")
    }
}
