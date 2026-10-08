import SwiftUI

// The pieces the redesign repeats from screen to screen: the head above a
// list, the date column of a row, the marks a row ends on, and the amber card
// that asks for attention.

/// The head of a screen: its name at 21/600 over one line of 15, and whatever
/// the screen puts beside it.
struct SLScreenTitle<Trailing: View>: View {
    @Environment(\.dynamicTypeSize) private var typeSize

    let title: String
    var subtitle: String? = nil
    @ViewBuilder var trailing: Trailing

    var body: some View {
        // The action beside the title keeps its whole label; at the largest
        // text sizes it moves under the title rather than squeezing it.
        let layout = typeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: SL.Space.s3))
            : AnyLayout(HStackLayout(alignment: .center, spacing: SL.Space.s3))
        layout {
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .slTitle()
                    .slLineHeight(SL.LineHeight.title, size: SL.TypeSize.title)
                    .foregroundStyle(SL.Ink.primary)
                    .accessibilityAddTraits(.isHeader)
                if let subtitle {
                    Text(subtitle)
                        .slBody()
                        .slNumerals()
                        .foregroundStyle(SL.Ink.secondary)
                }
            }
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
            trailing.layoutPriority(1)
        }
        .padding(.vertical, SL.Space.s1)
    }
}

extension SLScreenTitle where Trailing == EmptyView {
    init(title: String, subtitle: String? = nil) {
        self.init(title: title, subtitle: subtitle) { EmptyView() }
    }
}

/// "Woensdag 9 september" — a date the way every screen head writes it.
enum SLDateText {
    static func long(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US")
        formatter.dateFormat = "EEEE d MMMM"
        let text = formatter.string(from: date)
        return text.prefix(1).uppercased() + text.dropFirst()
    }
}

/// The section head above a list: the title at 17/600 and, where there is
/// one, what it covers at 13 on the same baseline.
struct SLSectionHead: View {
    @Environment(\.dynamicTypeSize) private var typeSize

    let title: String
    var meta: String? = nil

    var body: some View {
        // At the largest sizes the two stack, so the title is never broken
        // off in the middle of a word to make room for the meta.
        let layout = typeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: 2))
            : AnyLayout(HStackLayout(alignment: .firstTextBaseline, spacing: SL.Space.s3))
        layout {
            Text(title)
                .slLead()
                .foregroundStyle(SL.Ink.primary)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
            if !typeSize.isAccessibilitySize { Spacer(minLength: SL.Space.s2) }
            if let meta {
                Text(meta)
                    .slMeta()
                    .slNumerals()
                    .foregroundStyle(SL.Ink.secondary)
                    .multilineTextAlignment(typeSize.isAccessibilitySize ? .leading : .trailing)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, SL.Space.s1)
    }
}

/// The date column of an agenda row: the weekday at 13 over the day at 17/600,
/// 40 wide.
struct SLDateColumn: View {
    @Environment(\.dynamicTypeSize) private var typeSize

    let weekday: String
    let day: Int
    var weekdayInk: Color = SL.Ink.secondary
    var dayInk: Color = SL.Ink.primary

    /// 40 in the design; it has to grow with the text or "wo" breaks in two.
    @ScaledMetric(relativeTo: .body) private var width: CGFloat = 40

    var body: some View {
        if typeSize.isAccessibilitySize {
            // Inside an `SLAdaptiveRow` the date heads the row on one line.
            (Text("\(weekday) ").font(.sl(SL.TypeSize.meta, SL.Weight.regular)).foregroundStyle(weekdayInk)
                + Text("\(day)").font(.sl(SL.TypeSize.lead, SL.Weight.semibold)).foregroundStyle(dayInk))
                .slNumerals()
                .lineLimit(1)
                .fixedSize()
        } else {
            VStack(alignment: .leading, spacing: 0) {
                Text(weekday)
                    .slMeta()
                    .foregroundStyle(weekdayInk)
                Text("\(day)")
                    .slLead()
                    .slNumerals()
                    .slLineHeight(1.2, size: SL.TypeSize.lead)
                    .foregroundStyle(dayInk)
            }
            .lineLimit(1)
            .frame(width: width, alignment: .leading)
        }
    }
}

/// A list row's three parts — what it is filed under, what it says, and how
/// it ends — side by side, as the design draws them. At the largest text
/// sizes there is no room for that without cutting words in half, so the
/// first and the last share a line and the middle gets the full width under
/// them.
struct SLAdaptiveRow<Leading: View, Main: View, Trailing: View>: View {
    @Environment(\.dynamicTypeSize) private var typeSize

    var spacing: CGFloat = 14
    @ViewBuilder var leading: Leading
    @ViewBuilder var main: Main
    @ViewBuilder var trailing: Trailing

    var body: some View {
        if typeSize.isAccessibilitySize {
            VStack(alignment: .leading, spacing: SL.Space.s1) {
                HStack(alignment: .center, spacing: SL.Space.s2) {
                    leading
                    Spacer(minLength: SL.Space.s2)
                    trailing
                }
                main.frame(maxWidth: .infinity, alignment: .leading)
            }
        } else {
            HStack(alignment: .center, spacing: spacing) {
                leading
                main.frame(maxWidth: .infinity, alignment: .leading)
                trailing
            }
        }
    }
}

/// The lime tick on its tinted disc: a session that was saved.
struct SLDoneMark: View {
    var body: some View {
        SLGlyph(name: .check, size: 11, fixed: true)
            .foregroundStyle(SL.Signal.action)
            .frame(width: 16, height: 16)
            .background(Circle().fill(SL.Signal.action.opacity(0.15)))
            .frame(width: 18, height: 18)
            .accessibilityHidden(true)
    }
}

/// "Today", as the design badges it: lime on the ground, 12/600, tracked.
struct SLTodayBadge: View {
    /// 28 on the day card, 24 inside a list row.
    var height: CGFloat = 28

    var body: some View {
        Text("TODAY")
            .font(.sl(SL.TypeSize.micro, SL.Weight.semibold))
            .tracking(SL.TypeSize.micro * 0.06)
            .foregroundStyle(SL.Signal.action)
            .padding(.horizontal, height >= 28 ? 10 : 8)
            .frame(minHeight: height)
            .background(Capsule().fill(SL.Surface.ground))
            .fixedSize()
            .accessibilityLabel("Today")
    }
}

/// The amber card: a dot, an overline in the attention colour, and what needs
/// looking at in plain words. Amber asks; it never blocks.
struct SLAttentionCard<Content: View>: View {
    let title: String
    @ViewBuilder var content: Content

    var body: some View {
        HStack(alignment: .top, spacing: SL.Space.s3) {
            Circle()
                .fill(SL.Signal.attention)
                .frame(width: 8, height: 8)
                .padding(.top, 5)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: SL.Space.s1) {
                Text(title.uppercased())
                    .font(.sl(SL.TypeSize.meta, SL.Weight.semibold))
                    .tracking(SL.TypeSize.meta * 0.06)
                    .foregroundStyle(SL.Signal.attention)
                    .accessibilityAddTraits(.isHeader)
                content
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.vertical, 14)
        .padding(.horizontal, SL.Space.s4)
        .slBorderBox()
        .background(
            RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous)
                .fill(SL.Surface.raised)
        )
        .overlay(
            RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous)
                .strokeBorder(SL.Signal.attention.opacity(0.35), lineWidth: 1)
        )
    }
}

/// The overline above a block: 13/600, tracked, in capitals — "DEZE WEEK".
struct SLOverline: View {
    let text: String
    var color: Color = SL.Ink.secondary

    var body: some View {
        Text(text.uppercased())
            .font(.sl(SL.TypeSize.meta, SL.Weight.semibold))
            .tracking(SL.TypeSize.meta * 0.06)
            .foregroundStyle(color)
    }
}

/// A row of a list card that can be tapped: the fill steps up while pressed.
struct SLRowButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .background(configuration.isPressed ? SL.Surface.hairline : Color.clear)
    }
}

/// A progress bar as the redesign draws it: a quiet track and a fill that
/// stops at full.
struct SLBar: View {
    /// 0…1.
    let fraction: Double
    var height: CGFloat = 6
    var fill: Color = SL.Signal.action

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .leading) {
                Capsule().fill(Color.white.opacity(0.07))
                Capsule()
                    .fill(fill)
                    .frame(width: proxy.size.width * min(1, max(0, fraction)))
            }
        }
        .frame(height: height)
        .accessibilityElement()
        .accessibilityAddTraits(.updatesFrequently)
    }
}

extension String {
    /// Keeps on one line what reads as one thing: a number with its unit,
    /// "×" with what is on either side of it, and a "·" with the words before
    /// it — so a line that wraps breaks after the dot, never in front of it.
    var slUnbroken: String {
        let nbsp = "\u{00A0}"
        return replacingOccurrences(of: " · ", with: "\(nbsp)· ")
            .replacingOccurrences(of: " × ", with: "\(nbsp)×\(nbsp)")
            .replacingOccurrences(
                of: #"(\d) (kg|g|kcal|min|sets|set|reps|rep|weeks|week|days|day|tonnes|ton)\b"#,
                with: "$1\(nbsp)$2",
                options: .regularExpression
            )
    }
}
