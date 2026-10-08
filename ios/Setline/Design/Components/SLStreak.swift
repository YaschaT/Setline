import SwiftUI
import SetlineCore

/// The streak chip on Training: a flame and the weeks in a row. Lime once
/// there is a streak — it is a gain — and grey while there is none yet.
struct SLStreakChip: View {
    let streak: TrainingStreak
    let action: () -> Void

    var body: some View {
        let lit = streak.weeks > 0
        Button(action: action) {
            HStack(spacing: 4) {
                Image(systemName: lit ? "flame.fill" : "flame")
                    .font(.system(size: 15, weight: .semibold))
                Text("\(streak.weeks)")
                    .font(.slFixed(SL.TypeSize.body, SL.Weight.semibold))
                    .monospacedDigit()
            }
            .foregroundStyle(lit ? SL.Signal.action : SL.Ink.secondary)
            .padding(.horizontal, SL.Space.s3)
            .frame(minHeight: SL.Space.hitMin)
            .background(Capsule().fill(SL.Surface.raised))
            .overlay(Capsule().strokeBorder(SL.Surface.hairline, lineWidth: SL.Metric.border))
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .slFocusRing(Capsule())
        .accessibilityLabel(streak.weeks == 0 ? "No streak yet" : streak.weeks == 1 ? "1-week streak" : "\(streak.weeks)-week streak")
        .accessibilityHint("Shows this week's progress")
    }
}

/// This week as dots: one per workout the plan asks for, filled as they are
/// logged.
struct SLWeekDots: View {
    let done: Int
    let goal: Int
    var size: CGFloat = 12

    var body: some View {
        HStack(spacing: 6) {
            ForEach(0..<max(goal, 1), id: \.self) { index in
                Circle()
                    .fill(index < done ? SL.Signal.action : SL.Surface.raised2)
                    .overlay(Circle().strokeBorder(index < done ? Color.clear : SL.Surface.hairlineStrong, lineWidth: 1))
                    .frame(width: size, height: size)
            }
        }
        .accessibilityElement()
        .accessibilityLabel("\(min(done, goal)) of \(goal) workouts this week")
    }
}

/// What the streak is and where this week stands, from the chip.
struct StreakSheet: View {
    let streak: TrainingStreak
    let onClose: () -> Void
    @Environment(AppState.self) private var app
    @State private var showsMilestones = false

    var body: some View {
        VStack(spacing: SL.Space.s5) {
            HStack {
                Spacer()
                Button("Done", action: onClose)
                    .font(.sl(SL.TypeSize.body, SL.Weight.medium))
                    .foregroundStyle(SL.Ink.secondary)
                    .slHitTarget()
            }

            Image(systemName: streak.weeks > 0 ? "flame.fill" : "flame")
                .font(.system(size: 56, weight: .semibold))
                .foregroundStyle(streak.weeks > 0 ? SL.Signal.action : SL.Ink.tertiary)
                .accessibilityHidden(true)

            VStack(spacing: SL.Space.s1) {
                Text(streak.weeks == 0 ? "No streak yet" : streak.weeks == 1 ? "1-week streak" : "\(streak.weeks)-week streak")
                    .font(.sl(SL.TypeSize.display, SL.Weight.semibold))
                    .foregroundStyle(SL.Ink.primary)
                Text(headline)
                    .slBody()
                    .foregroundStyle(SL.Ink.secondary)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }

            VStack(spacing: SL.Space.s3) {
                SLWeekDots(done: streak.thisWeekDone, goal: streak.thisWeekGoal, size: 18)
                Text("\(min(streak.thisWeekDone, streak.thisWeekGoal)) of \(streak.thisWeekGoal) workouts this week")
                    .slMeta()
                    .foregroundStyle(SL.Ink.secondary)
            }
            .padding(SL.Space.s4)
            .frame(maxWidth: .infinity)
            .slBorderBox()
            .slListCard()

            HStack(spacing: SL.Space.s3) {
                stat(value: streak.best == 1 ? "1 week" : "\(streak.best) weeks", label: "best streak")
                stat(value: streak.freezeAvailable ? "Ready" : "Used", label: "streak freeze")
            }

            Button { showsMilestones = true } label: {
                HStack(spacing: SL.Space.s2) {
                    Image(systemName: "rosette")
                    Text("Milestones")
                    Text("\(milestones.filter(\.isReached).count) of \(milestones.count)")
                        .foregroundStyle(SL.Ink.secondary)
                    Spacer()
                    SLGlyph(name: .chevronRight, size: 14).foregroundStyle(SL.Ink.tertiary)
                }
                .font(.sl(SL.TypeSize.body, SL.Weight.medium))
                .foregroundStyle(SL.Ink.primary)
                .padding(.horizontal, SL.Space.s4)
                .frame(minHeight: 52)
                .slBorderBox()
                .slListCard()
            }
            .buttonStyle(.plain)

            Text(streak.freezeUsedLastWeek
                 ? "Last week was missed; the streak freeze covered it. It's back after four good weeks."
                 : "A week counts when you train as often as your plan asks, on any days. One missed week in four is forgiven.")
                .slMeta()
                .foregroundStyle(SL.Ink.tertiary)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)

            Spacer()
        }
        .padding(.horizontal, SL.Space.gutterSession)
        .padding(.top, SL.Space.s3)
        .background(SL.Surface.ground.ignoresSafeArea())
        .slRespondsToTextSize()
        .sheet(isPresented: $showsMilestones) {
            MilestonesView(milestones: milestones, onClose: { showsMilestones = false })
        }
    }

    private var milestones: [Milestone] {
        Milestones.make(sessions: app.sessions, bestStreak: streak.best)
    }

    private func stat(value: String, label: String) -> some View {
        VStack(spacing: 2) {
            Text(value).slLead(SL.Weight.semibold).monospacedDigit().foregroundStyle(SL.Ink.primary)
            Text(label).slMeta().foregroundStyle(SL.Ink.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, SL.Space.s3)
        .slBorderBox()
        .slListCard()
    }

    private var headline: String {
        let left = max(streak.thisWeekGoal - streak.thisWeekDone, 0)
        if streak.thisWeekMet { return "This week is done. Keep it going next week." }
        if streak.weeks == 0 { return left == 1 ? "One more workout this week starts your streak." : "\(left) more workouts this week start your streak." }
        return left == 1 ? "One more workout this week keeps it alive." : "\(left) more workouts this week keep it alive."
    }
}


/// Everything reached, with its date, and what is next in each kind with how
/// far there is to go. Reached ones are lime; upcoming ones show progress.
struct MilestonesView: View {
    let milestones: [Milestone]
    let onClose: () -> Void
    @Environment(AppState.self) private var app

    var body: some View {
        NavigationStack {
            List {
                ForEach([Milestone.Kind.sessions, .streak, .heaviest, .volume], id: \.self) { kind in
                    let items = shown(kind)
                    if !items.isEmpty {
                        Section(title(kind)) {
                            ForEach(items) { row($0).listRowBackground(SL.Surface.raised) }
                        }
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background(SL.Surface.ground)
            .navigationTitle("Milestones")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("Done", action: onClose) }
            }
        }
    }

    /// Every reached one, then only the next one ahead: a goal, not a wall.
    private func shown(_ kind: Milestone.Kind) -> [Milestone] {
        let all = milestones.filter { $0.kind == kind }
        let reached = all.filter(\.isReached)
        let next = all.first { !$0.isReached }
        return reached.reversed() + (next.map { [$0] } ?? [])
    }

    private func title(_ kind: Milestone.Kind) -> String {
        switch kind {
        case .sessions: return "Sessions"
        case .streak: return "Streaks"
        case .heaviest: return "Heaviest set"
        case .volume: return "Total lifted"
        }
    }

    private func row(_ milestone: Milestone) -> some View {
        HStack(spacing: SL.Space.s3) {
            Image(systemName: milestone.isReached ? "rosette" : "circle.dashed")
                .font(.system(size: 20, weight: .semibold))
                .foregroundStyle(milestone.isReached ? SL.Signal.action : SL.Ink.tertiary)
                .frame(width: 28)
            VStack(alignment: .leading, spacing: 4) {
                Text(milestone.title).slBody(SL.Weight.medium).foregroundStyle(SL.Ink.primary)
                if let date = milestone.reachedOn {
                    Text(app.display.shortDate(date)).slMeta().foregroundStyle(SL.Ink.secondary)
                } else {
                    SLBar(fraction: milestone.fraction, height: 4, fill: SL.Signal.action.opacity(0.7))
                }
            }
        }
        .padding(.vertical, 2)
        .accessibilityElement(children: .combine)
    }
}
