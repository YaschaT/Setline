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
        case volume = "Volume"

        var id: String { rawValue }
    }

    @Environment(AppState.self) private var app
    /// The avatar's way to Account, as on every tab.
    var onAccount: () -> Void = {}
    @Environment(\.dynamicTypeSize) private var typeSize
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /// The subject that is open. `nil` is the overview.
    @State private var segment: Segment?
    /// The exercise Kracht opens on, when a best-set row led there.
    @State private var openingExercise: String?
    @State private var weighing = false
    @State private var choosingGoal = false
    @State private var goal = GoalPreference.goal

    @State private var bodyProgress = BodyProgress.empty
    @State private var trend: [ProgressOverview.WeightPoint] = []
    /// The training day whose lifts are shown; `nil` is every lift.
    @State private var volume: [ProgressOverview.WeekVolume] = []
    @State private var days: [ProgressOverview.DayProgress] = []

    /// Strength by exercise: the lift on screen, its estimate series, and
    /// every exercise the selector offers.
    @State private var strengthID: String?
    @State private var strength: StrengthProgress?
    @State private var exerciseRows: [ExercisePicker.Row] = []
    /// Recently trained exercises that have an estimate to show: a chip
    /// that only leads to "no estimate" is a dead end.
    @State private var estimable: [ExercisePicker.Row] = []
    @State private var choosingExercise = false
    /// The weight chart's span, remembered on this phone.
    @AppStorage("setline.progress.weightRange") private var weightRange = WeightRange.month.rawValue

    enum WeightRange: Int, CaseIterable, Identifiable {
        case week = 7, month = 30, quarter = 90
        var id: Int { rawValue }
        var label: String { "\(rawValue)D" }
    }

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
        .sheet(isPresented: $choosingGoal) {
            GoalSheet(
                latestKg: bodyProgress.latest.map { NSDecimalNumber(decimal: $0.weightKg).doubleValue },
                onPick: { picked in
                    GoalPreference.goal = picked
                    goal = picked
                    choosingGoal = false
                    Task { await NutritionReminders.update(app: app) }
                },
                onClose: { choosingGoal = false }
            )
        }
        .sheet(isPresented: $choosingExercise) {
            ExercisePickerSheet(
                rows: exerciseRows,
                selected: strengthID,
                onPick: { row in
                    strengthID = row.exerciseID
                    choosingExercise = false
                    reloadStrength()
                },
                onStar: { row in
                    Task { await app.setFavorite(exerciseID: row.exerciseID, isFavorite: !row.isFavorite) }
                },
                onClose: { choosingExercise = false }
            )
        }
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
        // The headline percent speaks for the main lifts, as Quick progress does.
        days = ProgressOverview.progressByDay(in: app.sessions, since: since,
                                              counts: { StrengthHeadline.isMainLift($0, plan: app.plan) })
        volume = ProgressOverview.weeklyVolume(in: app.sessions)
        weekWins = computeWeekWins()
        exerciseRows = ExercisePicker.rows(sessions: app.sessions, favorites: app.favoriteExercises)
        estimable = ExercisePicker.recent(in: exerciseRows, limit: 16).filter { row in
            StrengthHeadline.progress(exerciseID: row.exerciseID, name: row.name, sessions: app.sessions, plan: app.plan).estimate != nil
        }
        .prefix(8).map { $0 }
        if strengthID == nil || !(exerciseRows.contains { $0.exerciseID == strengthID && $0.hasHistory }) {
            // The main lift that moved most — the same one Training leads
            // with — so the page opens on a gain, not on a dip.
            strengthID = StrengthHeadline.pick(rows: exerciseRows, sessions: app.sessions, plan: app.plan)?.exerciseID
                ?? estimable.first?.exerciseID
                ?? ExercisePicker.recent(in: exerciseRows, limit: 1).first?.exerciseID
        }
        // The lift the page opens on leads the chips, so its lit chip is in
        // view; the order then holds while chips are tapped.
        if let id = strengthID, let index = estimable.firstIndex(where: { $0.exerciseID == id }) {
            estimable.insert(estimable.remove(at: index), at: 0)
        }
        reloadStrength()
    }

    /// The comparable series the account has for the lift on screen: paused
    /// and touch-and-go, full and partial range never share a line.
    private func reloadStrength() {
        guard let id = strengthID, let row = exerciseRows.first(where: { $0.exerciseID == id }) else {
            strength = nil
            return
        }
        strength = StrengthHeadline.progress(exerciseID: id, name: row.name, sessions: app.sessions, plan: app.plan)
    }

    /// The chips: what was trained lately, newest first, and the lift on
    /// screen even when it came from the selector.
    private var recentExercises: [ExercisePicker.Row] {
        var recent = estimable
        if let id = strengthID, !recent.contains(where: { $0.exerciseID == id }),
           let row = exerciseRows.first(where: { $0.exerciseID == id }) {
            recent.insert(row, at: 0)
        }
        return recent
    }

    // MARK: - Overview

    private var overview: some View {
        ScrollView {
            // 24 between sections, 8 from a section's head to its card: the
            // gap says what belongs together.
            VStack(alignment: .leading, spacing: SL.Space.s8) {
                // Three cards, most looked-at first: the win (with the
                // week's medals under it), the number that moves every
                // morning, then what the lifts did (with the work behind
                // them as one line).
                // Four things, most looked-at first: the win, each lift's
                // strength, the scale, and every workout.
                highlightCard
                strengthSection
                weightSection
                logCard
            }
            .padding(.horizontal, SL.Space.gutterSession)
            .padding(.top, SL.Metric.tabContentTop)
            .padding(.bottom, SL.Space.s6)
        }
        .slTabHeader {
            SLTabHeader(title: "Progress", subtitle: "Last 8 weeks", onAccount: onAccount) {
                EmptyView()
            }
        }
    }

    /// Every logged workout, as a card right under the highlight: how many
    /// there are and the latest one, so it reads as the way in to all of them.
    private var logCard: some View {
        let workouts = app.sessions.filter { $0.kind == .workout }.sorted { $0.date > $1.date }
        return Button { open(.historiek) } label: {
            HStack(spacing: SL.Space.s3) {
                ZStack {
                    RoundedRectangle(cornerRadius: 12, style: .continuous).fill(SL.Signal.actionTint)
                    if let latest = workouts.first {
                        SLWorkoutSymbol(dayName: latest.dayLabel, size: 20)
                    } else {
                        SLGlyph(name: .list, size: 20).foregroundStyle(SL.Signal.action)
                    }
                }
                .frame(width: 44, height: 44)
                VStack(alignment: .leading, spacing: 2) {
                    Text("All workouts").slBody(SL.Weight.semibold).foregroundStyle(SL.Ink.primary)
                    Text(logLine(workouts))
                        .slMeta()
                        .slNumerals()
                        .foregroundStyle(SL.Ink.secondary)
                        .lineLimit(1)
                }
                Spacer(minLength: SL.Space.s2)
                Text("\(workouts.count)")
                    .slLead(SL.Weight.semibold)
                    .slNumerals()
                    .foregroundStyle(SL.Ink.primary)
                SLGlyph(name: .chevronRight, size: 14).foregroundStyle(SL.Ink.tertiary)
            }
            .padding(.horizontal, SL.Space.s4)
            .frame(minHeight: 68)
            .contentShape(Rectangle())
        }
        .buttonStyle(SLRowButtonStyle())
        .slBorderBox()
        .slListCard()
        .accessibilityElement(children: .combine)
        .accessibilityLabel("All workouts, \(workouts.count). \(logLine(workouts))")
        .accessibilityHint("Opens every logged session, to look back or edit one")
    }

    /// "Last: Push · Mon 5 Oct"
    private func logLine(_ workouts: [TrainingSession]) -> String {
        guard let latest = workouts.first else { return "Your logged sessions show up here" }
        return "Last: \(latest.dayLabel) · \(Schedule.weekdayLabel(latest.date)) \(app.display.shortDate(latest.date))"
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


    // MARK: - Strength by exercise

    /// One lift at a time: chips for what was trained lately, its estimated
    /// max, what that moved, and its line. "See all" opens the searchable
    /// selector; the card opens the lift's own page.
    private var strengthSection: some View {
        VStack(alignment: .leading, spacing: SL.Space.s3) {
            sectionHead("Strength", action: exerciseRows.contains(where: \.hasHistory) ? "See all" : nil) {
                choosingExercise = true
            }
            if recentExercises.isEmpty {
                Text("Log a workout and each lift's strength shows here.")
                    .slBody()
                    .foregroundStyle(SL.Ink.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(SL.Space.s5)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .slBorderBox()
                    .slListCard(radius: SL.Radius.xl)
            } else {
                exerciseChips
                strengthCard
                volumeLine
            }
        }
    }

    private var exerciseChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: SL.Space.s2) {
                ForEach(recentExercises) { row in
                    let on = row.exerciseID == strengthID
                    Button {
                        strengthID = row.exerciseID
                        reloadStrength()
                        UISelectionFeedbackGenerator().selectionChanged()
                    } label: {
                        Text(row.name)
                            .font(.sl(SL.TypeSize.meta, on ? SL.Weight.semibold : SL.Weight.medium))
                            .foregroundStyle(on ? SL.Signal.onAction : SL.Ink.primary)
                            .lineLimit(1)
                            .padding(.horizontal, SL.Space.s3)
                            .frame(height: 34)
                            .background(Capsule().fill(on ? SL.Signal.action : SL.Surface.raised))
                            .overlay(Capsule().strokeBorder(on ? Color.clear : SL.Surface.hairline, lineWidth: 1))
                            .frame(minHeight: SL.Space.hitMin)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(on ? [.isSelected, .isButton] : .isButton)
                }
            }
        }
        .padding(.horizontal, -SL.Space.gutterSession)
        .contentMargins(.horizontal, SL.Space.gutterSession, for: .scrollContent)
    }

    @ViewBuilder
    private var strengthCard: some View {
        if let progress = strength {
            Button { open(.kracht, exercise: progress.exerciseID) } label: {
                VStack(alignment: .leading, spacing: SL.Space.s3) {
                    Text("ESTIMATED 1RM")
                        .font(.sl(SL.TypeSize.micro, SL.Weight.semibold))
                        .tracking(1.2)
                        .foregroundStyle(SL.Ink.secondary)
                    if let estimate = progress.estimate {
                        HStack(alignment: .firstTextBaseline, spacing: SL.Space.s2) {
                            Text(app.display.kg(Estimates.round(estimate, toIncrement: 0.5)))
                                .font(.sl(34, SL.Weight.semibold))
                                .slNumerals()
                                .foregroundStyle(SL.Ink.primary)
                                .lineLimit(1)
                                .minimumScaleFactor(0.7)
                            Spacer(minLength: SL.Space.s2)
                            if let change = progress.change, let shown = progress.shownChange() {
                                Text(shown == 0 ? "Steady since \(app.display.shortDate(change.since))"
                                     : "\(app.display.signedDelta(shown)) kg since \(app.display.shortDate(change.since))")
                                    .font(.sl(SL.TypeSize.meta, SL.Weight.semibold))
                                    .slNumerals()
                                    .foregroundStyle(shown > 0 ? SL.Signal.action : SL.Ink.secondary)
                                    .padding(.horizontal, SL.Space.s3)
                                    .padding(.vertical, 5)
                                    .background(Capsule().fill(shown > 0 ? SL.Signal.actionTint : SL.Surface.raised2))
                                    .fixedSize()
                            }
                        }
                        if progress.points.count > 1 {
                            StrengthArea(values: progress.points.map(\.estimate), dates: progress.points.map(\.date), ink: SL.Signal.action)
                                .frame(height: 96)
                                .id(progress.exerciseID)
                                .accessibilityHidden(true)
                            HStack {
                                Text(progress.points.first.map { app.display.shortDate($0.date) } ?? "")
                                Spacer()
                                Text(progress.points.last.map { app.display.shortDate($0.date) } ?? "")
                            }
                            .slNumerals()
                            .font(.sl(SL.TypeSize.micro, SL.Weight.regular))
                            .foregroundStyle(SL.Ink.secondary)
                            .accessibilityHidden(true)
                        } else {
                            Text("One more session of \(progress.name) and its line appears.")
                                .slMeta()
                                .foregroundStyle(SL.Ink.secondary)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        if let source = progress.source {
                            Text("From \(app.display.kg(source.weightKg)) × \(source.reps) on \(app.display.shortDate(source.date))")
                                .slMeta()
                                .slNumerals()
                                .foregroundStyle(SL.Ink.secondary)
                        }
                    } else {
                        Text(progress.rows.isEmpty
                             ? "\(progress.name) has no full-range sets to compare yet."
                             : "Above 10 reps, SETLINE makes no estimate.")
                            .slBody()
                            .foregroundStyle(SL.Ink.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .padding(SL.Space.s5)
                .frame(maxWidth: .infinity, alignment: .leading)
                .slBorderBox()
                .slListCard(radius: SL.Radius.xl)
                .contentShape(Rectangle())
            }
            .buttonStyle(SLPressStyle(scale: 0.98))
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(strengthSpoken(progress))
            .accessibilityHint("Opens every session of this lift")
        }
    }

    private func strengthSpoken(_ progress: StrengthProgress) -> String {
        guard let estimate = progress.estimate else { return "\(progress.name), no estimate yet" }
        var text = "\(progress.name), estimated max \(app.display.kg(Estimates.round(estimate, toIncrement: 0.5)))"
        if let change = progress.change, let shown = progress.shownChange() {
            text += ", \(app.display.signedDelta(shown)) kilos since \(app.display.shortDate(change.since))"
        }
        return text
    }

    // MARK: - Body weight

    /// Body weight as a status beside the training: the number large, how the
    /// trend moved as a mint pill, the trend itself as one quiet line, and the
    /// one action. A weigh-in is not a training win, so nothing here is lime.
    private var weightSection: some View {
        VStack(alignment: .leading, spacing: SL.Space.s3) {
            sectionHead("Body weight", action: "See all") { open(.lichaam) }
            VStack(alignment: .leading, spacing: SL.Space.s4) {
                // Side by side at normal sizes; stacked once the text is large,
                // where the number and the button together outgrow the screen.
                let large = typeSize.isAccessibilitySize
                let head = large
                    ? AnyLayout(VStackLayout(alignment: .leading, spacing: SL.Space.s3))
                    : AnyLayout(HStackLayout(alignment: .center, spacing: SL.Space.s3))
                head {
                    Button { open(.lichaam) } label: { weightBody }
                        .buttonStyle(.plain)
                        .disabled(bodyProgress.entries.isEmpty)
                        .accessibilityHint(bodyProgress.entries.isEmpty ? "" : "Opens all your weigh-ins and the trend")
                    if !large { Spacer(minLength: 0) }
                    weighButton
                }
                if !bodyProgress.entries.isEmpty {
                    rangeTabs
                }
                if windowed.count >= 2 {
                    if let band = goalBand {
                        GoalBandChart(points: windowed, band: band)
                            .frame(height: 96)
                        HStack(spacing: 6) {
                            RoundedRectangle(cornerRadius: 2).fill(SL.Signal.action.opacity(0.25)).frame(width: 14, height: 8)
                            Text("\(band.goal.title) target")
                                .font(.sl(SL.TypeSize.micro, SL.Weight.regular))
                                .foregroundStyle(SL.Ink.secondary)
                            Spacer(minLength: 0)
                            Text("Your trend")
                                .font(.sl(SL.TypeSize.micro, SL.Weight.regular))
                                .foregroundStyle(SL.Signal.recovery)
                        }
                    } else {
                        WeightTrendLine(points: windowed)
                            .frame(height: 72)
                            .accessibilityHidden(true)
                    }
                    rangeAxis
                } else if !bodyProgress.entries.isEmpty {
                    Text(windowed.isEmpty
                         ? "No weigh-ins in the last \(weightRange) days."
                         : "One weigh-in in the last \(weightRange) days — one more draws the line.")
                        .slMeta()
                        .foregroundStyle(SL.Ink.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                goalBlock
            }
            .padding(SL.Space.s5)
            .slBorderBox()
            .slListCard(radius: SL.Radius.xl)
        }
    }

    /// The goal check, or the way to set one.
    @ViewBuilder
    private var goalBlock: some View {
        if let goal {
            let weighIns = GoalCheck.weighIns(bodyProgress)
            let check = GoalCheck.evaluate(goal: goal, weighIns: weighIns)
            let weeks = GoalCheck.weeksOnTrack(goal: goal, weighIns: weighIns)
            if !check.needsAction {
                goalLine(check, weeksOnTrack: weeks)
            } else {
                // Off track says why and what to do, in full.
                GoalCheckCard(check: check, weeksOnTrack: weeks, onChangeGoal: { choosingGoal = true })
            }
            goalInsights(goal)
        } else {
            Button { choosingGoal = true } label: {
                HStack(spacing: SL.Space.s3) {
                    Image(systemName: "scope")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(SL.Signal.action)
                        .frame(width: 34, height: 34)
                        .background(Circle().fill(SL.Signal.actionTint))
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Set a goal").slBody(SL.Weight.semibold).foregroundStyle(SL.Ink.primary)
                        Text("Cut, lean bulk or bulk — Setline tells you if you're on track")
                            .slMeta().foregroundStyle(SL.Ink.secondary).fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer(minLength: SL.Space.s2)
                    SLGlyph(name: .chevronRight, size: 12).foregroundStyle(SL.Ink.tertiary)
                }
                .padding(SL.Space.s3)
                .background(RoundedRectangle(cornerRadius: SL.Radius.lg, style: .continuous).fill(SL.Surface.raised2))
                .contentShape(Rectangle())
            }
            .buttonStyle(SLPressStyle(scale: 0.98))
        }
    }

    /// The goal in one line while there is nothing to act on: "Lean bulk ·
    /// On track · 🔥 3 wk". Tapping it opens the goal.
    private func goalLine(_ check: GoalCheck, weeksOnTrack: Int) -> some View {
        Button { choosingGoal = true } label: {
            HStack(spacing: SL.Space.s2) {
                Image(systemName: check.verdictSymbol)
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(check.verdictInk)
                Text(check.goal.title)
                    .font(.sl(SL.TypeSize.meta, SL.Weight.semibold))
                    .foregroundStyle(SL.Ink.primary)
                Text("·").foregroundStyle(SL.Ink.tertiary)
                Text(check.headline)
                    .font(.sl(SL.TypeSize.meta, SL.Weight.medium))
                    .foregroundStyle(check.verdictInk)
                    .lineLimit(1)
                Spacer(minLength: SL.Space.s2)
                if check.verdict == .onTrack, weeksOnTrack > 0 {
                    HStack(spacing: 3) {
                        SLGlyph(name: .flameFill, size: 12, fixed: true)
                        Text("\(weeksOnTrack) wk").font(.sl(SL.TypeSize.meta, SL.Weight.semibold)).slNumerals()
                    }
                    .foregroundStyle(SL.Signal.action)
                }
                SLGlyph(name: .chevronRight, size: 11).foregroundStyle(SL.Ink.tertiary)
            }
            .padding(.horizontal, SL.Space.s3)
            .frame(minHeight: SL.Space.hitMin)
            .background(RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous).fill(SL.Surface.raised2))
            .contentShape(Rectangle())
        }
        .buttonStyle(SLPressStyle(scale: 0.98))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(goalSpoken(check, weeksOnTrack: weeksOnTrack))
        .accessibilityHint("Opens your goal")
    }

    private func goalSpoken(_ check: GoalCheck, weeksOnTrack: Int) -> String {
        let said: String = check.verdict == .onTrack ? check.headline : check.detail(app.display)
        let weeks: String = check.verdict == .onTrack && weeksOnTrack > 0 ? ", \(weeksOnTrack) weeks on track" : ""
        return "\(check.goal.title): \(said)\(weeks)"
    }

    /// The goal's band from the day it was set, on the 14-day trend.
    private var goalBand: GoalBand? {
        guard let goal, let since = GoalPreference.since else { return nil }
        return GoalBand.make(goal: goal, since: since,
                             trend: trend.map { ($0.date, NSDecimalNumber(decimal: $0.average).doubleValue) })
    }

    /// Why the scale moves the way it does: what was eaten against the
    /// target, and — the sign a bulk is muscle — whether the lifts climb too.
    @ViewBuilder
    private func goalInsights(_ goal: WeightGoal) -> some View {
        let history = app.nutritionHistory()
        let food: String? = {
            guard history.logged.count >= 3, let average = history.averageCalories else { return nil }
            var line = "Avg \(app.display.whole(Decimal(average))) kcal"
            if let target = history.calorieTarget { line += " of \(app.display.whole(Decimal(target)))" }
            if history.calorieTarget != nil { line += " · protein hit \(history.daysProteinHit) of \(history.logged.count) days" }
            return line
        }()
        let lift = mainGainer(in: allLifts)
        if food != nil || lift != nil {
            VStack(alignment: .leading, spacing: SL.Space.s2) {
                if let food { insightRow("fork.knife", "Food, last 2 weeks", food) }
                if let lift, let delta = lift.deltaKg {
                    insightRow("dumbbell.fill", goal == .cut ? "Strength kept" : "Strength with it",
                               "\(lift.name) +\(app.display.number(delta)) kg estimated max")
                }
            }
        }
    }

    private func insightRow(_ symbol: String, _ title: String, _ value: String) -> some View {
        HStack(alignment: .top, spacing: SL.Space.s3) {
            Image(systemName: symbol)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(SL.Ink.secondary)
                .frame(width: 28, height: 28)
                .background(Circle().fill(SL.Surface.raised2))
            VStack(alignment: .leading, spacing: 1) {
                Text(title).font(.sl(SL.TypeSize.micro, SL.Weight.semibold)).foregroundStyle(SL.Ink.secondary)
                Text(value).slMeta().slNumerals().foregroundStyle(SL.Ink.primary).fixedSize(horizontal: false, vertical: true)
            }
        }
        .accessibilityElement(children: .combine)
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
        VStack(alignment: .leading, spacing: SL.Space.s1) {
            HStack(alignment: .firstTextBaseline, spacing: SL.Space.s1) {
                Text(bodyProgress.latest.map { app.display.number($0.weightKg) } ?? "—")
                    .font(.sl(SL.TypeSize.display, SL.Weight.semibold))
                    .slNumerals()
                    .foregroundStyle(SL.Ink.primary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                Text("kg")
                    .slBody()
                    .foregroundStyle(SL.Ink.secondary)
            }
            if let movement {
                movementPill(movement)
                if !lastWeighed.isEmpty {
                    Text(lastWeighed)
                        .slMeta()
                        .foregroundStyle(SL.Ink.secondary)
                        .lineLimit(1)
                        .padding(.top, 2)
                }
            } else if !lastWeighed.isEmpty {
                // The span under the tabs says why there is no change.
                Text(lastWeighed)
                    .slMeta()
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
                + (lastWeighed.isEmpty ? "" : ", \(lastWeighed.lowercased())")
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
        .minimumScaleFactor(0.7)
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
                        StrengthArea(values: day.strength, dates: day.strengthDates, ink: gained ? SL.Signal.action : SL.Ink.primary)
                            .frame(height: 88)
                        HStack {
                            Text(day.strengthDates.first.map { app.display.shortDate($0) } ?? "First session")
                            Spacer()
                            Text(day.strengthDates.last.map { app.display.shortDate($0) } ?? "Latest")
                        }
                        .slNumerals()
                        .font(.sl(SL.TypeSize.micro, SL.Weight.regular))
                        .foregroundStyle(SL.Ink.secondary)
                    }
                    .accessibilityHidden(true)
                }

                if let leader = mainGainer(in: day.lifts), let leaderDelta = leader.deltaKg {
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
                            Text("+\(app.display.number(leaderDelta)) kg")
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
                    .accessibilityLabel("Biggest gain: \(leader.name), plus \(app.display.number(leaderDelta)) kilos estimated")
                    .accessibilityHint("Opens the strength of this exercise")
                }

                SLHairline()
                weekStrip
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
                if !days.isEmpty {
                    SLHairline().padding(.vertical, SL.Space.s2)
                    weekStrip
                }
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
    @State private var weekWins: [Win] = []

    /// Worked out once per change of the log, not on every redraw.
    private func computeWeekWins() -> [Win] {
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

    /// This week's medals as the highlight card's last line: a row of small
    /// chips, each opening its lift, or one quiet line while there are none.
    private var weekStrip: some View {
        let wins = weekWins
        return VStack(alignment: .leading, spacing: SL.Space.s2) {
            HStack(alignment: .firstTextBaseline) {
                Text("THIS WEEK")
                    .font(.sl(SL.TypeSize.micro, SL.Weight.semibold))
                    .tracking(1.2)
                    .foregroundStyle(SL.Ink.secondary)
                Spacer(minLength: SL.Space.s2)
                if !wins.isEmpty {
                    Text(wins.count == 1 ? "1 win" : "\(wins.count) wins")
                        .slMeta()
                        .slNumerals()
                        .foregroundStyle(SL.Ink.secondary)
                }
            }
            if wins.isEmpty {
                HStack(spacing: SL.Space.s3) {
                    HStack(spacing: -8) {
                        ForEach([LiftMedal.Place.bronze, .silver, .gold], id: \.self) { place in
                            SLMedal(place: place, size: 22).saturation(0).opacity(0.35)
                        }
                    }
                    .accessibilityHidden(true)
                    Text("No medals yet. A lift's best day earns gold.")
                        .slMeta()
                        .foregroundStyle(SL.Ink.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            } else {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: SL.Space.s2) {
                        ForEach(wins) { win in winChip(win) }
                    }
                }
                .padding(.horizontal, -SL.Space.s5)
                .contentMargins(.horizontal, SL.Space.s5, for: .scrollContent)
            }
        }
    }

    @ViewBuilder
    private func winChip(_ win: Win) -> some View {
        switch win {
        case .medal(let medal):
            Button { open(.kracht, exercise: medal.exerciseID) } label: {
                chipFrame(title: medal.name, detail: "\(app.display.kg(medal.weightKg)) × \(medal.reps)") {
                    SLMedal(place: medal.place, size: 26, shines: medal.place == .gold)
                }
            }
            .buttonStyle(SLPressStyle(scale: 0.96))
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("\(medal.place.title) on \(medal.name), \(app.display.kg(medal.weightKg)) × \(medal.reps)")
            .accessibilityHint("Opens the strength of this exercise")
        case .badge(let milestone):
            chipFrame(title: milestone.title, detail: "New badge") {
                SLBadge(milestone: milestone, size: 28)
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("New badge: \(milestone.title)")
        case .streak(let streak):
            chipFrame(title: "Week secured", detail: streak.weeks == 1 ? "1-week streak" : "\(streak.weeks)-week streak") {
                SLGlyph(name: .flameFill, size: 14, fixed: true)
                    .foregroundStyle(SL.Signal.onAction)
                    .frame(width: 26, height: 26)
                    .background(Circle().fill(SL.Signal.action))
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Week secured, \(streak.weeks) week streak")
        }
    }

    private func chipFrame<Art: View>(title: String, detail: String, @ViewBuilder art: () -> Art) -> some View {
        HStack(spacing: SL.Space.s2) {
            art()
            VStack(alignment: .leading, spacing: 0) {
                Text(title)
                    .font(.sl(SL.TypeSize.meta, SL.Weight.semibold))
                    .foregroundStyle(SL.Ink.primary)
                Text(detail)
                    .font(.sl(SL.TypeSize.micro, SL.Weight.regular))
                    .slNumerals()
                    .foregroundStyle(SL.Ink.secondary)
            }
            .lineLimit(1)
        }
        .padding(.leading, SL.Space.s2)
        .padding(.trailing, SL.Space.s3)
        .frame(minHeight: SL.Space.hitMin)
        .background(Capsule().fill(SL.Surface.raised2))
        .contentShape(Capsule())
    }

    // MARK: - Lifts

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

    /// The main lift that gained most, by percent of where it started — the
    /// rule Quick progress and Strength use (`StrengthHeadline`), so a heavy
    /// machine or an isolation lift never takes the headline.
    private func mainGainer(in lifts: [ProgressOverview.DayProgress.Lift]) -> ProgressOverview.DayProgress.Lift? {
        func percent(_ lift: ProgressOverview.DayProgress.Lift) -> Decimal {
            guard let delta = lift.deltaKg, delta > 0,
                  let estimate = Estimates.e1RM(weightKg: lift.weightKg, reps: lift.reps), estimate > delta
            else { return 0 }
            return delta / (estimate - delta)
        }
        return lifts
            .filter { ($0.deltaKg ?? 0) > 0 && StrengthHeadline.isMainLift($0.exerciseID, plan: app.plan) }
            .max { (percent($0), $0.name) < (percent($1), $1.name) }
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
        MuscleFigure(
            group: ExerciseCatalog.exercise(exerciseID)?.group,
            highlight: lit ? SL.Signal.action : SL.Ink.primary,
            outline: SL.Ink.secondary.opacity(0.8)
        )
        .padding(size * 0.09)
        .frame(width: size, height: size)
        .background(
            RoundedRectangle(cornerRadius: size * 0.3, style: .continuous)
                .fill(lit ? SL.Signal.actionTint : SL.Surface.raised2)
        )
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
            HStack(spacing: 6) {
                SLGlyph(name: weighed ? .calculate : .plus, size: 14, fixed: true)
                    .foregroundStyle(weighed ? SL.Ink.secondary : SL.Signal.recovery)
                Text(weighed ? "Edit" : "Weigh in")
                    .font(.sl(SL.TypeSize.body, SL.Weight.semibold))
                    .foregroundStyle(SL.Ink.primary)
            }
            .lineLimit(1)
            .padding(.horizontal, SL.Space.s4)
            .frame(minHeight: SL.Space.hitMin)
            .background(Capsule().fill(SL.Surface.raised2))
            .overlay(Capsule().strokeBorder(SL.Surface.hairlineStrong, lineWidth: SL.Metric.border))
            .contentShape(Capsule())
            .fixedSize()
        }
        .buttonStyle(SLPressStyle(scale: 0.94))
        .accessibilityLabel(weighed ? "Edit today's weigh-in" : "Weigh in")
        .accessibilityHint(weighed
            ? "Opens today's weigh-in to update the weight"
            : "Opens the field to save today's weight")
    }

    /// How the 14-day average moved over the last fortnight; where the series
    /// is too short for that, how the weight itself moved over its own weeks.
    private var movement: (value: String, label: String, moved: Bool)? {
        // First to last weigh-in inside the chosen span; days without one
        // are simply not on the line.
        guard let first = windowed.first, let last = windowed.last, windowed.count >= 2 else { return nil }
        let change = Estimates.round(last.weightKg - first.weightKg, toIncrement: 0.1)
        return (signed(change), "in \(weightRange) days", change != 0)
    }

    /// The weigh-ins inside the chosen span, oldest first, plotted as they
    /// were weighed.
    private var windowed: [ProgressOverview.WeightPoint] {
        let start = Calendar.current.startOfDay(for: Date()).addingTimeInterval(-Double(weightRange - 1) * 86_400)
        return trend.filter { $0.date >= start }
            .map { ProgressOverview.WeightPoint(date: $0.date, weightKg: $0.weightKg, average: $0.weightKg) }
    }

    /// 7D · 30D · 90D, as a small segmented control.
    private var rangeTabs: some View {
        HStack(spacing: 2) {
            ForEach(WeightRange.allCases) { range in
                let on = weightRange == range.rawValue
                Button {
                    withAnimation(.snappy(duration: 0.2)) { weightRange = range.rawValue }
                    UISelectionFeedbackGenerator().selectionChanged()
                } label: {
                    Text(range.label)
                        .font(.sl(SL.TypeSize.meta, on ? SL.Weight.semibold : SL.Weight.medium))
                        .slNumerals()
                        .foregroundStyle(on ? SL.Ink.primary : SL.Ink.secondary)
                        .frame(maxWidth: .infinity, minHeight: 30)
                        .background(Capsule().fill(on ? SL.Surface.raised : .clear))
                        .frame(minHeight: SL.Space.hitMin)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("\(range.rawValue) days")
                .accessibilityAddTraits(on ? [.isSelected, .isButton] : .isButton)
            }
        }
        .padding(.horizontal, 3)
        .background(Capsule().fill(SL.Surface.raised2).frame(height: 36))
    }

    /// The span's two ends under the chart, and between them the range the
    /// line covers — so its slope can be read in kilos, not guessed.
    private var rangeAxis: some View {
        let weights = windowed.map(\.weightKg)
        return HStack {
            Text(windowed.first.map { app.display.shortDate($0.date) } ?? "")
            Spacer()
            if let low = weights.min(), let high = weights.max() {
                Text(low == high ? app.display.kg(low) : "\(app.display.number(low))–\(app.display.number(high)) kg")
                    .foregroundStyle(SL.Ink.primary)
            }
            Spacer()
            Text(windowed.last.map { app.display.shortDate($0.date) } ?? "")
        }
        .slNumerals()
        .font(.sl(SL.TypeSize.micro, SL.Weight.regular))
        .foregroundStyle(SL.Ink.secondary)
        .accessibilityHidden(true)
    }

    /// "−0,4 kg", "+0,3 kg", "0 kg".
    private func signed(_ value: Decimal) -> String {
        value == 0 ? "0 kg" : "\(app.display.signedDelta(value)) kg"
    }

    // MARK: - Volume

    /// The work behind the lifts, as one line under them; the bars are a tap
    /// away.
    @ViewBuilder
    private var volumeLine: some View {
        if let current = volume.last {
            let byNow = volumeLastWeekByNow
            Button { open(.volume) } label: {
                HStack(spacing: SL.Space.s3) {
                    Image(systemName: "chart.bar.fill")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(SL.Ink.secondary)
                        .frame(width: 36, height: 36)
                        .background(RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous).fill(SL.Surface.raised2))
                    VStack(alignment: .leading, spacing: 1) {
                        Text("Volume this week")
                            .slMeta()
                            .foregroundStyle(SL.Ink.secondary)
                        // Against last week at this same point, not its whole
                        // total: on a Monday morning "0 t vs 12.6 t" only
                        // says the week has just begun.
                        HStack(alignment: .firstTextBaseline, spacing: SL.Space.s2) {
                            if current.volumeKg > 0 || byNow > 0 {
                                Text(tonnes(current.volumeKg))
                                    .slBody(SL.Weight.semibold)
                                    .slNumerals()
                                    .foregroundStyle(SL.Ink.primary)
                                Text("\(tonnes(byNow)) by now last week")
                                    .slMeta()
                                    .slNumerals()
                                    .foregroundStyle(SL.Ink.secondary)
                            } else {
                                Text("Starts with this week's first workout")
                                    .slMeta()
                                    .foregroundStyle(SL.Ink.secondary)
                            }
                        }
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                    }
                    Spacer(minLength: SL.Space.s2)
                    SLGlyph(name: .chevronRight, size: 12).foregroundStyle(SL.Ink.tertiary)
                }
                .padding(SL.Space.s3)
                .contentShape(Rectangle())
                .slBorderBox()
                .slListCard()
            }
            .buttonStyle(SLPressStyle(scale: 0.98))
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Volume this week \(tonnes(current.volumeKg)), \(tonnes(byNow)) by this point last week")
            .accessibilityHint("Opens the weekly volume")
        }
    }

    private var volumeCard: some View {
        VStack(alignment: .leading, spacing: SL.Space.s3) {
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
                .foregroundStyle(SL.Ink.secondary)
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

    /// What last week had lifted by this same moment of its week.
    private var volumeLastWeekByNow: Decimal {
        let weekStart = Schedule.mondayFirstWeek(containing: Date()).first.map { Calendar.current.startOfDay(for: $0) } ?? Date()
        let lastWeekStart = weekStart.addingTimeInterval(-7 * 86_400)
        let sameMoment = Date().addingTimeInterval(-7 * 86_400)
        return app.sessions
            .filter { $0.kind == .workout && $0.date >= lastWeekStart && $0.date <= sameMoment }
            .reduce(Decimal(0)) { $0 + RecordsEngine.volumeLoad($1.results.flatMap(\.sets)) }
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
                Text(current == .lichaam ? "Body weight" : current == .lifts ? "All lifts" : current == .volume ? "Volume" : "Log")
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
            case .volume:
                ScrollView {
                    volumeCard
                        .padding(.horizontal, SL.Space.gutterSession)
                        .padding(.vertical, SL.Space.s4)
                }
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
    /// When given, points sit on time; otherwise evenly, one per session.
    var dates: [Date] = []
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
        let onTime = dates.count == numbers.count
            && (dates.last ?? .distantPast).timeIntervalSince(dates.first ?? .distantPast) > 0
        let start = dates.first?.timeIntervalSince1970 ?? 0
        let length = max((dates.last?.timeIntervalSince1970 ?? 1) - start, 1)
        return numbers.enumerated().map { index, value in
            let fraction = onTime
                ? CGFloat((dates[index].timeIntervalSince1970 - start) / length)
                : CGFloat(index) / CGFloat(numbers.count - 1)
            return CGPoint(
                x: inset + (size.width - 2 * inset) * fraction,
                y: inset + (size.height - 2 * inset) * CGFloat(1 - (value - low) / span)
            )
        }
    }
}

/// The 14-day average weight as a soft mint line over a faint fill, the
/// latest point marked.
/// The 14-day trend over the goal's band: the band in faint lime from the
/// day the goal was set, the trend in mint, and the latest point.
struct GoalBandChart: View {
    let allPoints: [ProgressOverview.WeightPoint]
    let band: GoalBand
    /// Half the band's least width: a day's water and salt, so a band that
    /// starts at one weight still reads as a band.
    private let margin = 0.25

    init(points: [ProgressOverview.WeightPoint], band: GoalBand) {
        allPoints = points
        self.band = band
    }

    /// From a week before the goal was set; all of it when that is too little.
    private var points: [ProgressOverview.WeightPoint] {
        let recent = allPoints.filter { $0.date >= band.start.addingTimeInterval(-7 * 86_400) }
        return recent.count >= 2 ? recent : allPoints
    }

    var body: some View {
        GeometryReader { proxy in
            let size = proxy.size
            let values = points.map { NSDecimalNumber(decimal: $0.average).doubleValue }
            let first = points.first?.date ?? band.start
            // A young goal gets the week ahead drawn in, so its band is a
            // stretch to aim for rather than a sliver at the edge.
            let last = max(points.last?.date ?? Date(), Date(), band.start.addingTimeInterval(7 * 86_400))
            let bandDays = stride(from: max(first, band.start).timeIntervalSince1970, through: last.timeIntervalSince1970, by: 86_400)
                .map { Date(timeIntervalSince1970: $0) }
            let ranges = bandDays.map { day -> ClosedRange<Double> in
                let range = band.range(on: day)
                return (range.lowerBound - margin)...(range.upperBound + margin)
            }
            let low = min(values.min() ?? 0, ranges.map(\.lowerBound).min() ?? .infinity) - 0.2
            let high = max(values.max() ?? 0, ranges.map(\.upperBound).max() ?? -.infinity) + 0.2
            let span = max(high - low, 0.6)
            let total = max(last.timeIntervalSince(first), 1)
            let x = { (date: Date) in CGFloat(date.timeIntervalSince(first) / total) * size.width }
            let y = { (kg: Double) in size.height - CGFloat((kg - low) / span) * size.height }
            ZStack(alignment: .topLeading) {
                Path { path in
                    guard !bandDays.isEmpty else { return }
                    path.move(to: CGPoint(x: x(bandDays[0]), y: y(ranges[0].upperBound)))
                    for (day, range) in zip(bandDays, ranges) { path.addLine(to: CGPoint(x: x(day), y: y(range.upperBound))) }
                    for (day, range) in zip(bandDays, ranges).reversed() { path.addLine(to: CGPoint(x: x(day), y: y(range.lowerBound))) }
                    path.closeSubpath()
                }
                .fill(SL.Signal.action.opacity(0.16))
                .overlay(
                    Path { path in
                        guard let day = bandDays.first else { return }
                        path.move(to: CGPoint(x: x(day), y: 0))
                        path.addLine(to: CGPoint(x: x(day), y: size.height))
                    }
                    .stroke(SL.Signal.action.opacity(0.4), style: StrokeStyle(lineWidth: 1, dash: [3, 3]))
                )
                Path { path in
                    for (index, point) in points.enumerated() {
                        let p = CGPoint(x: x(point.date), y: y(values[index]))
                        if index == 0 { path.move(to: p) } else { path.addLine(to: p) }
                    }
                }
                .stroke(SL.Signal.recovery, style: StrokeStyle(lineWidth: 2.5, lineCap: .round, lineJoin: .round))
                if let point = points.last, let value = values.last {
                    Circle()
                        .fill(SL.Signal.recovery)
                        .frame(width: 10, height: 10)
                        .overlay(Circle().stroke(SL.Surface.raised, lineWidth: 2))
                        .position(x: x(point.date), y: y(value))
                }
            }
        }
        .accessibilityElement()
        .accessibilityLabel("Weight trend against your \(band.goal.title.lowercased()) band")
    }
}

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
        let start = points.first?.date.timeIntervalSince1970 ?? 0
        let length = (points.last?.date.timeIntervalSince1970 ?? 0) - start
        return values.enumerated().map { index, value in
            // On time, so days without a weigh-in keep their width.
            let fraction = length > 0
                ? CGFloat((points[index].date.timeIntervalSince1970 - start) / length)
                : CGFloat(index) / CGFloat(values.count - 1)
            return CGPoint(
                x: inset + (size.width - 2 * inset) * fraction,
                y: size.height / 2 - (size.height - 2 * inset) * CGFloat((value - mid) / span)
            )
        }
    }
}
