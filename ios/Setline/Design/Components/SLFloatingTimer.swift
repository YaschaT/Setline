import SwiftUI
import SetlineCore

/// The rest timer, per addendum 13R, in two states.
///
/// Expanded is the artboard's capsule and appears the moment a set is
/// written. It steps back to a compact bar after a few seconds so it stops
/// covering the rows it is counting down toward — an approved departure from
/// 13R, which draws only the expanded state.
///
/// Both states live inside the screen's bottom inset rather than floating
/// free over the scroll view. They keep the translucency and the cast shadow
/// that make them read as a layer above the session, but the content below
/// can always be scrolled clear of them, and neither can cover the primary
/// action.
struct SLFloatingTimer: View {
    let title: String
    let remaining: Int
    let total: Int
    let isExpanded: Bool
    let onAdjust: (Int) -> Void
    let onToggleExpanded: () -> Void
    let onSkip: () -> Void

    var body: some View {
        Group {
            if isExpanded { expanded } else { collapsed }
        }
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
                        HStack(spacing: 6) {
                            Image(systemName: "timer")
                                .font(.sl(16, SL.Weight.medium))
                                .foregroundStyle(SL.Ink.tertiary)
                            SLEyebrow(text: title, size: SL.TypeSize.micro)
                        }
                        clock(size: SL.TypeSize.display)
                            .padding(.top, 2)
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
                .padding(.bottom, 12)

            skipButton
        }
        .padding(.leading, SL.Space.s5)
        .padding(.trailing, SL.Space.s4)
        .padding(.vertical, SL.Space.s4)
    }

    // MARK: Collapsed — time, progress, Klaar. Nothing else.

    private var collapsed: some View {
        HStack(spacing: SL.Space.s4) {
            Button(action: onToggleExpanded) {
                HStack(spacing: SL.Space.s3) {
                    clock(size: SL.TypeSize.title)
                    progressTrack.frame(maxWidth: .infinity)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Timer uitklappen")

            Button(action: onSkip) {
                Text("Klaar")
                    .font(.sl(SL.TypeSize.body, SL.Weight.semibold))
                    .foregroundStyle(SL.Ink.primary)
                    .padding(.horizontal, SL.Space.s3)
                    .frame(minHeight: SL.Space.hitMin)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
        .padding(.leading, SL.Space.s5)
        .padding(.trailing, SL.Space.s2)
        .padding(.vertical, SL.Space.s2)
    }

    // MARK: Pieces

    private func clock(size: CGFloat) -> some View {
        Text(RestTimerState.clockLabel(remaining))
            .font(.sl(size, SL.Weight.semibold))
            .slNumerals()
            .foregroundStyle(SL.Ink.primary)
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

    /// Outlined, not lime.
    ///
    /// 13R fills this pill because the timer floats alone over the session.
    /// Sitting in the bottom inset it sits beside the screen's commit action,
    /// and two lime pills stacked breaks the one-action ceiling. The system
    /// says what to do when actions collide: the lesser one becomes an
    /// outlined button. That also does the work of item 2 — with a single
    /// lime block below it, the timer reads as its own surface again.
    private var skipButton: some View {
        Button(action: onSkip) {
            Text("Klaar")
                .font(.sl(SL.TypeSize.body, SL.Weight.semibold))
                .foregroundStyle(SL.Ink.primary)
                .frame(maxWidth: .infinity)
                .frame(minHeight: SL.Space.hitMin)
                .background(
                    RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous)
                        .fill(SL.Surface.raised2)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous)
                        .strokeBorder(SL.Surface.selection, lineWidth: 1)
                )
        }
        .buttonStyle(.plain)
    }

    private func adjustButton(_ label: String, by seconds: Int) -> some View {
        Button { onAdjust(seconds) } label: {
            Text(label)
                .font(.sl(SL.TypeSize.body, SL.Weight.semibold))
                .slNumerals()
                .foregroundStyle(SL.Ink.primary)
                .frame(minWidth: 56, minHeight: 56)
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
        .accessibilityLabel(seconds > 0 ? "Vijftien seconden langer" : "Vijftien seconden korter")
    }
}
