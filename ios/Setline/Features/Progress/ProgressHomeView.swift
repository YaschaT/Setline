import SwiftUI
import SetlineCore

/// Redesign 1d · Progressie.
///
/// The tab opens on an overview, training first: how each kind of training
/// day (Push, Pull, Legs, Upper, Lower) moved over the last eight weeks — each
/// opening onto its lifts' best sets — the tonnage of the last seven weeks, and last, body
/// weight as one compact card whose chart opens on request. All of it is read
/// from what the account logged.
///
/// Behind the overview sit the three subjects the app has always had, one at a
/// time with the whole screen to itself: strength per exercise, every
/// weigh-in, and every session. Each part of the overview leads to the one it
/// summarises.
struct ProgressHomeView: View {
    enum Segment: String, CaseIterable, Identifiable {
        case kracht = "Strength"
        case lichaam = "Body"
        case historiek = "Log"
        case lifts = "Lifts"

        var id: String { rawValue }
    }

    @Environment(AppState.self) private var app
    @Environment(\.dynamicTypeSize) private var typeSize
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /// The subject that is open. `nil` is the overview.
    @State private var segment: Segment?
    /// The exercise Kracht opens on, when a best-set row led there.
    @State private var openingExercise: String?
    @State private var weighing = false

    @State private var bodyProgress = BodyProgress.empty
    @State private var trend: [ProgressOverview.WeightPoint] = []
    /// The training day whose lifts are shown; `nil` is every lift.
    @State private var volume: [ProgressOverview.WeekVolume] = []
    @State private var days: [ProgressOverview.DayProgress] = []

    /// "Laatste 8 weken".
    private static let bestWindowDays = 56

    var body: some View {
        Group {
            if let segment {
                detail(segment)
            } else {
                overview
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .task(id: app.revision) { reload() }
        #if DEBUG
        // `-SetlineProgress Strength|Body|Log` opens a subject, so each can be
        // checked without driving taps.
        .onAppear {
            let arguments = ProcessInfo.processInfo.arguments
            if let flag = arguments.firstIndex(of: "-SetlineProgress"), arguments.indices.contains(flag + 1) {
                segment = Segment(rawValue: arguments[flag + 1])
            }
        }
        #endif
        .sheet(isPresented: $weighing) {
            WeighInSheet(
                date: Date(),
                existing: app.weighIn(),
                latest: bodyProgress.latest?.weightKg,
                onSave: { weight in
                    weighing = false
                    Task { await app.saveWeighIn(weight) }
                },
                onClose: { weighing = false }
            )
        }
        .slRespondsToTextSize()
    }

    private func reload() {
        bodyProgress = BodyProgress.make(metrics: app.metrics)
        trend = ProgressOverview.weightTrend(bodyProgress)
        let since = Calendar.current.date(byAdding: .day, value: -Self.bestWindowDays, to: Date()) ?? Date()
        days = ProgressOverview.progressByDay(in: app.sessions, since: since)
        volume = ProgressOverview.weeklyVolume(in: app.sessions)
    }

    // MARK: - Overview

    private var overview: some View {
        ScrollView {
            // 24 between sections, 8 from a section's head to its card: the
            // gap says what belongs together.
            VStack(alignment: .leading, spacing: SL.Space.s8) {
                SLScreenTitle(title: "Progress", subtitle: "Last 8 weeks") { logbookPill }
                highlightCard
                weekSection
                liftsSection
                volumeSection
                weightSection
            }
            .padding(.horizontal, SL.Space.gutterSession)
            .padding(.top, SL.Space.s5)
            .padding(.bottom, SL.Space.s6)
        }
    }

    /// Every logged workout, one tap from the top of the tab: neutral, since
    /// it reads rather than commits.
    private var logbookPill: some View {
        Button { open(.historiek) } label: {
            HStack(spacing: SL.Space.s2) {
                SLGlyph(name: .list, size: 16)
                Text("Log").slBody(SL.Weight.semibold)
            }
            .foregroundStyle(SL.Ink.primary)
            .lineLimit(1)
            .padding(.horizontal, SL.Space.s4)
            .frame(minHeight: SL.Space.hitMin)
            .background(Capsule().fill(SL.Surface.raised))
            .overlay(Capsule().strokeBorder(SL.Surface.hairlineStrong, lineWidth: SL.Metric.border))
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .slFocusRing(Capsule())
        .accessibilityHint("Opens all your logged sessions")
    }

    private func open(_ target: Segment, exercise: String? = nil) {
        openingExercise = exercise
        segment = target
    }


    // MARK: - Body weight

    /// Body weight as a status beside the training: the number large, how the
    /// trend moved as a mint pill, the trend itself as one quiet line, and the
    /// one action. A weigh-in is not a training win, so nothing here is lime.
    private var weightSection: some View {
        VStack(alignment: .leading, spacing: SL.Space.s3) {
            sectionHead("Body weight", action: "See all") { open(.lichaam) }
            VStack(alignment: .leading, spacing: SL.Space.s4) {
                if !lastWeighed.isEmpty {
                    Text(lastWeighed)
                        .slMeta()
                        .foregroundStyle(SL.Ink.secondary)
                        .padding(.bottom, -SL.Space.s3)
                }
                Button { open(.lichaam) } label: { weightBody }
                    .buttonStyle(.plain)
                    .disabled(bodyProgress.entries.isEmpty)
                    .accessibilityHint(bodyProgress.entries.isEmpty ? "" : "Opens all your weigh-ins and the trend")
                weighButton
            }
            .padding(SL.Space.s5)
            .slBorderBox()
            .slListCard(radius: SL.Radius.xl)
        }
    }

    /// "Today", "Yesterday", "5 days ago".
    private var lastWeighed: String {
        guard let date = bodyProgress.latest?.date else { return "" }
        let calendar = Calendar.current
        let days = calendar.dateComponents([.day], from: calendar.startOfDay(for: date), to: calendar.startOfDay(for: Date())).day ?? 0
        switch days {
        case ..<1: return "Weighed today"
        case 1: return "Weighed yesterday"
        default: return "Weighed \(days) days ago"
        }
    }

    private var weightBody: some View {
        VStack(alignment: .leading, spacing: SL.Space.s3) {
            HStack(alignment: .firstTextBaseline, spacing: SL.Space.s1) {
                Text(bodyProgress.latest.map { app.display.number($0.weightKg) } ?? "—")
                    .font(.sl(SL.TypeSize.displayL, SL.Weight.semibold))
                    .slNumerals()
                    .foregroundStyle(SL.Ink.primary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                Text("kg")
                    .slLead()
                    .foregroundStyle(SL.Ink.secondary)
                Spacer(minLength: SL.Space.s2)
                if let movement {
                    movementPill(movement)
                }
            }
            if trend.count >= 2 {
                WeightTrendLine(points: trend)
                    .frame(height: 64)
                HStack {
                    Text(trend.first.map { app.display.shortDate($0.date) } ?? "")
                    Spacer()
                    Text("14-day average").foregroundStyle(SL.Signal.recovery.opacity(0.8))
                    Spacer()
                    Text("Now")
                }
                .font(.sl(SL.TypeSize.micro, SL.Weight.regular))
                .slNumerals()
                .foregroundStyle(SL.Ink.secondary)
                .lineLimit(1)
            } else {
                Text(movementLine)
                    .slMeta()
                    .foregroundStyle(SL.Ink.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .contentShape(Rectangle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(
            (bodyProgress.latest.map { "Body weight \(app.display.kg($0.weightKg))" } ?? "No weigh-in yet")
                + (movement.map { ", \($0.value) \($0.label)" } ?? "")
        )
    }

    /// "↗ +1.1 kg · 14 days", in mint; flat when the trend held.
    private func movementPill(_ movement: (value: String, label: String, moved: Bool)) -> some View {
        let falling = movement.value.hasPrefix("−") || movement.value.hasPrefix("-")
        let ink = movement.moved ? SL.Signal.recovery : SL.Ink.secondary
        return HStack(spacing: SL.Space.s1) {
            if movement.moved {
                SLGlyph(name: .trendUp, size: 13, fixed: true)
                    .scaleEffect(y: falling ? -1 : 1)
            }
            Text("\(movement.value) · \(movement.label.replacingOccurrences(of: "in ", with: ""))")
                .font(.sl(SL.TypeSize.meta, SL.Weight.semibold))
                .slNumerals()
                .lineLimit(1)
        }
        .foregroundStyle(ink)
        .padding(.horizontal, SL.Space.s2 + 2)
        .padding(.vertical, 5)
        .background(Capsule().fill(movement.moved ? SL.Signal.recoveryTint : SL.Surface.raised2))
        .fixedSize()
    }

    /// "+1.1 kg in 14 days", or how to start.
    private var movementLine: String {
        if let movement { return "\(movement.value) \(movement.label)" }
        return bodyProgress.entries.isEmpty
            ? "Weigh yourself in the morning, before eating."
            : "One more weigh-in and your trend starts."
    }

    // MARK: - Highlight

    /// The screen's one headline, said as a sentence (as Apple Health's
    /// highlights and Strava's summaries do): the training day that moved
    /// most, its running best as a full-width line, and the lift that led it.
    private var highlight: ProgressOverview.DayProgress? {
        days.filter { $0.changePercent != nil }
            .max { ($0.changePercent ?? 0, $0.sessions) < ($1.changePercent ?? 0, $1.sessions) }
    }

    @ViewBuilder
    private var highlightCard: some View {
        if let day = highlight, let change = day.changePercent {
            let gained = change > 0
            VStack(alignment: .leading, spacing: SL.Space.s4) {
                HStack(spacing: SL.Space.s2) {
                    SLWorkoutSymbol(dayName: day.label, size: 14)
                    Text("HIGHLIGHT · \(day.label.uppercased())")
                        .font(.sl(SL.TypeSize.micro, SL.Weight.semibold))
                        .tracking(1.2)
                }
                .foregroundStyle(SL.Ink.secondary)

                headline(day, change: change)
                    .font(.sl(26, SL.Weight.semibold))
                    .slNumerals()
                    .slLineHeight(1.15, size: 26)
                    .fixedSize(horizontal: false, vertical: true)

                if day.strength.count >= 2 {
                    VStack(spacing: SL.Space.s2) {
                        StrengthArea(values: day.strength, ink: gained ? SL.Signal.action : SL.Ink.primary)
                            .frame(height: 112)
                        HStack {
                            Text("First session")
                            Spacer()
                            Text("Latest")
                        }
                        .font(.sl(SL.TypeSize.micro, SL.Weight.regular))
                        .foregroundStyle(SL.Ink.secondary)
                    }
                    .accessibilityHidden(true)
                }

                if let leader = day.leader, leader.deltaKg > 0 {
                    SLHairline()
                    Button { open(.kracht, exercise: leader.exerciseID) } label: {
                        HStack(spacing: SL.Space.s3) {
                            muscleChip(for: leader.exerciseID, lit: true, size: 36)
                            VStack(alignment: .leading, spacing: 1) {
                                Text("Biggest gain")
                                    .slMeta()
                                    .foregroundStyle(SL.Ink.secondary)
                                Text(leader.name)
                                    .slBody(SL.Weight.medium)
                                    .foregroundStyle(SL.Ink.primary)
                                    .lineLimit(1)
                            }
                            Spacer(minLength: SL.Space.s2)
                            Text("+\(app.display.number(leader.deltaKg)) kg")
                                .slBody(SL.Weight.semibold)
                                .slNumerals()
                                .foregroundStyle(SL.Signal.action)
                                .fixedSize()
                            SLGlyph(name: .chevronRight, size: 13).foregroundStyle(SL.Ink.tertiary)
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel("Biggest gain: \(leader.name), plus \(app.display.number(leader.deltaKg)) kilos estimated")
                    .accessibilityHint("Opens the strength of this exercise")
                }
            }
            .padding(SL.Space.s5)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: SL.Radius.xl, style: .continuous)
                    .fill(SL.Surface.raised)
            )
            .overlay(
                RoundedRectangle(cornerRadius: SL.Radius.xl, style: .continuous)
                    .strokeBorder(SL.Surface.hairline, lineWidth: 1)
            )
        } else {
            VStack(alignment: .leading, spacing: SL.Space.s2) {
                Text(days.isEmpty ? "Your progress starts with one workout" : "Two sessions of a day, and your trend appears")
                    .font(.sl(SL.TypeSize.title, SL.Weight.semibold))
                    .foregroundStyle(SL.Ink.primary)
                    .fixedSize(horizontal: false, vertical: true)
                Text("Save your sets; Setline compares every lift with its own best.")
                    .slBody()
                    .foregroundStyle(SL.Ink.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(SL.Space.s5)
            .frame(maxWidth: .infinity, alignment: .leading)
            .slBorderBox()
            .slListCard(radius: SL.Radius.xl)
        }
    }

    /// "You're 7 % stronger on Push days", the number in lime.
    private func headline(_ day: ProgressOverview.DayProgress, change: Decimal) -> Text {
        if change > 0 {
            return Text("You're ").foregroundColor(SL.Ink.primary)
                + Text("\(app.display.number(change)) % stronger").foregroundColor(SL.Signal.action)
                + Text(" on \(day.label) days").foregroundColor(SL.Ink.primary)
        }
        if change < 0 {
            return Text("\(day.label) is \(app.display.number(-change)) % below its best — a lighter block shows here too.")
                .foregroundColor(SL.Ink.primary)
        }
        return Text("Holding steady on \(day.label) days").foregroundColor(SL.Ink.primary)
    }

    // MARK: - This week's wins

    /// One thing earned this week: a lift's medal, a new badge, or the week
    /// itself secured.
    private enum Win: Identifiable {
        case medal(LiftMedal)
        case badge(Milestone)
        case streak(TrainingStreak)

        var id: String {
            switch self {
            case .medal(let medal): return "medal-\(medal.exerciseID)"
            case .badge(let milestone): return "badge-\(milestone.id)"
            case .streak: return "streak"
            }
        }
    }

    /// Badges first, then gold, the week secured, silver, bronze — the
    /// rarest news leads, as Apple Fitness orders its awards.
    private var weekWins: [Win] {
        let weekStart = Schedule.mondayFirstWeek(containing: Date()).first ?? Date()
        let thisWeek = app.sessions.filter { $0.kind == .workout && $0.date >= weekStart }
        var best: [String: LiftMedal] = [:]
        for session in thisWeek {
            for medal in Medals.medals(for: session, in: app.sessions) {
                if let kept = best[medal.exerciseID], kept.place <= medal.place { continue }
                best[medal.exerciseID] = medal
            }
        }
        let medals = best.values.sorted { ($0.place, $0.name) < ($1.place, $1.name) }
        let streak = app.streak
        let badges = Milestones.reached(
            in: Milestones.make(sessions: app.sessions, bestStreak: streak.best),
            since: weekStart
        )
        // Two steps of one ladder reached in the same week are one piece of
        // news: the higher.
        var topBadge: [Milestone.Kind: Milestone] = [:]
        for badge in badges where badge.tier >= (topBadge[badge.kind]?.tier ?? -1) {
            topBadge[badge.kind] = badge
        }
        var wins: [Win] = topBadge.values.sorted { $0.tier > $1.tier }.map(Win.badge)
        wins += medals.filter { $0.place == .gold }.map(Win.medal)
        if streak.thisWeekMet { wins.append(.streak(streak)) }
        wins += medals.filter { $0.place != .gold }.map(Win.medal)
        return wins
    }

    private var weekSection: some View {
        let wins = weekWins
        return VStack(alignment: .leading, spacing: SL.Space.s3) {
            HStack(alignment: .firstTextBaseline) {
                Text("This week")
                    .font(.sl(SL.TypeSize.title, SL.Weight.semibold))
                    .foregroundStyle(SL.Ink.primary)
                    .accessibilityAddTraits(.isHeader)
                Spacer(minLength: SL.Space.s2)
                if !wins.isEmpty {
                    Text(wins.count == 1 ? "1 win" : "\(wins.count) wins")
                        .slBody()
                        .slNumerals()
                        .foregroundStyle(SL.Ink.secondary)
                }
            }
            .padding(.horizontal, SL.Space.s1)

            if wins.isEmpty {
                weekEmpty
            } else {
                // The row runs to the screen's edges, so a card cut off at
                // the right says there is more.
                ScrollView(.horizontal, showsIndicators: false) {
                    LazyHStack(spacing: SL.Space.s3) {
                        ForEach(Array(wins.enumerated()), id: \.element.id) { index, win in
                            winCard(win, index: index)
                        }
                    }
                    .scrollTargetLayout()
                }
                .scrollTargetBehavior(.viewAligned)
                .contentMargins(.horizontal, SL.Space.gutterSession, for: .scrollContent)
                .padding(.horizontal, -SL.Space.gutterSession)
            }
        }
    }

    private var weekEmpty: some View {
        HStack(spacing: SL.Space.s4) {
            HStack(spacing: -10) {
                ForEach([LiftMedal.Place.bronze, .silver, .gold], id: \.self) { place in
                    SLMedal(place: place, size: 30)
                        .saturation(0)
                        .opacity(0.35)
                }
            }
            .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text("No medals yet this week")
                    .slBody(SL.Weight.semibold)
                    .foregroundStyle(SL.Ink.primary)
                Text("A lift's best day ever earns gold; its 2nd and 3rd best, silver and bronze.")
                    .slMeta()
                    .foregroundStyle(SL.Ink.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(SL.Space.s4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .slBorderBox()
        .slListCard()
    }

    @ViewBuilder
    private func winCard(_ win: Win, index: Int) -> some View {
        switch win {
        case .medal(let medal):
            Button { open(.kracht, exercise: medal.exerciseID) } label: {
                winFrame(
                    eyebrow: medal.place.title,
                    eyebrowInk: SLMedal.metal(medal.place).face,
                    title: medal.name,
                    detail: "\(app.display.kg(medal.weightKg)) × \(medal.reps)"
                ) {
                    SLMedal(place: medal.place, size: 44, shines: medal.place == .gold)
                }
            }
            .buttonStyle(SLRowButtonStyle())
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("\(medal.place.title) on \(medal.name), \(app.display.kg(medal.weightKg)) × \(medal.reps)")
            .accessibilityHint("Opens the strength of this exercise")
        case .badge(let milestone):
            winFrame(eyebrow: "New badge", eyebrowInk: SL.Signal.action, title: milestone.title, detail: "Earned this week") {
                SLBadge(milestone: milestone, size: 46)
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("New badge: \(milestone.title)")
        case .streak(let streak):
            winFrame(
                eyebrow: "Week secured",
                eyebrowInk: SL.Signal.action,
                title: streak.weeks == 1 ? "1-week streak" : "\(streak.weeks)-week streak",
                detail: streak.thisWeekDone > streak.thisWeekGoal
                    ? "\(streak.thisWeekDone) workouts, goal \(streak.thisWeekGoal)"
                    : "All \(streak.thisWeekGoal) workouts done"
            ) {
                SLGlyph(name: .flameFill, size: 24, fixed: true)
                    .foregroundStyle(SL.Signal.onAction)
                    .frame(width: 44, height: 44)
                    .background(Circle().fill(SL.Signal.action))
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Week secured, \(streak.weeks) week streak")
        }
    }

    /// The shared shape of a win: the award on top, what it is in its own
    /// colour, then what it was for.
    private func winFrame<Art: View>(
        eyebrow: String,
        eyebrowInk: Color,
        title: String,
        detail: String,
        @ViewBuilder art: () -> Art
    ) -> some View {
        VStack(alignment: .leading, spacing: SL.Space.s3) {
            art()
                .frame(height: 50, alignment: .bottomLeading)
            VStack(alignment: .leading, spacing: 3) {
                Text(eyebrow.uppercased())
                    .font(.sl(SL.TypeSize.micro, SL.Weight.semibold))
                    .tracking(1)
                    .foregroundStyle(eyebrowInk)
                    .lineLimit(1)
                Text(title)
                    .slBody(SL.Weight.semibold)
                    .foregroundStyle(SL.Ink.primary)
                    .lineLimit(2, reservesSpace: true)
                    .multilineTextAlignment(.leading)
                Text(detail)
                    .slMeta()
                    .slNumerals()
                    .foregroundStyle(SL.Ink.secondary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.85)
            }
        }
        .padding(SL.Space.s4)
        .frame(width: 164, alignment: .topLeading)
        .slBorderBox()
        .slListCard()
    }

    // MARK: - Lifts

    /// Four lifts, not all of them: the ones that gained most in the window
    /// (Apple Health's highlights, not its full log). Every lift is one tap
    /// further, as a list.
    private var liftsSection: some View {
        let all = allLifts
        return VStack(alignment: .leading, spacing: SL.Space.s3) {
            if all.count > 4 {
                sectionHead("Top lifts", action: "All \(all.count)") { open(.lifts) }
            } else {
                sectionHead("Lifts")
            }
            if !all.isEmpty {
                let columns = typeSize.isAccessibilitySize
                    ? [GridItem(.flexible())]
                    : [GridItem(.flexible(), spacing: SL.Space.s3), GridItem(.flexible(), spacing: SL.Space.s3)]
                LazyVGrid(columns: columns, spacing: SL.Space.s3) {
                    ForEach(all.prefix(4)) { lift in
                        liftTile(lift)
                    }
                }
            }
        }
    }

    /// A section's name with its one way further, on the right — the App
    /// Store's and Health's "See All".
    private func sectionHead(_ title: String, action: String? = nil, perform: @escaping () -> Void = {}) -> some View {
        HStack(alignment: .firstTextBaseline) {
            Text(title)
                .font(.sl(SL.TypeSize.title, SL.Weight.semibold))
                .foregroundStyle(SL.Ink.primary)
                .accessibilityAddTraits(.isHeader)
            Spacer(minLength: SL.Space.s2)
            if let action {
            Button(action: perform) {
                HStack(spacing: 2) {
                    Text(action).slBody()
                    SLGlyph(name: .chevronRight, size: 12)
                }
                .foregroundStyle(SL.Ink.secondary)
                .slHitTarget()
            }
            .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, SL.Space.s1)
    }

    /// Every lift once, its latest best, biggest gain first.
    private var allLifts: [ProgressOverview.DayProgress.Lift] {
        var seen: [String: ProgressOverview.DayProgress.Lift] = [:]
        for lift in days.flatMap(\.lifts) {
            if let kept = seen[lift.exerciseID], kept.date >= lift.date { continue }
            seen[lift.exerciseID] = lift
        }
        return seen.values.sorted { a, b in
            let da = a.deltaKg ?? -999, db = b.deltaKg ?? -999
            return da != db ? da > db : a.name < b.name
        }
    }

    private func changeInk(_ change: Decimal?) -> Color {
        guard let change else { return SL.Ink.secondary }
        return change > 0 ? SL.Signal.action : change < 0 ? SL.Signal.loss : SL.Ink.secondary
    }

    /// "+7 %", "Steady", or nothing while too early.
    private func changeText(_ change: Decimal?) -> String? {
        change.map { $0 == 0 ? "Steady" : "\(app.display.signedDelta($0)) %" }
    }

    // MARK: - All lifts

    /// Every lift as one quiet list, grouped by the day that trains it: a
    /// row each — the muscle, the name, the best set, what it gained. Rows,
    /// not cards, so twenty lifts read in one glance.
    private var allLiftsPage: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: SL.Space.s6) {
                ForEach(days.filter { !$0.lifts.isEmpty }) { day in
                    VStack(alignment: .leading, spacing: SL.Space.s2) {
                        HStack(spacing: SL.Space.s2) {
                            SLWorkoutSymbol(dayName: day.label, size: 14)
                                .foregroundStyle(SL.Ink.secondary)
                            Text(day.label)
                                .slLead(SL.Weight.semibold)
                                .foregroundStyle(SL.Ink.primary)
                            Spacer(minLength: SL.Space.s2)
                            if let change = changeText(day.changePercent) {
                                Text(change)
                                    .slMeta(SL.Weight.semibold)
                                    .slNumerals()
                                    .foregroundStyle(changeInk(day.changePercent))
                            }
                        }
                        .padding(.horizontal, SL.Space.s1)
                        .accessibilityElement(children: .combine)
                        .accessibilityAddTraits(.isHeader)

                        VStack(spacing: 0) {
                            ForEach(Array(day.lifts.enumerated()), id: \.element.id) { index, lift in
                                liftRow(lift)
                                    .overlay(alignment: .top) {
                                        if index > 0 { SLHairline().padding(.leading, 60) }
                                    }
                            }
                        }
                        .slBorderBox()
                        .slListCard()
                    }
                }
            }
            .padding(.horizontal, SL.Space.gutterSession)
            .padding(.top, SL.Space.s4)
            .padding(.bottom, SL.Space.s8)
        }
    }

    private func liftRow(_ lift: ProgressOverview.DayProgress.Lift) -> some View {
        Button { open(.kracht, exercise: lift.exerciseID) } label: {
            HStack(spacing: SL.Space.s3) {
                muscleChip(for: lift.exerciseID, lit: (lift.deltaKg ?? 0) > 0, size: 32)
                VStack(alignment: .leading, spacing: 1) {
                    Text(lift.name)
                        .slBody(SL.Weight.medium)
                        .foregroundStyle(SL.Ink.primary)
                        .lineLimit(1)
                    Text("\(app.display.kg(lift.weightKg)) × \(lift.reps)")
                        .slMeta()
                        .slNumerals()
                        .foregroundStyle(SL.Ink.secondary)
                }
                Spacer(minLength: SL.Space.s2)
                liftBadge(lift)
                SLGlyph(name: .chevronRight, size: 12).foregroundStyle(SL.Ink.tertiary)
            }
            .padding(.horizontal, SL.Space.s4)
            .frame(minHeight: 60)
            .contentShape(Rectangle())
        }
        .buttonStyle(SLRowButtonStyle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(
            "\(lift.name), best set \(app.display.kg(lift.weightKg)) × \(lift.reps)"
                + (lift.deltaKg.map { $0 == 0 ? ", no change" : ", \(app.display.signedDelta($0)) kilos estimated" } ?? (lift.isNew ? ", new" : ""))
        )
        .accessibilityHint("Opens the strength of this exercise")
    }

    private func muscleChip(for exerciseID: String, lit: Bool, size: CGFloat = 40) -> some View {
        SLGlyph(name: .muscle(ExerciseCatalog.exercise(exerciseID)?.group), size: size * 0.52, fixed: true)
            .foregroundStyle(lit ? SL.Signal.action : SL.Ink.primary)
            .frame(width: size, height: size)
            .background(
                RoundedRectangle(cornerRadius: size * 0.3, style: .continuous)
                    .fill(lit ? SL.Signal.actionTint : SL.Surface.raised2)
            )
    }

    private func liftTile(_ lift: ProgressOverview.DayProgress.Lift) -> some View {
        let group = ExerciseCatalog.exercise(lift.exerciseID)?.group
        let gained = (lift.deltaKg ?? 0) > 0
        return Button { open(.kracht, exercise: lift.exerciseID) } label: {
            VStack(alignment: .leading, spacing: SL.Space.s3) {
                HStack(alignment: .top) {
                    muscleChip(for: lift.exerciseID, lit: gained)
                    Spacer(minLength: SL.Space.s1)
                    liftBadge(lift)
                }
                VStack(alignment: .leading, spacing: 4) {
                    Text(lift.name)
                        .slMeta(SL.Weight.medium)
                        .foregroundStyle(SL.Ink.secondary)
                        .lineLimit(2, reservesSpace: true)
                        .multilineTextAlignment(.leading)
                    HStack(alignment: .firstTextBaseline, spacing: 3) {
                        Text(app.display.number(lift.weightKg))
                            .font(.sl(24, SL.Weight.semibold))
                            .foregroundStyle(SL.Ink.primary)
                        Text("kg × \(lift.reps)")
                            .slMeta()
                            .foregroundStyle(SL.Ink.secondary)
                    }
                    .slNumerals()
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                }
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .topLeading)
            .slBorderBox()
            .slListCard()
            .contentShape(RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous))
        }
        .buttonStyle(SLRowButtonStyle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(
            "\(lift.name)\(group.map { ", \($0.title)" } ?? ""), best set \(app.display.kg(lift.weightKg)) × \(lift.reps) on \(app.display.shortDate(lift.date))"
                + (lift.deltaKg.map { $0 == 0 ? ", no change" : ", \(app.display.signedDelta($0)) kilos estimated" } ?? (lift.isNew ? ", new" : ""))
        )
        .accessibilityHint("Opens the strength of this exercise")
    }

    /// "+5 kg" in lime, a loss in red, "New" in grey.
    @ViewBuilder
    private func liftBadge(_ lift: ProgressOverview.DayProgress.Lift) -> some View {
        if let delta = lift.deltaKg {
            let ink = delta > 0 ? SL.Signal.action : delta < 0 ? SL.Signal.loss : SL.Ink.secondary
            Text(delta == 0 ? "±0" : "\(app.display.signedDelta(delta)) kg")
                .font(.sl(SL.TypeSize.micro, SL.Weight.semibold))
                .slNumerals()
                .foregroundStyle(ink)
                .padding(.horizontal, SL.Space.s2)
                .padding(.vertical, 4)
                .background(Capsule().fill(delta > 0 ? SL.Signal.actionTint : delta < 0 ? SL.Signal.loss.opacity(0.12) : SL.Surface.raised2))
                .fixedSize()
        } else if lift.isNew {
            Text("New")
                .font(.sl(SL.TypeSize.micro, SL.Weight.semibold))
                .foregroundStyle(SL.Ink.secondary)
                .padding(.horizontal, SL.Space.s2)
                .padding(.vertical, 4)
                .background(Capsule().fill(SL.Surface.raised2))
                .fixedSize()
        }
    }

    /// Weighing in: one full-width button under the card's number. A day
    /// already weighed offers the correction rather than a second weigh-in.
    private var weighButton: some View {
        let weighed = app.weighIn() != nil
        return Button { weighing = true } label: {
            HStack(spacing: SL.Space.s2) {
                SLGlyph(name: weighed ? .calculate : .plus, size: 15)
                    .foregroundStyle(weighed ? SL.Ink.secondary : SL.Signal.recovery)
                Text(weighed ? "Edit today's weigh-in" : "Weigh in")
            }
            .lineLimit(1)
        }
        .buttonStyle(SLOutlineButtonStyle())
        .accessibilityHint(weighed
            ? "Opens today's weigh-in to update the weight"
            : "Opens the field to save today's weight")
    }

    /// How the 14-day average moved over the last fortnight; where the series
    /// is too short for that, how the weight itself moved over its own weeks.
    private var movement: (value: String, label: String, moved: Bool)? {
        if let last = trend.last,
           let earlier = trend.last(where: { $0.date <= last.date.addingTimeInterval(-14 * 86_400) }) {
            let change = Estimates.round(last.average - earlier.average, toIncrement: 0.1)
            return (signed(change), "in 14 days", change != 0)
        }
        if let change = bodyProgress.change {
            return (signed(change.value), change.weeks == 1 ? "in 1 week" : "in \(change.weeks) weeks", change.value != 0)
        }
        return nil
    }

    /// "−0,4 kg", "+0,3 kg", "0 kg".
    private func signed(_ value: Decimal) -> String {
        value == 0 ? "0 kg" : "\(app.display.signedDelta(value)) kg"
    }

    // MARK: - Volume

    private var volumeSection: some View {
        VStack(alignment: .leading, spacing: SL.Space.s3) {
            sectionHead("Volume")
            VStack(alignment: .leading, spacing: SL.Space.s5) {
                volumeStats
                VolumeBars(weeks: volume, spoken: volumeSpoken, label: tonnes)
                if let equivalent = volumeEquivalent {
                    HStack(spacing: SL.Space.s2) {
                        SLGlyph(name: .trendUp, size: 14, fixed: true)
                            .foregroundStyle(SL.Ink.secondary)
                        Text(equivalent)
                            .slMeta()
                            .foregroundStyle(SL.Ink.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .padding(.horizontal, SL.Space.s3)
                    .padding(.vertical, SL.Space.s2)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(
                        RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous)
                            .fill(SL.Surface.raised2)
                    )
                }
            }
            .padding(SL.Space.s5)
            .slBorderBox()
            .slListCard(radius: SL.Radius.xl)
        }
    }

    /// Three numbers side by side, as Strava's weekly snapshot: this week so
    /// far, last week, and the average of the weeks trained.
    @ViewBuilder
    private var volumeStats: some View {
        if let current = volume.last {
            let previous = volume.dropLast().last
            let trained = volume.dropLast().filter { $0.volumeKg > 0 }
            let average = trained.isEmpty ? nil : trained.reduce(Decimal(0)) { $0 + $1.volumeKg } / Decimal(trained.count)
            HStack(alignment: .top, spacing: 0) {
                stat("This week", tonnes(current.volumeKg), lead: true)
                if let previous { stat("Last week", tonnes(previous.volumeKg)) }
                if let average { stat("Average", tonnes(average)) }
            }
            .accessibilityElement(children: .combine)
        }
    }

    private func stat(_ label: String, _ value: String, lead: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .slMeta()
                .foregroundStyle(lead ? SL.Signal.action : SL.Ink.secondary)
            Text(value)
                .font(.sl(lead ? 28 : SL.TypeSize.title, SL.Weight.semibold))
                .slNumerals()
                .foregroundStyle(lead ? SL.Ink.primary : SL.Ink.secondary)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// "That's about 2 city buses moved": the tonnage made tangible.
    private var volumeEquivalent: String? {
        guard let week = volume.last(where: { $0.volumeKg > 0 }) else { return nil }
        let t = (week.volumeKg as NSDecimalNumber).doubleValue / 1000
        let things: [(one: String, many: String, tonnes: Double)] = [
            ("city bus", "city buses", 12),
            ("elephant", "elephants", 6),
            ("car", "cars", 1.5),
            ("grand piano", "grand pianos", 0.5),
        ]
        guard let thing = things.first(where: { t >= $0.tonnes }) else { return nil }
        let count = Int((t / thing.tonnes).rounded())
        let when = week.isCurrent ? "this week" : "last time"
        return count == 1
            ? "About one \(thing.one) moved \(when)"
            : "About \(count) \(thing.many) moved \(when)"
    }

    /// "9.4 t"
    private func tonnes(_ kg: Decimal) -> String {
        "\(app.display.number(Estimates.round(kg / 1000, toIncrement: 0.1))) t"
    }

    /// "week 35: 4,2 ton, week 36: 0 ton, …"
    private var volumeSpoken: String {
        volume.map { week in
            "week \(week.number): \(app.display.number(Estimates.round(week.volumeKg / 1000, toIncrement: 0.1))) ton"
        }
        .joined(separator: ", ")
    }

    // MARK: - One subject

    private func detail(_ current: Segment) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Button { segment = nil } label: {
                HStack(spacing: 2) {
                    SLGlyph(name: .chevronLeft, size: 18)
                    Text("Progress").slBody()
                }
                .foregroundStyle(SL.Ink.secondary)
                .frame(minHeight: SL.Space.hitMin)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .padding(.horizontal, SL.Space.s4)
            .padding(.top, SL.Space.s2)
            .accessibilityLabel("Back to Progress")

            // One page per subject, reached from the overview: the lift page
            // names itself in its header card; the others take a title.
            if current != .kracht {
                Text(current == .lichaam ? "Body weight" : current == .lifts ? "All lifts" : "Log")
                    .slTitle()
                    .foregroundStyle(SL.Ink.primary)
                    .accessibilityAddTraits(.isHeader)
                    .padding(.horizontal, SL.Space.gutterSession)
                    .padding(.top, SL.Space.s1)
            }

            switch current {
            case .kracht:
                StrengthSegmentView(opening: openingExercise)
            case .historiek:
                HistoriekSegmentView()
            case .lichaam:
                LichaamSegmentView()
            case .lifts:
                allLiftsPage
            }

            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

}

// MARK: - Charts

private func double(_ value: Decimal) -> Double {
    (value as NSDecimalNumber).doubleValue
}

/// Tonnage per week as bars. Finished weeks are quiet, this week is lime,
/// and last week's height waits as a dashed outline on this week's bar — the
/// bar to beat. A dashed line marks the average of the weeks trained.
struct VolumeBars: View {
    let weeks: [ProgressOverview.WeekVolume]
    let spoken: String
    let label: (Decimal) -> String

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    /// The bars rise from the baseline one after another as the card appears.
    @State private var grown = false

    private var average: Double? {
        let trained = weeks.filter { !$0.isCurrent && $0.volumeKg > 0 }.map { double($0.volumeKg) }
        return trained.isEmpty ? nil : trained.reduce(0, +) / Double(trained.count)
    }

    var body: some View {
        let previous = weeks.dropLast().last.map { double($0.volumeKg) } ?? 0
        let highest = max(weeks.map { double($0.volumeKg) }.max() ?? 0, 1)
        VStack(spacing: SL.Space.s2) {
            GeometryReader { proxy in
                let height = proxy.size.height
                ZStack(alignment: .bottomLeading) {
                    HStack(alignment: .bottom, spacing: 8) {
                        ForEach(Array(weeks.enumerated()), id: \.element.id) { index, week in
                            let shape = UnevenRoundedRectangle(
                                topLeadingRadius: SL.Radius.sm,
                                topTrailingRadius: SL.Radius.sm,
                                style: .continuous
                            )
                            ZStack(alignment: .bottom) {
                                if week.isCurrent, previous > 0 {
                                    shape
                                        .stroke(SL.Signal.action.opacity(0.55), style: StrokeStyle(lineWidth: 1.2, dash: [3, 3]))
                                        .frame(height: height * previous / highest)
                                }
                                shape
                                    .fill(week.isCurrent ? SL.Signal.action : SL.Ink.primary.opacity(week.volumeKg > 0 ? 0.16 : 0.08))
                                    // A week without a workout keeps a sliver, so
                                    // the row of weeks stays readable as a row.
                                    .frame(height: max(3, height * double(week.volumeKg) / highest))
                                    .scaleEffect(y: grown || reduceMotion ? 1 : 0.02, anchor: .bottom)
                                    .animation(.spring(response: 0.5, dampingFraction: 0.75).delay(0.1 + Double(index) * 0.05), value: grown)
                            }
                            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
                        }
                    }
                    if let average {
                        let y = height * (1 - average / highest)
                        Path { path in
                            path.move(to: CGPoint(x: 0, y: y))
                            path.addLine(to: CGPoint(x: proxy.size.width, y: y))
                        }
                        .stroke(SL.Ink.secondary.opacity(0.6), style: StrokeStyle(lineWidth: 1, dash: [2, 4]))

                    }
                }
                .onAppear { grown = true }
            }
            .frame(height: 112)
            .accessibilityElement()
            .accessibilityLabel(spoken)

            HStack(spacing: 8) {
                ForEach(weeks) { week in
                    Text(week.isCurrent ? "Now" : "w\(week.number)")
                        .font(.sl(SL.TypeSize.micro, week.isCurrent ? SL.Weight.semibold : SL.Weight.regular))
                        .slNumerals()
                        .foregroundStyle(week.isCurrent ? SL.Signal.action : SL.Ink.secondary)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                        .frame(maxWidth: .infinity)
                }
            }
            .accessibilityHidden(true)
        }
    }
}

/// A training day's running best as a full-width line over a faint fill,
/// drawing itself in on appear and ending on a ringed dot.
struct StrengthArea: View {
    let values: [Decimal]
    let ink: Color

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var drawn = false

    var body: some View {
        GeometryReader { proxy in
            let points = plotted(in: proxy.size)
            ZStack(alignment: .topLeading) {
                // Quiet guides at the start and the end height.
                ForEach([points.first, points.last].compactMap { $0 }.map(\.y), id: \.self) { y in
                    Path { path in
                        path.move(to: CGPoint(x: 0, y: y))
                        path.addLine(to: CGPoint(x: proxy.size.width, y: y))
                    }
                    .stroke(SL.Surface.hairlineStrong, style: StrokeStyle(lineWidth: 1, dash: [2, 4]))
                }
                Path { path in
                    guard let first = points.first, let last = points.last else { return }
                    path.move(to: CGPoint(x: first.x, y: proxy.size.height))
                    for point in points { path.addLine(to: point) }
                    path.addLine(to: CGPoint(x: last.x, y: proxy.size.height))
                    path.closeSubpath()
                }
                .fill(ink.opacity(0.08))
                .opacity(drawn || reduceMotion ? 1 : 0)
                .animation(.easeOut(duration: 0.6).delay(0.5), value: drawn)
                Path { path in
                    guard let first = points.first else { return }
                    path.move(to: first)
                    for point in points.dropFirst() { path.addLine(to: point) }
                }
                .trim(from: 0, to: drawn || reduceMotion ? 1 : 0)
                .stroke(ink, style: StrokeStyle(lineWidth: 2.5, lineCap: .round, lineJoin: .round))
                .animation(.easeInOut(duration: 0.9), value: drawn)
                if let first = points.first {
                    Circle()
                        .strokeBorder(SL.Ink.secondary, lineWidth: 1.5)
                        .background(Circle().fill(SL.Surface.raised))
                        .frame(width: 9, height: 9)
                        .position(first)
                }
                if let last = points.last {
                    Circle()
                        .fill(ink)
                        .frame(width: 11, height: 11)
                        .overlay(Circle().stroke(SL.Surface.raised, lineWidth: 2.5))
                        .scaleEffect(drawn || reduceMotion ? 1 : 0.01)
                        .animation(.spring(response: 0.4, dampingFraction: 0.6).delay(0.85), value: drawn)
                        .position(last)
                }
            }
        }
        .onAppear { drawn = true }
    }

    private func plotted(in size: CGSize) -> [CGPoint] {
        let numbers = values.map(double)
        guard numbers.count > 1, let low = numbers.min(), let high = numbers.max() else { return [] }
        let span = max(high - low, 1)
        let inset: CGFloat = 8
        return numbers.enumerated().map { index, value in
            CGPoint(
                x: inset + (size.width - 2 * inset) * CGFloat(index) / CGFloat(numbers.count - 1),
                y: inset + (size.height - 2 * inset) * CGFloat(1 - (value - low) / span)
            )
        }
    }
}

/// The 14-day average weight as a soft mint line over a faint fill, the
/// latest point marked.
struct WeightTrendLine: View {
    let points: [ProgressOverview.WeightPoint]

    var body: some View {
        GeometryReader { proxy in
            let plotted = plot(in: proxy.size)
            ZStack(alignment: .topLeading) {
                Path { path in
                    guard let first = plotted.first, let last = plotted.last else { return }
                    path.move(to: CGPoint(x: first.x, y: proxy.size.height))
                    for point in plotted { path.addLine(to: point) }
                    path.addLine(to: CGPoint(x: last.x, y: proxy.size.height))
                    path.closeSubpath()
                }
                .fill(SL.Signal.recovery.opacity(0.07))
                Path { path in
                    guard let first = plotted.first else { return }
                    path.move(to: first)
                    for point in plotted.dropFirst() { path.addLine(to: point) }
                }
                .stroke(SL.Signal.recovery, style: StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round))
                if let last = plotted.last {
                    Circle()
                        .fill(SL.Signal.recovery)
                        .frame(width: 9, height: 9)
                        .overlay(Circle().stroke(SL.Surface.raised, lineWidth: 2))
                        .position(last)
                }
            }
        }
        .accessibilityHidden(true)
    }

    private func plot(in size: CGSize) -> [CGPoint] {
        let values = points.map { double($0.average) }
        guard values.count > 1, let low = values.min(), let high = values.max() else { return [] }
        let span = max(high - low, 0.6)
        let mid = (high + low) / 2
        let inset: CGFloat = 6
        return values.enumerated().map { index, value in
            CGPoint(
                x: inset + (size.width - 2 * inset) * CGFloat(index) / CGFloat(values.count - 1),
                y: size.height / 2 - (size.height - 2 * inset) * CGFloat((value - mid) / span)
            )
        }
    }
}
