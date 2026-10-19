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
    /// Saves the workout; `true` then opens the post composer. Saving never
    /// posts on its own.
    let onSave: (_ createPost: Bool) -> Void

    @State private var celebration: Celebration?
    /// The week this workout secured, as a full-screen moment; the streak it
    /// makes. `nil` once it has played or when the week isn't secured.
    @State private var securedWeeks: Int?
    /// This workout was kept as one of the lifter's own.
    @State private var savedAsOwn = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    /// This workout's bar has gone in; until then Tally shows the week before it.
    @State private var tallyFilled = false
    @State private var tallyJumps = 0
    @Environment(SocialStore.self) private var social

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

    /// "Save as my workout": this session's exercises and set counts, kept to
    /// start again from "Choose a different workout". Not offered for a
    /// workout that already is one.
    @ViewBuilder
    private var saveAsOwnRow: some View {
        if !CustomWorkout.isCustom(dayID: runner.day.id) {
            Button {
                guard !savedAsOwn else { return }
                let items = runner.slots
                    .filter { $0.model.setCount > 0 }
                    .map { CustomWorkout.Item(exerciseID: $0.model.active.exerciseID, sets: $0.model.setCount) }
                guard !items.isEmpty else { return }
                let name = app.customWorkouts.contains { $0.name == runner.day.short } ? "\(runner.day.short) (copy)" : runner.day.short
                Task { await app.saveCustomWorkout(CustomWorkout(name: name, items: items)) }
                withAnimation(.snappy(duration: 0.2)) { savedAsOwn = true }
                UIImpactFeedbackGenerator(style: .light).impactOccurred()
            } label: {
                HStack(spacing: SL.Space.s2) {
                    Image(systemName: savedAsOwn ? "checkmark" : "square.stack.3d.up")
                        .font(.system(size: 14, weight: .semibold))
                    Text(savedAsOwn ? "Saved to your workouts" : "Save as my workout")
                        .slBody(SL.Weight.medium)
                    Spacer()
                }
                .foregroundStyle(savedAsOwn ? SL.Signal.action : SL.Ink.secondary)
                .frame(minHeight: SL.Space.hitMin)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityHint("Keeps these exercises to start again later")
        }
    }

    /// The clock's minutes, rounded to five; a workout written down
    /// afterwards starts from what the plan says it takes.
    private var clockMinutes: Int {
        if runner.isLoggedAfterwards { return max(5, WeekPlan.minutes(of: runner.day)) }
        return max(5, Int((Double(runner.elapsedSeconds) / 300).rounded()) * 5)
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
                    Text("\(runner.day.short) · \(app.display.shortDate(runner.startedAt))")
                        .slTitle()
                        .foregroundStyle(SL.Ink.primary)
                        .padding(.top, SL.Space.s2)

                    // The clock knows a live workout's length; one written
                    // down afterwards — or typed in at the end — it doesn't,
                    // so the minutes are the lifter's to set.
                    DurationRow(
                        minutes: Binding(
                            get: { runner.durationMinutes ?? clockMinutes },
                            set: { runner.durationMinutes = $0 }
                        ),
                        note: runner.isLoggedAfterwards ? "Planned length — set what it took"
                            : runner.durationMinutes != nil ? "Set by you" : "From the session clock"
                    )
                    .padding(.top, SL.Space.s4)
                    .padding(.bottom, SL.Space.s3)

                    volumeBlock

                    saveAsOwnRow
                        .padding(.top, SL.Space.s4)

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
            // Written down afterwards: the planned length is saved unless
            // changed, never the minutes it took to type.
            if runner.isLoggedAfterwards, runner.durationMinutes == nil {
                runner.durationMinutes = clockMinutes
            }
            // The workout done, heard as the screen arrives. A secured week
            // gets the whole screen first — it's the reason to come back —
            // then the badge or medal it may also have won, as a card.
            SLSound.success.play()
            let streak = app.streak(adding: runner.startedAt, day: runner.day)
            var securesWeek = Calendar.current.isDate(runner.startedAt, equalTo: Date(), toGranularity: .weekOfYear)
                && streak.thisWeekDone == streak.thisWeekGoal
            #if DEBUG
            // `-SetlineWeekMoment` (with `-SetlineComplete`) plays it on demand.
            if ProcessInfo.processInfo.arguments.contains("-SetlineWeekMoment") { securesWeek = true }
            #endif
            if securesWeek {
                try? await Task.sleep(for: .milliseconds(500))
                withAnimation(.easeOut(duration: 0.25)) { securedWeeks = max(streak.weeks, 1) }
                // Wait for it to be dismissed (tap or its own timer).
                while securedWeeks != nil, !Task.isCancelled {
                    try? await Task.sleep(for: .milliseconds(150))
                }
                try? await Task.sleep(for: .milliseconds(300))
            } else {
                try? await Task.sleep(for: .milliseconds(900))
            }
            if let milestone = newMilestones.first {
                celebration = Celebration(symbol: "rosette", title: "Badge earned", detail: milestone.title, badge: milestone)
            } else if let gold = medals.first(where: { $0.place == .gold }) {
                celebration = Celebration(
                    symbol: "medal.fill",
                    title: "Best ever",
                    detail: "\(gold.name) · \(app.display.kg(gold.weightKg)) × \(gold.reps)"
                )
            }
        }
        .safeAreaInset(edge: .bottom) {
            VStack(spacing: SL.Space.s2) {
                // Only once there is a profile to post from (made in Friends).
                if social.me != nil {
                    Button { onSave(true) } label: {
                        HStack(spacing: SL.Space.s2) {
                            SLGlyph(name: .people, size: 18)
                            Text("Create post")
                        }
                    }
                    .buttonStyle(SLOutlineButtonStyle())
                    .accessibilityHint("Saves the session, then lets you share it with friends")
                }
                Button { onSave(false) } label: { Text("Save session") }
                    .buttonStyle(SLPrimaryButtonStyle())
            }
            .padding(.horizontal, SL.Space.gutterSession)
            .padding(.top, SL.Space.s3)
            .padding(.bottom, SL.Space.s3)
            // Opaque, like the session's own bottom bar: records scroll
            // underneath it instead of showing through the actions.
            .background(SL.Surface.ground.ignoresSafeArea(edges: .bottom))
        }
        // Over everything, the actions included: for these seconds the week
        // is the only thing on screen.
        .overlay {
            if let weeks = securedWeeks {
                WeekSecuredMoment(weeks: weeks) {
                    withAnimation(.easeOut(duration: 0.25)) { securedWeeks = nil }
                }
                .transition(.opacity)
            }
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

    /// Where this workout leaves the week, said by Tally: the bar this
    /// workout adds fills in as the screen opens, Tally jumps, and says
    /// what it means — or strikes the week through.
    private var streakBlock: some View {
        let streak = app.streak(adding: runner.startedAt, day: runner.day)
        let completes = streak.thisWeekDone >= streak.thisWeekGoal
        let left = max(streak.thisWeekGoal - streak.thisWeekDone, 0)
        let line = completes
            ? (streak.weeks == 1 ? "Week struck. Your streak has started." : "Week struck. That's \(streak.weeks) in a row.")
            : left == 1 ? "Bar added. One more strikes the week." : "Bar added. \(left) to go this week."
        return HStack(alignment: .center, spacing: SL.Space.s4) {
            TallyMascot(
                done: tallyFilled ? streak.thisWeekDone : max(streak.thisWeekDone - 1, 0),
                goal: streak.thisWeekGoal,
                mood: tallyFilled && completes ? .struck : .proud,
                unit: 15,
                jumps: tallyJumps
            )
            Text(line)
                .slBody(SL.Weight.semibold)
                .foregroundStyle(SL.Ink.primary)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.horizontal, SL.Space.s3)
                .padding(.vertical, SL.Space.s2)
                .background(
                    UnevenRoundedRectangle(topLeadingRadius: 4, bottomLeadingRadius: 14, bottomTrailingRadius: 14, topTrailingRadius: 14, style: .continuous)
                        .fill(SL.Surface.raised2)
                )
                .opacity(tallyFilled ? 1 : 0)
                .offset(x: tallyFilled ? 0 : -8)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(SL.Space.s4)
        .slBorderBox()
        .slListCard()
        .sensoryFeedback(.impact(weight: .medium), trigger: tallyJumps)
        .task {
            guard !tallyFilled else { return }
            try? await Task.sleep(for: .milliseconds(reduceMotion ? 0 : 500))
            withAnimation(reduceMotion ? nil : .spring(response: 0.45, dampingFraction: 0.7)) { tallyFilled = true }
            if !reduceMotion { tallyJumps += 1 }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(min(streak.thisWeekDone, streak.thisWeekGoal)) of \(streak.thisWeekGoal) workouts this week. \(line)")
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


/// The week secured, given the whole screen for a moment: Tally strikes its
/// bars through into the full mark, the streak counts up to its new number,
/// and the phone answers. It leaves by itself after a few seconds, or on a
/// tap. With Reduce Motion it simply appears, already struck.
private struct WeekSecuredMoment: View {
    let weeks: Int
    let onDone: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var struck = false
    @State private var shown = 0
    @State private var jumps = 0

    var body: some View {
        ZStack {
            SL.Surface.ground.opacity(0.94).ignoresSafeArea()
            RadialGradient(colors: [SL.Signal.action.opacity(0.22), .clear], center: .center, startRadius: 0, endRadius: 320)
                .ignoresSafeArea()
            VStack(spacing: SL.Space.s5) {
                TallyMascot(done: 3, goal: 3, mood: struck ? .struck : .proud, unit: 30, jumps: jumps)
                    .animation(.spring(response: 0.45, dampingFraction: 0.6), value: struck)
                VStack(spacing: SL.Space.s1) {
                    Text("\(shown)")
                        .font(.slCapped(96, SL.Weight.bold, maxScale: 1.2, relativeTo: .largeTitle))
                        .monospacedDigit()
                        .foregroundStyle(SL.Signal.action)
                        .contentTransition(.numericText(value: Double(shown)))
                    Text(weeks == 1 ? "Week secured. Your streak has started." : "Week secured. \(weeks) weeks in a row.")
                        .slLead(SL.Weight.semibold)
                        .foregroundStyle(SL.Ink.primary)
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Text("Tap to continue")
                    .slMeta()
                    .foregroundStyle(SL.Ink.secondary)
                    .padding(.top, SL.Space.s4)
            }
            .padding(.horizontal, SL.Space.gutterSession)
        }
        .contentShape(Rectangle())
        .onTapGesture(perform: onDone)
        .sensoryFeedback(.success, trigger: struck)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(weeks == 1 ? "Week secured. Your streak has started." : "Week secured. \(weeks)-week streak.")
        .accessibilityAddTraits(.isButton)
        .accessibilityHint("Continues")
        .task {
            guard !reduceMotion else {
                struck = true
                shown = weeks
                try? await Task.sleep(for: .seconds(3))
                onDone()
                return
            }
            shown = max(weeks - 1, 0)
            try? await Task.sleep(for: .milliseconds(350))
            struck = true
            jumps += 1
            try? await Task.sleep(for: .milliseconds(250))
            withAnimation(.snappy(duration: 0.5)) { shown = weeks }
            try? await Task.sleep(for: .seconds(2.6))
            onDone()
        }
    }
}
