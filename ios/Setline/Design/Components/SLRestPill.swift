import SwiftUI
import SetlineCore

/// Redesign 1b · the rest timer.
///
/// One row above the input card: `RUST`, the time left, a thin track, `+30s`
/// and skip. It starts by itself when a set is saved and never takes the
/// place of the next set's controls — resting and getting ready happen at the
/// same time. Tapping the row opens the larger version with `−30s`, `+30s`,
/// the prescribed rest and skip; adjusting lengthens or shortens the running
/// rest and never restarts it.
///
/// Neutral, because rest is a status and not an action: the time in ink, the
/// controls in grey, and mint only on the thin track that empties — the one
/// cue that says "recovery" without the whole row shouting it. (The redesign
/// drew every part of it mint, which read as an alarm; Main drew it neutral.)
/// The only translucent surface in the app.
struct SLRestPill: View {
    @Environment(\.dynamicTypeSize) private var typeSize

    /// "Rust · primaire lift 3:00" — spoken, not drawn.
    let title: String
    let remaining: Int
    let total: Int
    /// The rest the exercise's role prescribes, which `vast` returns to.
    let planned: Int
    let isExpanded: Bool
    let onAdjust: (Int) -> Void
    let onReset: () -> Void
    let onToggleExpanded: () -> Void
    /// Skips a running rest, and clears away one that has run out.
    let onSkip: () -> Void

    private var isDone: Bool { remaining <= 0 }
    private var step: Int { Int(SL.Metric.restAdjustStep) }

    var body: some View {
        Group {
            if isExpanded { expanded } else { compact }
        }
        .slBorderBox()
        .background(
            RoundedRectangle(cornerRadius: SL.Radius.xl, style: .continuous)
                .fill(isDone ? AnyShapeStyle(SL.Surface.raised) : AnyShapeStyle(SL.Surface.floatFill))
                .background(
                    RoundedRectangle(cornerRadius: SL.Radius.xl, style: .continuous)
                        .fill(.ultraThinMaterial)
                        .opacity(isDone ? 0 : 1)
                )
        )
        .overlay(
            RoundedRectangle(cornerRadius: SL.Radius.xl, style: .continuous)
                .strokeBorder(edge, lineWidth: 1)
        )
        .accessibilityElement(children: .contain)
    }

    private var edge: Color {
        SL.Surface.hairlineStrong
    }

    private var spoken: String {
        isDone
            ? "Rust afgelopen"
            : "\(title), nog \(remaining / 60) minuten \(remaining % 60) seconden"
    }

    // MARK: - One row

    private var compact: some View {
        let layout = typeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: SL.Space.s2))
            : AnyLayout(HStackLayout(alignment: .center, spacing: 10))
        return layout {
            Button(action: onToggleExpanded) {
                HStack(alignment: .center, spacing: 10) {
                    SLOverline(text: isDone ? "Rust afgelopen" : "Rust", color: isDone ? SL.Ink.primary : SL.Ink.secondary)
                        .lineLimit(1)
                        .fixedSize()
                    if !isDone {
                        Text(clock)
                            .slTitle()
                            .slNumerals()
                            .foregroundStyle(SL.Ink.primary)
                            .lineLimit(1)
                            .fixedSize()
                            .frame(minWidth: 62, alignment: .leading)
                    }
                    track.frame(minWidth: 24)
                }
                .frame(minHeight: SL.Space.hitMin)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(spoken)
            .accessibilityHint("Dubbeltik om de rust bij te stellen")

            HStack(spacing: 0) {
                addButton
                skipButton(width: nil)
            }
        }
        .padding(.vertical, 10)
        .padding(.leading, SL.Space.s3)
        .padding(.trailing, SL.Space.s1)
    }

    private var addButton: some View {
        Button { onAdjust(step) } label: {
            Text("+\(step)s")
                .slBody(SL.Weight.semibold)
                .slNumerals()
                .foregroundStyle(SL.Ink.primary)
                .padding(.horizontal, SL.Space.s3)
                .frame(minWidth: 52, minHeight: SL.Space.hitMin)
                .slBorderBox()
                .overlay(Capsule().strokeBorder(SL.Surface.hairlineStrong, lineWidth: 1))
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .slFocusRing(Capsule())
        .accessibilityLabel("Rust \(step) seconden langer")
    }

    private func skipButton(width: CGFloat?) -> some View {
        Button(action: onSkip) {
            SLGlyph(name: isDone ? .close : .skip, size: isDone ? 16 : 18)
                .foregroundStyle(SL.Ink.secondary)
                .frame(width: width, height: width)
                .frame(minWidth: SL.Space.hitMin, minHeight: SL.Space.hitMin)
                .background(
                    RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous)
                        .fill(width == nil ? Color.clear : Color.white.opacity(0.06))
                )
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .slFocusRing(RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous))
        .accessibilityLabel(isDone ? "Timer sluiten" : "Rust overslaan")
    }

    // MARK: - Opened

    private var expanded: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button(action: onToggleExpanded) {
                HStack(alignment: .center, spacing: 10) {
                    Text(isDone ? "0:00" : clock)
                        .font(.sl(SL.TypeSize.display, SL.Weight.semibold))
                        .slNumerals()
                        .slLineHeight(1, size: SL.TypeSize.display)
                        .foregroundStyle(SL.Ink.primary)
                        .lineLimit(1)
                        .fixedSize()
                    track
                }
                .frame(minHeight: SL.Space.hitMin)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(spoken)
            .accessibilityHint("Dubbeltik om de bediening te sluiten")

            SLWeightedRow(spacing: 6) {
                control("−\(step)s", label: "Rust \(step) seconden korter", disabled: isDone) { onAdjust(-step) }
                control("+\(step)s", label: "Rust \(step) seconden langer") { onAdjust(step) }
                Button(action: onReset) {
                    Text("\(Self.clockLabel(planned)) vast")
                        .slBody()
                        .slNumerals()
                        .foregroundStyle(SL.Ink.primary.opacity(0.7))
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                        .frame(maxWidth: .infinity)
                        .frame(minHeight: 48)
                        .slBorderBox()
                        .overlay(
                            RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous)
                                .strokeBorder(SL.Surface.hairlineStrong, lineWidth: 1)
                        )
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .slFocusRing(RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous))
                .slWeight(1.4)
                .accessibilityLabel("Rust terugzetten naar \(planned / 60) minuten \(planned % 60) seconden")

                skipButton(width: 48).slWeight(0)
            }
            .padding(.top, SL.Space.s3)

            Text("Bijstellen verlengt de lopende timer · de sessie loopt door")
                .font(.sl(SL.TypeSize.micro, SL.Weight.regular))
                .fixedSize(horizontal: false, vertical: true)
                .foregroundStyle(SL.Ink.secondary)
                .padding(.top, 10)
        }
        .padding(14)
    }

    private func control(_ text: String, label: String, disabled: Bool = false, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(text)
                .slBody(SL.Weight.semibold)
                .slNumerals()
                .foregroundStyle(SL.Ink.primary)
                .lineLimit(1)
                .frame(maxWidth: .infinity)
                .frame(minHeight: 48)
                .slBorderBox()
                .overlay(
                    RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous)
                        .strokeBorder(SL.Surface.hairlineStrong, lineWidth: 1)
                )
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .slFocusRing(RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous))
        .disabled(disabled)
        .opacity(disabled ? 0.4 : 1)
        .accessibilityLabel(label)
    }

    // MARK: - Pieces

    /// "2:28" — minutes without a leading zero, as the design writes them.
    private var clock: String { Self.clockLabel(remaining) }

    static func clockLabel(_ seconds: Int) -> String {
        "\(max(0, seconds) / 60):" + String(format: "%02d", max(0, seconds) % 60)
    }

    /// A 4pt track that empties as the rest runs. No sweep animation: it
    /// steps once a second, which is what it does under Reduce Motion anyway.
    private var track: some View {
        GeometryReader { proxy in
            ZStack(alignment: .leading) {
                Capsule().fill(isDone ? Color.clear : SL.Surface.hairlineStrong)
                Capsule()
                    .fill(SL.Signal.recovery)
                    .frame(width: proxy.size.width * fraction)
            }
        }
        .frame(height: 4)
        .frame(maxWidth: .infinity)
        .accessibilityHidden(true)
    }

    private var fraction: Double {
        guard total > 0 else { return 0 }
        return min(1, max(0, Double(remaining) / Double(total)))
    }
}
