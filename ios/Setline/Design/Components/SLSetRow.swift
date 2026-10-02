import SwiftUI

/// Redesign 1b · one set of the exercise on screen.
///
/// A row of the previous-session card, 52 high and the whole width a tap
/// target: a ring that says where the set stands, its name, what the same set
/// was last time, and its value. The set that is up is the one tinted lime,
/// with its value inside a dashed edge — it shows what `Set opslaan` would
/// write, so the correction is readable before it is saved.
///
/// A state never rests on colour alone: a written set carries a tick, the open
/// one says `open`, and one still to come shows a dash.
struct SLSetRow: View {
    @Environment(\.dynamicTypeSize) private var typeSize

    enum Phase {
        /// Written.
        case done
        /// The set that is up next.
        case open
        /// Still to come.
        case pending
    }

    /// What the set *was*, in a word and a colour: a record, a failed set,
    /// paused or partial reps, the reserve that was reported.
    struct Note: Equatable {
        let text: String
        let tone: Color
    }

    /// "Set 2", "Set 2 · open", "Set 4 · extra".
    let label: String
    let phase: Phase
    var note: Note? = nil
    /// "vorige 82,5 × 8"
    var previous: String? = nil
    /// "82,5 × 8", or "—" while the set waits.
    let value: String
    /// "volgt uit set 1" is a sentence rather than a value, and is set as one.
    var valueIsSentence = false
    let spoken: String
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            Group {
                if typeSize.isAccessibilitySize {
                    // Four columns of large text cut every value short. The
                    // name keeps the first line, and what the set was last
                    // time and what it is now share the second.
                    VStack(alignment: .leading, spacing: SL.Space.s1) {
                        HStack(alignment: .center, spacing: SL.Space.s3) {
                            ring
                            labels
                        }
                        HStack(alignment: .firstTextBaseline, spacing: SL.Space.s2) {
                            if let previous { previousText(previous) }
                            Spacer(minLength: SL.Space.s2)
                            valueText
                        }
                    }
                    .padding(.vertical, SL.Space.s2)
                } else {
                    HStack(alignment: .center, spacing: SL.Space.s3) {
                        ring
                        labels
                            .layoutPriority(1)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        if let previous { previousText(previous) }
                        valueText
                    }
                }
            }
            .padding(.horizontal, SL.Space.s4)
            .padding(.vertical, SL.Space.s1)
            .frame(minHeight: SL.Metric.setRowHeight)
            .background(phase == .open ? SL.Signal.actionTint : Color.clear)
            .contentShape(Rectangle())
        }
        .buttonStyle(SLRowButtonStyle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(spoken)
        .accessibilityHint(phase == .done ? "Dubbeltik om deze set te corrigeren" : "Dubbeltik voor alle opties van deze set")
    }

    private var labels: some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(label)
                .font(.sl(SL.TypeSize.body, phase == .open ? SL.Weight.semibold : SL.Weight.regular))
                .slNumerals()
                .foregroundStyle(phase == .open ? SL.Signal.action : SL.Ink.secondary)
                .lineLimit(1)
                .minimumScaleFactor(0.85)
            if let note {
                Text(note.text)
                    .font(.sl(SL.TypeSize.micro, SL.Weight.semibold))
                    .slNumerals()
                    .foregroundStyle(note.tone)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private func previousText(_ text: String) -> some View {
        Text(text)
            .slMeta()
            .slNumerals()
            .foregroundStyle(SL.Ink.secondary)
            .lineLimit(1)
            .minimumScaleFactor(0.75)
    }

    private var valueText: some View {
        Text(value)
            .font(valueFont)
            .slNumerals()
            .foregroundStyle(valueInk)
            .lineLimit(1)
            .minimumScaleFactor(0.7)
            .padding(.vertical, SL.Space.s1)
            .padding(.horizontal, SL.Space.s2)
            .frame(minWidth: valueIsSentence ? nil : 84, alignment: .trailing)
            .overlay(
                RoundedRectangle(cornerRadius: SL.Radius.sm, style: .continuous)
                    .strokeBorder(
                        phase == .open ? SL.Signal.action.opacity(0.7) : Color.clear,
                        style: StrokeStyle(lineWidth: 1, dash: [4, 3])
                    )
            )
    }

    private var ring: some View {
        ZStack {
            switch phase {
            case .done:
                Circle().fill(SL.Signal.action.opacity(0.15))
                SLGlyph(name: .check, size: 14, fixed: true).foregroundStyle(SL.Signal.action)
            case .open:
                Circle().strokeBorder(SL.Signal.action, lineWidth: 2)
            case .pending:
                Circle().strokeBorder(SL.Surface.mute, lineWidth: 1)
            }
        }
        .frame(width: 26, height: 26)
        .accessibilityHidden(true)
    }

    private var valueFont: Font {
        if valueIsSentence { return .sl(SL.TypeSize.meta, SL.Weight.regular) }
        return .sl(SL.TypeSize.lead, phase == .pending ? SL.Weight.regular : SL.Weight.semibold)
    }

    private var valueInk: Color {
        if valueIsSentence { return SL.Ink.secondary }
        switch phase {
        case .done: return SL.Ink.primary
        case .open: return SL.Signal.action
        case .pending: return SL.Ink.primary.opacity(0.62)
        }
    }
}

/// A warm-up step: a reference line, not a control. It carries no ring and is
/// never logged — the ramp is generated from today's top set and counts for
/// nothing.
struct SLWarmupRow: View {
    let label: String
    let value: String

    var body: some View {
        HStack(alignment: .center, spacing: SL.Space.s3) {
            Text(label)
                .slBody()
                .slNumerals()
                .foregroundStyle(SL.Ink.secondary)
            Spacer(minLength: SL.Space.s2)
            Text(value)
                .slBody(SL.Weight.semibold)
                .slNumerals()
                .foregroundStyle(SL.Ink.secondary)
        }
        .padding(.horizontal, SL.Space.s4)
        .frame(minHeight: SL.Space.hitMin)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Opwarmset \(label), \(value)")
    }
}

/// What a note is about, which decides its dot and its edge: lime where it is
/// a gain or a go-ahead, amber where it asks for attention, grey where it
/// simply informs.
enum SLNoteTone {
    case action, attention, recovery, quiet

    var color: Color {
        switch self {
        case .action: return SL.Signal.action
        case .attention: return SL.Signal.attention
        case .recovery: return SL.Signal.recovery
        case .quiet: return SL.Ink.secondary
        }
    }

    var edge: Color {
        self == .quiet ? SL.Surface.hairline : color.opacity(0.35)
    }
}

/// One thing worth reading, set apart: a dot in the colour of what it means
/// and the words beside it.
struct SLNoteCard<Content: View>: View {
    var tone: SLNoteTone = .quiet
    @ViewBuilder var content: Content

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Circle()
                .fill(tone.color)
                .frame(width: 8, height: 8)
                .padding(.top, 6)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: SL.Space.s1) { content }
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.vertical, SL.Space.s3)
        .padding(.horizontal, 14)
        .slBorderBox()
        .background(
            RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous)
                .fill(SL.Surface.raised)
        )
        .overlay(
            RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous)
                .strokeBorder(tone.edge, lineWidth: 1)
        )
    }
}

/// A pill-shaped control: 44 high inside the strong hairline — `Wissel`,
/// `Schijven`, `Meer`.
struct SLPillButtonStyle: ButtonStyle {
    /// The quiet variant sets its label in ink-2.
    var quiet = false

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.sl(SL.TypeSize.body, SL.Weight.regular))
            .foregroundStyle(quiet ? SL.Ink.secondary : SL.Ink.primary)
            .lineLimit(1)
            .padding(.horizontal, 14)
            .frame(minHeight: SL.Space.hitMin)
            .slBorderBox()
            .background(Capsule().fill(configuration.isPressed ? SL.Surface.raised2 : Color.clear))
            .overlay(Capsule().strokeBorder(SL.Surface.hairlineStrong, lineWidth: 1))
            .contentShape(Capsule())
            .slFocusRing(Capsule())
    }
}
