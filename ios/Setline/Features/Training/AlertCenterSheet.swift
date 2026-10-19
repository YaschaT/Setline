import SwiftUI
import SetlineCore

/// What the bell holds, read from the account: things to do, and this week's
/// wins. Only the to-dos count on the bell — wins are good news, never a chore.
@MainActor
enum Alerts {
    struct Todo: Identifiable {
        enum Kind { case paused, missed(AgendaDay, WorkoutDay), meals([String]), weighIn(days: Int) }
        let id: String
        let kind: Kind
    }

    struct Win: Identifiable {
        enum Kind { case badge(Milestone), medal(LiftMedal), week(TrainingStreak) }
        let id: String
        let kind: Kind
    }

    private static let seenWinsKey = "setline.alerts.seenWins"

    static func todos(_ app: AppState, now: Date = Date()) -> [Todo] {
        var list: [Todo] = []
        if let paused = app.resumableSession {
            list.append(Todo(id: "paused-\(paused.dayID)", kind: .paused))
        }
        for day in app.missedDays {
            if let workout = day.plannedDay { list.append(Todo(id: "missed-\(day.key)", kind: .missed(day, workout))) }
        }
        // Meals: only for someone who logs food — logged in the last week,
        // or meal reminders on — and only windows whose reminder time passed.
        let weekAgo = Schedule.dateKey(now.addingTimeInterval(-7 * 86_400))
        let tracksFood = NutritionReminders.mealsOn || app.nutritionEntries.contains { $0.date >= weekAgo }
        if tracksFood {
            let calendar = Calendar.current
            let hour = calendar.component(.hour, from: now), minute = calendar.component(.minute, from: now)
            let open = MealWindow.all.filter { window in
                (hour, minute) >= (window.remindAt.hour, window.remindAt.minute)
                    && !window.isLogged(in: app.nutritionEntries, on: now)
            }
            if !open.isEmpty { list.append(Todo(id: "meals-\(Schedule.dateKey(now))", kind: .meals(open.map(\.label)))) }
        }
        // A weigh-in: for someone who weighs in, after three days without one.
        if let last = BodyProgress.make(metrics: app.metrics).latest?.date {
            let days = Calendar.current.dateComponents([.day], from: Calendar.current.startOfDay(for: last),
                                                       to: Calendar.current.startOfDay(for: now)).day ?? 0
            if days >= 3, days <= 30 { list.append(Todo(id: "weigh-\(Schedule.dateKey(now))", kind: .weighIn(days: days))) }
        }
        return list
    }

    static func wins(_ app: AppState, now: Date = Date()) -> [Win] {
        let weekStart = Schedule.mondayFirstWeek(containing: now).first.map { Calendar.current.startOfDay(for: $0) } ?? now
        var list: [Win] = []
        let badges = Milestones.reached(in: Milestones.make(sessions: app.sessions, bestStreak: app.streak.best) + app.habitMilestones(),
                                        since: weekStart)
        // Two steps of one ladder in a week are one piece of news: the higher.
        var top: [Milestone.Kind: Milestone] = [:]
        for badge in badges where badge.target >= (top[badge.kind]?.target ?? -1) { top[badge.kind] = badge }
        list += top.values.sorted { $0.tier > $1.tier }.map { Win(id: "badge-\($0.id)", kind: .badge($0)) }
        if app.streak.thisWeekMet { list.append(Win(id: "week-\(Schedule.dateKey(weekStart))", kind: .week(app.streak))) }
        var golds: [String: LiftMedal] = [:]
        for session in app.sessions where session.kind == .workout && session.date >= weekStart {
            for medal in Medals.medals(for: session, in: app.sessions) where medal.place == .gold {
                golds[medal.exerciseID] = medal
            }
        }
        list += golds.values.sorted { $0.name < $1.name }.map { Win(id: "gold-\($0.exerciseID)-\(Schedule.dateKey(weekStart))", kind: .medal($0)) }
        return list
    }

    /// A win not yet seen in the sheet: the bell's lime dot.
    static func hasNewWins(_ app: AppState) -> Bool {
        let seen = Set(UserDefaults.standard.stringArray(forKey: seenWinsKey) ?? [])
        return wins(app).contains { !seen.contains($0.id) }
    }

    static func markWinsSeen(_ app: AppState) {
        let seen = Set(UserDefaults.standard.stringArray(forKey: seenWinsKey) ?? [])
        UserDefaults.standard.set(Array(seen.union(wins(app).map(\.id)).suffix(200)), forKey: seenWinsKey)
    }
}

/// Alerts: what needs you, then what you earned this week. Opened from the
/// bell on Training.
///
/// A missed workout asks one question with two answers: `Log it now` writes it
/// down for that date; `Didn't train` closes the question on this phone and
/// changes nothing in the account — SETLINE never moves or marks a day itself.
struct AlertCenterSheet: View {
    @Environment(AppState.self) private var app
    @Environment(\.dynamicTypeSize) private var typeSize

    let onLogPast: (WorkoutDay, Date) -> Void
    var onResume: () -> Void = {}
    var onNutrition: () -> Void = {}
    var onProgress: () -> Void = {}
    let onClose: () -> Void

    var body: some View {
        let todos = Alerts.todos(app)
        let wins = Alerts.wins(app)
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Alerts")
                        .slTitle()
                        .foregroundStyle(SL.Ink.primary)
                        .accessibilityAddTraits(.isHeader)
                    Text(todos.isEmpty ? "Nothing needs you" : todos.count == 1 ? "1 thing to do" : "\(todos.count) things to do")
                        .slBody()
                        .foregroundStyle(SL.Ink.secondary)
                }
                Spacer()
                Button("Done", action: onClose)
                    .font(.sl(SL.TypeSize.body, SL.Weight.medium))
                    .foregroundStyle(SL.Ink.secondary)
                    .slHitTarget()
            }
            .padding(.horizontal, SL.Space.gutterSession)
            .padding(.top, SL.Space.s5)
            .padding(.bottom, SL.Space.s4)

            ScrollView {
                VStack(alignment: .leading, spacing: SL.Space.s6) {
                    section("To do") {
                        if todos.isEmpty {
                            HStack(spacing: SL.Space.s3) {
                                SLGlyph(name: .check, size: 16, fixed: true)
                                    .foregroundStyle(SL.Signal.action)
                                    .frame(width: 36, height: 36)
                                    .background(Circle().fill(SL.Signal.actionTint))
                                Text("All caught up — workouts, meals and weigh-ins.")
                                    .slBody().foregroundStyle(SL.Ink.secondary)
                                    .fixedSize(horizontal: false, vertical: true)
                                Spacer(minLength: 0)
                            }
                            .padding(SL.Space.s4)
                        } else {
                            ForEach(Array(todos.enumerated()), id: \.element.id) { index, todo in
                                todoRow(todo).overlay(alignment: .top) { if index > 0 { SLHairline() } }
                            }
                        }
                    }

                    if !wins.isEmpty {
                        section("This week's wins") {
                            ForEach(Array(wins.enumerated()), id: \.element.id) { index, win in
                                winRow(win).overlay(alignment: .top) { if index > 0 { SLHairline() } }
                            }
                        }
                    }
                }
                .padding(.horizontal, SL.Space.gutterSession)
                .padding(.bottom, SL.Space.s6)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(SL.Surface.ground.ignoresSafeArea())
        .onAppear { Alerts.markWinsSeen(app) }
        .slRespondsToTextSize()
    }

    private func section<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: SL.Space.s2) {
            SLOverline(text: title).padding(.leading, SL.Space.s1).accessibilityAddTraits(.isHeader)
            VStack(spacing: 0) { content() }
                .slBorderBox()
                .slListCard()
        }
    }

    // MARK: - To do

    @ViewBuilder
    private func todoRow(_ todo: Alerts.Todo) -> some View {
        switch todo.kind {
        case .paused:
            let name = app.resumableSession.flatMap { app.day(for: $0)?.short } ?? "Your workout"
            line(icon: Image(systemName: "pause.fill"), tint: SL.Signal.attention,
                 title: "\(name) is paused", detail: "\(app.resumableSession?.loggedSetCount ?? 0) sets logged so far",
                 action: "Resume", perform: onResume)
        case .missed(let day, let workout):
            missedRow(day, workout)
        case .meals(let labels):
            line(icon: Image(systemName: "fork.knife"), tint: SL.Signal.attention,
                 title: labels.count == 1 ? "\(labels[0]) not logged" : "\(labels.joined(separator: ", ")) not logged",
                 detail: "Today", action: "Log food", perform: onNutrition)
        case .weighIn(let days):
            line(icon: Image(systemName: "scalemass"), tint: SL.Signal.recovery,
                 title: "Time to weigh in", detail: "Last one \(days) days ago", action: "Weigh in", perform: onProgress)
        }
    }

    private func line(icon: Image, tint: Color, title: String, detail: String, action: String, perform: @escaping () -> Void) -> some View {
        let layout = typeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: SL.Space.s3))
            : AnyLayout(HStackLayout(alignment: .center, spacing: SL.Space.s3))
        return layout {
            HStack(spacing: SL.Space.s3) {
                icon.font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(tint)
                    .frame(width: 36, height: 36)
                    .background(Circle().fill(tint.opacity(0.14)))
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).slBody(SL.Weight.semibold).foregroundStyle(SL.Ink.primary)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(detail).slMeta().slNumerals().foregroundStyle(SL.Ink.secondary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .accessibilityElement(children: .combine)
            primary(action, perform: perform)
        }
        .padding(.horizontal, SL.Space.s4)
        .padding(.vertical, SL.Space.s2)
    }

    private func primary(_ title: String, perform: @escaping () -> Void) -> some View {
        Button(action: perform) {
            Text(title)
                .font(.sl(SL.TypeSize.meta, SL.Weight.semibold))
                .foregroundStyle(SL.Signal.onAction)
                .padding(.horizontal, SL.Space.s3)
                .frame(minHeight: 32)
                .background(Capsule().fill(SL.Signal.action))
                .frame(minHeight: SL.Space.hitMin)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .fixedSize()
    }

    private func missedRow(_ day: AgendaDay, _ workout: WorkoutDay) -> some View {
        let when = "\(WeekPlan.fullWeekday(day.date).prefix(2).lowercased()) \(app.display.shortDate(day.date))"
        let layout = typeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: SL.Space.s3))
            : AnyLayout(HStackLayout(alignment: .center, spacing: SL.Space.s3))
        return layout {
            HStack(spacing: SL.Space.s3) {
                SLWorkoutSymbol(dayName: workout.short, size: 17)
                    .foregroundStyle(SL.Ink.primary)
                    .frame(width: 36, height: 36)
                    .background(Circle().fill(SL.Surface.raised2))
                VStack(alignment: .leading, spacing: 2) {
                    Text("\(workout.short) not logged").slBody(SL.Weight.semibold).foregroundStyle(SL.Ink.primary)
                    Text(when).slMeta().slNumerals().foregroundStyle(SL.Ink.secondary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel("\(workout.short), \(WeekPlan.fullWeekday(day.date)) \(app.display.shortDate(day.date)), not logged")

            HStack(spacing: SL.Space.s2) {
                Button { app.answerMissed(day.key) } label: {
                    Text("Didn't train")
                        .font(.sl(SL.TypeSize.meta, SL.Weight.regular))
                        .foregroundStyle(SL.Ink.secondary)
                        .padding(.horizontal, SL.Space.s2)
                        .slHitTarget()
                }
                .buttonStyle(.plain)
                .accessibilityHint("Closes this alert. Nothing changes in your account.")
                primary("Log it") { onLogPast(workout, day.date) }
                    .accessibilityHint("Logs \(workout.short) for \(Agenda.when(day.date))")
            }
            .fixedSize()
        }
        .padding(.horizontal, SL.Space.s4)
        .padding(.vertical, SL.Space.s2)
    }

    // MARK: - Wins

    @ViewBuilder
    private func winRow(_ win: Alerts.Win) -> some View {
        switch win.kind {
        case .badge(let milestone):
            winLine(art: AnyView(SLBadge(milestone: milestone, size: 40)), title: "New badge: \(milestone.title)",
                    detail: milestone.howTo)
        case .medal(let medal):
            winLine(art: AnyView(SLMedal(place: .gold, size: 34)), title: "Best ever on \(medal.name)",
                    detail: "\(app.display.kg(medal.weightKg)) × \(medal.reps)")
        case .week(let streak):
            winLine(art: AnyView(
                SLGlyph(name: .flameFill, size: 16, fixed: true)
                    .foregroundStyle(SL.Signal.onAction)
                    .frame(width: 36, height: 36)
                    .background(Circle().fill(SL.Signal.action))
            ), title: "Week secured", detail: streak.weeks == 1 ? "Your streak has started" : "\(streak.weeks) weeks in a row")
        }
    }

    private func winLine(art: AnyView, title: String, detail: String) -> some View {
        HStack(spacing: SL.Space.s3) {
            art.frame(width: 44, height: 44)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).slBody(SL.Weight.semibold).foregroundStyle(SL.Ink.primary)
                    .fixedSize(horizontal: false, vertical: true)
                Text(detail).slMeta().slNumerals().foregroundStyle(SL.Ink.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, SL.Space.s4)
        .padding(.vertical, SL.Space.s3)
        .accessibilityElement(children: .combine)
    }
}
