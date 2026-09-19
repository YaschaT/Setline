import SwiftUI
import SetlineCore

/// The frame every intake step sits in (artboards 03–06).
///
/// Step row, a 2px track that fills a quarter at a time, the question, and one
/// commit pill. Every step can be skipped, and skipping the lot leaves the
/// account on the plan it already has.
struct IntakeStep<Content: View>: View {
    let step: Int
    let total: Int
    let title: String
    let subtitle: String
    /// 06 sets its subtitle to a 32ch measure; the other steps do not.
    var subtitleMeasure: CGFloat? = nil
    /// What this answer produces, restated. Load-bearing copy, not decoration.
    let consequence: String
    let commit: String
    let onSkip: () -> Void
    let onCommit: () -> Void
    @ViewBuilder var content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text("\(step)/\(total)")
                    .font(.system(size: SL.TypeSize.meta, weight: SL.Weight.semibold, design: .monospaced))
                    .foregroundStyle(SL.Ink.tertiary)
                Spacer()
                Button { onSkip() } label: {
                    Text("Overslaan")
                        .slBody(SL.Weight.medium)
                        .foregroundStyle(SL.Ink.secondary)
                        .slHitTarget()
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, SL.Space.gutterEntry)
            .padding(.top, SL.Space.s3)

            track
                .padding(.horizontal, SL.Space.gutterEntry)
                .padding(.top, SL.Space.s2)

            // 03–06: the question at the top, the answer and what it produces
            // down by the pill, the room between them flexible (min 28).
            SLAnchoredScroll {
                VStack(alignment: .leading, spacing: 0) {
                    Text(title)
                        .slDisplay()
                        .slLineHeight(SL.LineHeight.display, size: SL.TypeSize.display)
                        .fixedSize(horizontal: false, vertical: true)
                        .foregroundStyle(SL.Ink.primary)

                    Text(subtitle)
                        .slBody()
                        .slLineHeight(1.5, size: SL.TypeSize.body)
                        .fixedSize(horizontal: false, vertical: true)
                        .foregroundStyle(SL.Ink.secondary)
                        .slMeasure(subtitleMeasure ?? .infinity, fontSize: SL.TypeSize.body)
                        .padding(.top, 10)

                    Spacer(minLength: 28)

                    content()

                    if !consequence.isEmpty {
                        Text(consequence)
                            .slBody()
                            .slLineHeight(1.45, size: SL.TypeSize.body)
                            .fixedSize(horizontal: false, vertical: true)
                            .foregroundStyle(SL.Ink.secondary)
                            .padding(.top, SL.Space.s5)
                    }
                }
                .padding(.horizontal, SL.Space.gutterEntry)
                .padding(.top, 36)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .background(SL.Surface.ground.ignoresSafeArea())
        .safeAreaInset(edge: .bottom) {
            Button { onCommit() } label: { Text(commit) }
                .buttonStyle(SLPrimaryButtonStyle())
                .padding(.horizontal, SL.Space.gutterEntry)
                .padding(.bottom, SL.Space.entryBlockBottom)
                .frame(maxWidth: .infinity)
                .background(SL.Surface.ground)
        }
        .slRespondsToTextSize()
    }

    private var track: some View {
        GeometryReader { proxy in
            ZStack(alignment: .leading) {
                Capsule().fill(SL.Surface.hairline)
                Capsule()
                    .fill(SL.Signal.action)
                    .frame(width: proxy.size.width * CGFloat(step) / CGFloat(total))
            }
        }
        .frame(height: 2)
        .accessibilityElement()
        .accessibilityLabel("Stap \(step) van \(total)")
    }
}

/// The option card artboards 04 and 05 share: a title, what it means, and a
/// filled circle on the trailing edge when it is the one chosen.
struct IntakeOption: View {
    let title: String
    let detail: String
    let selected: Bool
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            // 04 and 05: only the chosen card carries the 22pt filled circle,
            // centred on the trailing edge; the others carry nothing.
            HStack(alignment: .center, spacing: SL.Space.s4) {
                VStack(alignment: .leading, spacing: SL.Space.s1) {
                    Text(title).slLead().foregroundStyle(SL.Ink.primary)
                    Text(detail)
                        .slMeta()
                        .fixedSize(horizontal: false, vertical: true)
                        .foregroundStyle(selected ? SL.Ink.secondary : SL.Ink.tertiary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                if selected {
                    Circle()
                        .fill(SL.Ink.primary)
                        .frame(width: 22, height: 22)
                }
            }
            .padding(.vertical, SL.Space.s4)
            .padding(.horizontal, 18)
            .frame(maxWidth: .infinity, alignment: .leading)
            .slBorderBox()
            .background(
                RoundedRectangle(cornerRadius: SL.Radius.option, style: .continuous)
                    .fill(selected ? SL.Surface.raised2 : SL.Surface.raised)
            )
            .overlay(
                RoundedRectangle(cornerRadius: SL.Radius.option, style: .continuous)
                    .strokeBorder(selected ? SL.Surface.selection : SL.Surface.hairline, lineWidth: 1)
            )
            .contentShape(RoundedRectangle(cornerRadius: SL.Radius.option, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? [.isSelected, .isButton] : .isButton)
        .accessibilityLabel("\(title), \(detail)")
    }
}
