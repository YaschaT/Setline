import SwiftUI
import SetlineCore

// The pieces of Training that carry the game around the hero card: the
// lifts that can go up today, and the badge a workout is working toward.

// MARK: - Records within reach

/// Under the hero, one line: how many lifts the engine says can go up
/// today, with the first of them. A tap opens the list in place — last
/// time's weight to today's — and closes it again. The session screen says
/// each one again when its exercise comes up, so here it is a reason to
/// start, not something to read through.
struct ReadyLiftsCard: View {
    let lifts: [ReadyLift]
    let display: NumberDisplay

    @State private var expanded = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button {
                withAnimation(reduceMotion ? nil : .spring(response: 0.35, dampingFraction: 0.85)) { expanded.toggle() }
            } label: {
                HStack(spacing: SL.Space.s3) {
                    SLGlyph(name: .trendUp, size: 16, fixed: true)
                        .foregroundStyle(SL.Signal.action)
                        .frame(width: 30, height: 30)
                        .background(Circle().fill(SL.Signal.action.opacity(0.12)))
                    VStack(alignment: .leading, spacing: 1) {
                        Text(lifts.count == 1 ? "1 lift can go up today" : "\(lifts.count) lifts can go up today")
                            .slBody(SL.Weight.semibold)
                            .foregroundStyle(SL.Ink.primary)
                        if !expanded, let first = lifts.first {
                            Text("\(first.name) \(display.kg(first.toKg))\(lifts.count > 1 ? " and more" : "")")
                                .slMeta()
                                .slNumerals()
                                .foregroundStyle(SL.Ink.secondary)
                                .lineLimit(1)
                                .transition(.opacity)
                        }
                    }
                    Spacer(minLength: 0)
                    SLGlyph(name: .chevronDown, size: 12)
                        .foregroundStyle(SL.Ink.tertiary)
                        .rotationEffect(.degrees(expanded ? 180 : 0))
                }
                .padding(.horizontal, SL.Space.s4)
                .frame(minHeight: 60)
                .contentShape(Rectangle())
            }
            .buttonStyle(SLPressStyle(scale: 0.98))
            .accessibilityLabel(lifts.count == 1 ? "1 lift can go up today" : "\(lifts.count) lifts can go up today")
            .accessibilityHint(expanded ? "Hides the list" : "Shows which lifts and to what weight")

            if expanded {
                VStack(spacing: 0) {
                    ForEach(lifts) { lift in
                        HStack(alignment: .firstTextBaseline, spacing: SL.Space.s2) {
                            Text(lift.name)
                                .slBody()
                                .foregroundStyle(SL.Ink.primary)
                                .lineLimit(1)
                                .frame(maxWidth: .infinity, alignment: .leading)
                            if let from = lift.fromKg {
                                Text(display.kg(from))
                                    .slMeta()
                                    .slNumerals()
                                    .foregroundStyle(SL.Ink.tertiary)
                                SLGlyph(name: .arrowRight, size: 12, fixed: true)
                                    .foregroundStyle(SL.Ink.tertiary)
                            }
                            Text(display.kg(lift.toKg))
                                .slBody(SL.Weight.semibold)
                                .slNumerals()
                                .foregroundStyle(SL.Signal.action)
                        }
                        .padding(.vertical, 9)
                        .overlay(alignment: .top) { SLHairline() }
                        .accessibilityElement(children: .combine)
                    }
                }
                .padding(.horizontal, SL.Space.s4)
                .padding(.bottom, SL.Space.s2)
                .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
        .background(
            RoundedRectangle(cornerRadius: SL.Radius.xl, style: .continuous)
                .fill(SL.Surface.raised)
        )
        .overlay(
            RoundedRectangle(cornerRadius: SL.Radius.xl, style: .continuous)
                .strokeBorder(SL.Surface.hairline, lineWidth: SL.Metric.border)
        )
        .clipShape(RoundedRectangle(cornerRadius: SL.Radius.xl, style: .continuous))
    }
}

// MARK: - The badge in reach

/// The last card: the next badge, what it takes and how far, and the way
/// into the whole collection.
struct NextBadgeCard: View {
    let milestone: Milestone
    /// Finishing today's workout wins it.
    let unlocks: Bool
    let onOpen: () -> Void
    let onAll: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: SL.Space.s3) {
            HStack {
                Text(unlocks ? "UNLOCKS TODAY" : "NEXT BADGE")
                    .font(.sl(SL.TypeSize.micro, SL.Weight.bold))
                    .tracking(1)
                    .foregroundStyle(unlocks ? SL.Signal.action : SL.Ink.secondary)
                Spacer()
                Button(action: onAll) {
                    HStack(spacing: 4) {
                        Text("All badges").slMeta(SL.Weight.semibold)
                        SLGlyph(name: .chevronRight, size: 12)
                    }
                    .foregroundStyle(SL.Ink.secondary)
                    .frame(minHeight: SL.Space.hitMin)
                    .contentShape(Rectangle())
                }
                .buttonStyle(SLPressStyle())
            }
            Button(action: onOpen) {
                HStack(spacing: SL.Space.s4) {
                    SLBadge(milestone: milestone, size: 58)
                    VStack(alignment: .leading, spacing: SL.Space.s2) {
                        HStack(alignment: .firstTextBaseline) {
                            Text(milestone.title)
                                .slLead(SL.Weight.semibold)
                                .foregroundStyle(SL.Ink.primary)
                                .lineLimit(1)
                                .minimumScaleFactor(0.85)
                            Spacer(minLength: SL.Space.s2)
                            Text(progressLabel)
                                .slMeta()
                                .slNumerals()
                                .foregroundStyle(SL.Ink.secondary)
                        }
                        SLBar(fraction: milestone.fraction, height: 5, fill: SL.Signal.action)
                        Text(unlocks ? "Finish today's workout to win it" : milestone.howTo)
                            .slMeta()
                            .foregroundStyle(SL.Ink.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(SLPressStyle())
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(unlocks ? "Finishing today unlocks \(milestone.title)" : "Next badge: \(milestone.title), \(progressLabel)")
        }
        .padding(SL.Space.s4)
        .background(
            RoundedRectangle(cornerRadius: SL.Radius.xl, style: .continuous)
                .fill(SL.Surface.raised)
        )
        .overlay(
            RoundedRectangle(cornerRadius: SL.Radius.xl, style: .continuous)
                .strokeBorder(unlocks ? SL.Signal.action.opacity(0.35) : SL.Surface.hairline, lineWidth: SL.Metric.border)
        )
    }

    private var progressLabel: String {
        let current = Int(milestone.current.rounded(.down)), target = Int(milestone.target)
        switch milestone.kind {
        case .sessions, .streak: return "\(current)/\(target)"
        case .heaviest: return "\(current)/\(target) kg"
        case .volume: return "\(current)/\(target) t"
        default: return "\(current)/\(target)"
        }
    }
}

/// A badge won today, in its metal: the reward the week-secured card shows.
struct EarnedBadgeRow: View {
    let milestone: Milestone
    let next: Milestone?

    var body: some View {
        HStack(spacing: SL.Space.s3) {
            SLBadge(milestone: milestone, size: 64)
            VStack(alignment: .leading, spacing: 2) {
                Text("BADGE EARNED · \(tierName)")
                    .font(.sl(SL.TypeSize.micro, SL.Weight.bold))
                    .tracking(0.8)
                    .foregroundStyle(SL.Ink.secondary)
                Text(milestone.title)
                    .font(.sl(SL.TypeSize.lead, SL.Weight.bold))
                    .foregroundStyle(SL.Ink.primary)
                if let next {
                    Text("Next: \(next.title)")
                        .slMeta()
                        .foregroundStyle(SL.Ink.secondary)
                }
            }
            Spacer(minLength: 0)
        }
        .accessibilityElement(children: .combine)
    }

    private var tierName: String {
        switch milestone.tier {
        case 0: return "BRONZE"
        case 1: return "SILVER"
        case 2: return "GOLD"
        default: return "TOP"
        }
    }
}
