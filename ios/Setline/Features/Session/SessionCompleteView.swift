import SwiftUI
import SetlineCore

/// Artboard 17R. Four kinds of record, each stated once, as a fact — with,
/// since, the medals a lift earns against its own history, the week it fills
/// and any badge it wins. 17R replaced base 17's comparison line,
/// per-exercise list and note link with the records themselves; the one
/// addition is `Terug`, in the handoff's own back-link style, so a mis-tap on
/// `Sessie afronden` never forces a save.
struct SessionCompleteView: View {
    @Environment(AppState.self) private var app
    @Environment(\.dynamicTypeSize) private var typeSize
    let runner: SessionRunner
    let previous: TrainingSession?
    /// Back to the session without saving — a mis-tap on `Sessie afronden`,
    /// or one set to fix, must not force a save.
    let onBack: () -> Void
    let onSave: () -> Void

    @State private var celebration: Celebration?
    @Environment(SocialStore.self) private var social
    @AppStorage("setline.social.shareWorkouts") private var sharesWorkouts = true

    /// Milestones this workout reaches, worked out before it is saved.
    private var newMilestones: [Milestone] {
        let pending = runner.finishedSession(existing: nil)
        let best = app.streak(adding: runner.startedAt, day: runner.day).best
        let before = Set(Milestones.make(sessions: app.sessions, bestStreak: app.streak.best).filter(\.isReached).map(\.id))
        return Milestones.make(sessions: app.sessions + [pending], bestStreak: best)
            .filter { $0.isReached && !before.contains($0.id) }
    }

    /// Gold, silver and bronze this workout earns, judged before it is saved.
    private var medals: [LiftMedal] {
        let pending = runner.finishedSession(existing: nil)
        return Medals.medals(for: pending, in: app.sessions + [pending])
    }

    var body: some View {
        ZStack {
            SL.Surface.ground.ignoresSafeArea()

            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Button(action: onBack) {
                        Text("Back")
                            .slBody(SL.Weight.medium)
                            .foregroundStyle(SL.Ink.secondary)
                            .frame(minHeight: SL.Space.hitMin)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Back to session")

                    SLEyebrow(text: "Done · \(runner.completedSetCount)/\(runner.plannedSetCount) sets")
                        .padding(.top, SL.Space.s5)

                    // The date is the session's own, and a workout written
                    // down afterwards claims no duration: the minutes it took
                    // to type are not the minutes it took to train.
                    Text(runner.isLoggedAfterwards
                         ? "\(runner.day.short) · \(app.display.shortDate(runner.startedAt))"
                         : "\(runner.day.short) · \(app.display.minutes(runner.elapsedSeconds)) · \(app.display.shortDate(runner.startedAt))")
                        .slTitle()
                        .foregroundStyle(SL.Ink.primary)
                        .padding(.top, SL.Space.s2)

                    volumeBlock

                    if !medals.isEmpty { medalBlock.padding(.top, SL.Space.s5) }

                    // A workout written down for an earlier week does not
                    // move this week's dots, so it shows none.
                    if Calendar.current.isDate(runner.startedAt, equalTo: Date(), toGranularity: .weekOfYear) {
                        streakBlock.padding(.top, SL.Space.s5)
                    }

                    ForEach(newMilestones) { milestone in
                        HStack(spacing: SL.Space.s3) {
                            SLBadge(milestone: milestone, size: 44)
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Badge earned").slMeta().foregroundStyle(SL.Signal.action)
                                Text(milestone.title).slBody(SL.Weight.semibold).foregroundStyle(SL.Ink.primary)
                            }
                            Spacer()
                        }
                        .padding(SL.Space.s4)
                        .slBorderBox()
                        .slListCard()
                        .padding(.top, SL.Space.s3)
                        .accessibilityElement(children: .combine)
                    }

                    records.padding(.top, SL.Space.s5)
                }
                .padding(.horizontal, SL.Space.gutterSession)
                .padding(.top, SL.Space.s3)
                .padding(.bottom, SL.Space.s12)
            }
        }
        .slCelebration($celebration)
        .task {
            // The moment this workout earns, once, a beat after the screen
            // appears: a milestone first, else a completed week.
            try? await Task.sleep(for: .milliseconds(450))
            if let milestone = newMilestones.first {
                celebration = Celebration(symbol: "rosette", title: "Badge earned", detail: milestone.title, badge: milestone)
            } else if let gold = medals.first(where: { $0.place == .gold }) {
                celebration = Celebration(
                    symbol: "medal.fill",
                    title: "Best ever",
                    detail: "\(gold.name) · \(app.display.kg(gold.weightKg)) × \(gold.reps)"
                )
            } else if Calendar.current.isDate(runner.startedAt, equalTo: Date(), toGranularity: .weekOfYear) {
                let streak = app.streak(adding: runner.startedAt, day: runner.day)
                if streak.thisWeekDone == streak.thisWeekGoal {
                    celebration = Celebration(
                        symbol: "flame.fill",
                        title: "Week goal reached",
                        detail: streak.weeks == 1 ? "Your streak has started" : "\(streak.weeks)-week streak"
                    )
                }
            }
        }
        .safeAreaInset(edge: .bottom) {
            VStack(spacing: SL.Space.s2) {
                // Only once there is someone to share with: a profile made in
                // Friends.
                if social.me != nil {
                    Toggle(isOn: $sharesWorkouts) {
                        HStack(spacing: SL.Space.s2) {
                            SLGlyph(name: .people, size: 18)
                                .foregroundStyle(SL.Ink.secondary)
                            Text("Share with friends")
                                .slBody(SL.Weight.medium)
                                .foregroundStyle(SL.Ink.primary)
                        }
                    }
                    .tint(SL.Signal.action)
                    .padding(.horizontal, SL.Space.s1)
                    .accessibilityHint("Friends see this workout's name, numbers and medals. Never the sets.")
                }
                Button(action: onSave) { Text("Save session") }
                    .buttonStyle(SLPrimaryButtonStyle())
            }
            .padding(.horizontal, SL.Space.gutterSession)
            .padding(.top, SL.Space.s3)
            .padding(.bottom, SL.Space.s3)
            // Opaque, like the session's own bottom bar: records scroll
            // underneath it instead of showing through the actions.
            .background(SL.Surface.ground.ignoresSafeArea(edges: .bottom))
        }
    }

    /// The medals, gold first: how many, then one row a lift.
    private var medalBlock: some View {
        VStack(alignment: .leading, spacing: SL.Space.s3) {
            HStack(alignment: .firstTextBaseline) {
                SLEyebrow(text: medals.count == 1 ? "1 medal" : "\(medals.count) medals")
                Spacer()
                HStack(spacing: -8) {
                    ForEach(Array(medals.prefix(5).enumerated()), id: \.offset) { _, medal in
                        SLMedal(place: medal.place, size: 22)
                    }
                }
                .accessibilityHidden(true)
            }
            VStack(spacing: 0) {
                ForEach(Array(medals.enumerated()), id: \.element.id) { index, medal in
                    SLMedalRow(medal: medal, display: app.display)
                        .padding(.vertical, SL.Space.s3)
                        .overlay(alignment: .top) { if index > 0 { SLHairline() } }
                }
            }
            .padding(.horizontal, SL.Space.s4)
            .slBorderBox()
            .slListCard()
        }
    }

    /// Where this workout leaves the week, before it is even saved: the dots
    /// it fills, and the streak it keeps or starts.
    private var streakBlock: some View {
        let streak = app.streak(adding: runner.startedAt, day: runner.day)
        let completes = streak.thisWeekDone == streak.thisWeekGoal
        return HStack(spacing: SL.Space.s3) {
            SLGlyph(name: streak.weeks > 0 ? .flameFill : .flame, size: 26, fixed: true)
                .foregroundStyle(streak.weeks > 0 ? SL.Signal.action : SL.Ink.secondary)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: SL.Space.s1) {
                Text(completes
                     ? (streak.weeks == 1 ? "Week goal reached · streak started" : "Week goal reached · \(streak.weeks)-week streak")
                     : "\(min(streak.thisWeekDone, streak.thisWeekGoal)) of \(streak.thisWeekGoal) workouts this week")
                    .slBody(SL.Weight.semibold)
                    .foregroundStyle(SL.Ink.primary)
                    .fixedSize(horizontal: false, vertical: true)
                SLWeekDots(done: streak.thisWeekDone, goal: streak.thisWeekGoal)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(SL.Space.s4)
        .slBorderBox()
        .slListCard()
        .accessibilityElement(children: .combine)
    }

    private var volumeBlock: some View {
        let summary = runner.volumeSummary(previous: previous)
        return VStack(alignment: .leading, spacing: 0) {
            SLEyebrow(text: "Volume")
            // A number never breaks across lines: at accessibility sizes the
            // change moves under it instead of squeezing it.
            volumeLayout {
                Text(app.display.volumeKg(summary.volume))
                    .slDisplay(SL.TypeSize.displayXL)
                    .slNumerals()
                    // 17R: 44 on a 1.04 line.
                    .slLineHeight(1.04, size: SL.TypeSize.displayXL)
                    .lineLimit(1)
                    .minimumScaleFactor(0.5)
                    .foregroundStyle(SL.Ink.primary)
                if let delta = summary.delta, delta > 0 {
                    Text(app.display.signedDelta(delta))
                        .slLead()
                        .slNumerals()
                        .foregroundStyle(SL.Ink.primary)
                }
            }
            .padding(.top, 6)
        }
        .padding(.top, SL.Space.s2)
        .padding(.bottom, SL.Space.s5)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(alignment: .bottom) { SLHairline() }
    }

    private var volumeLayout: AnyLayout {
        typeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: 2))
            : AnyLayout(HStackLayout(alignment: .firstTextBaseline, spacing: SL.Space.s3))
    }

    /// Plain blocks separated by hairlines — no cards. The highest-ranked
    /// record takes the screen's one lime; the rest stay tertiary, and a
    /// reference still being built never takes it.
    private var records: some View {
        let entries = runner.records()
        return VStack(alignment: .leading, spacing: SL.Space.s4) {
            ForEach(Array(entries.enumerated()), id: \.offset) { index, entry in
                VStack(alignment: .leading, spacing: 0) {
                    SLEyebrow(
                        text: entry.name,
                        color: index == 0 && !entry.record.buildsReference ? SL.Signal.action : SL.Ink.tertiary
                    )
                    Text(entry.record.headline)
                        .slTitle()
                        .slNumerals()
                        .foregroundStyle(SL.Ink.primary)
                        .padding(.top, 4)
                    Text(entry.record.detail)
                        .slMeta()
                        .foregroundStyle(SL.Ink.tertiary)
                        .padding(.top, 2)
                }
                if index < entries.count - 1 { SLHairline() }
            }
        }
    }
}
