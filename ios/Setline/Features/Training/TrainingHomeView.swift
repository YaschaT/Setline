import SwiftUI
import SetlineCore

/// Training — in the order a lifter looks: the streak and its week as one
/// slim card, today's workout as its own card, the next session under it,
/// then the quieter things — every workout, the next badge, and one line of
/// progress. A day in the week opens that day. Looking never writes: a session starts from `Start training`
/// on today's card and nowhere else, and `Oefeningen bekijken` opens the
/// preview, which starts nothing.
///
/// Planning and results live one tap away in the Agenda. "Wijzig deze dag" —
/// the only thing here that changes the schedule — is reached from a day's
/// preview, from a rest day's row in the Agenda, or by holding a day.
struct TrainingHomeView: View {
    @Environment(AppState.self) private var app
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.dynamicTypeSize) private var typeSize

    let onStart: (WorkoutDay) -> Void
    let onResume: (WorkoutDay, ActiveSessionSnapshot) -> Void
    /// A workout that was done on a date that has passed and never written
    /// down. Same session screen, that date on the result.
    let onLogPast: (WorkoutDay, Date) -> Void
    /// The avatar's way to Account, which stays a tab of its own.
    let onAccount: () -> Void
    /// Quick Progress's "See all": the Progress tab.
    var onProgress: () -> Void = {}
    /// The alerts' "Log food": the Nutrition tab.
    var onNutrition: () -> Void = {}

    @State private var confirmsEnd = false
    /// The plan shape, chosen from the workout chooser.
    @State private var choosingProgram = false
    /// The date the screen is on. `nil` is today, which is where every visit
    /// starts and where `Naar vandaag` returns.
    @State private var selectedDate: Date?
    @State private var sheet: Presented?
    @State private var openedSession: OpenedSession?
    /// The recovery proposal was waved away on this visit; the card says so.
    @State private var ignoredProposal = false
    /// The return moment: the number shown one lower while it rolls up,
    /// today's mark small while it lands, and the haptic's trigger.
    @State private var rolledWeeks: Int?
    @State private var popsToday = false
    @State private var celebrates = 0
    /// The week's marks have popped in; until then they wait small.
    @State private var dotsIn = TrainingIntro.played
    /// Today's ring breathes, so the eye lands on the next step.
    @State private var breathes = false
    /// The date key of the last week-secured moment played, so it plays once.
    @AppStorage("setline.training.celebratedWeek") private var celebratedWeek = ""
    /// The date column of `Rest van de week`, growing with the text.

    private struct OpenedSession: Identifiable { let id: String }

    /// One sheet at a time, as the design has it: a preview takes the
    /// agenda's place rather than stacking on it.
    private enum Presented: Identifiable {
        case agenda
        case alerts
        case streak
        case milestones
        case badge(Milestone)
        case preview(AgendaDay)
        case plan(Date)
        case history
        case chooser

        var id: String {
            switch self {
            case .agenda: return "agenda"
            case .alerts: return "alerts"
            case .streak: return "streak"
            case .milestones: return "milestones"
            case .badge(let item): return "badge-\(item.id)"
            case .preview(let day): return "preview-\(day.key)"
            case .plan(let date): return "plan-\(Schedule.dateKey(date))"
            case .history: return "history"
            case .chooser: return "chooser"
            }
        }
    }

    // MARK: - What the screen reads

    /// The week the strip shows: the one the selected date falls in, so
    /// picking a date in the agenda brings its week back with it.
    private var week: [AgendaDay] { days(containing: selectedDate ?? Date()) }

    private func days(containing date: Date) -> [AgendaDay] {
        Agenda.week(
            containing: date,
            plan: app.schedulePlan,
            overrides: app.scheduleOverrides,
            sessions: app.sessions,
            deload: app.activeDeload
        )
    }

    private var selectedDay: AgendaDay? {
        let key = Schedule.dateKey(selectedDate ?? Date())
        return week.first { $0.key == key }
    }

    private var isOffline: Bool { app.sync == .offline }

    private var queue: [SyncQueue.Row] {
        SyncQueue.rows(from: app.pendingChanges, display: app.display)
    }

    var body: some View {
        ScrollView {
                // Three topics, each its own block: what to do now, what
                // you're working toward, how it's going. 12 inside a block,
                // 32 between blocks, so the gaps say what belongs together.
                VStack(alignment: .leading, spacing: Self.betweenTopics) {
                    if isOffline { offlineCard }
                    if let today = days(containing: Date()).first(where: \.isToday) {
                        VStack(alignment: .leading, spacing: Self.insideTopic) {
                            streakCard(today)
                            todayCard(today)
                            planCard(after: today)
                            if let status = recoveryStatus { recoverySection(status) }
                        }
                        badgeSection(today)
                        // Day one has nothing to chart: no empty card.
                        if app.sessions.contains(where: { $0.kind == .workout }) {
                            QuickProgressCard(onSeeAll: onProgress)
                        }
                    }
                    if isOffline, !queue.isEmpty { queueSection }
                }
                .padding(.horizontal, SL.Space.gutterSession)
                // The streak card's own edge does the separating.
                .padding(.top, SL.Space.s2)
                .padding(.bottom, SL.Space.s6)
        }
        .slTabHeader { header }
        .sheet(item: $sheet) { presented in
            switch presented {
            case .agenda:
                AgendaSheet(
                    initialDate: selectedDate ?? Date(),
                    selectedKey: selectedDay?.key ?? "",
                    onSelect: { select($0) },
                    onPreview: { day in
                        select(day)
                        sheet = .preview(day)
                    },
                    onClose: { sheet = nil }
                )
            case .alerts:
                AlertCenterSheet(
                    onLogPast: { workout, date in after(closing: { onLogPast(workout, date) }) },
                    onResume: {
                        guard let paused = app.resumableSession, let day = app.day(for: paused) else { return }
                        after(closing: { onResume(day, paused) })
                    },
                    onNutrition: { after(closing: onNutrition) },
                    onProgress: { after(closing: onProgress) },
                    onClose: { sheet = nil }
                )
            case .streak:
                StreakSheet(streak: app.streak, onClose: { sheet = nil })
                    .presentationDetents([.large])
            case .milestones:
                MilestonesView(milestones: milestones, onClose: { sheet = nil })
            case .badge(let item):
                BadgeDetail(milestone: item)
                    .presentationDetents([.medium])
            case .preview(let day):
                preview(day)
            case .history:
                HistorySheet(onClose: { sheet = nil })
            case .chooser:
                WorkoutChooserSheet(
                    onStart: { day in after(closing: { onStart(day) }) },
                    onChangePlan: { after(closing: { choosingProgram = true }) },
                    onClose: { sheet = nil }
                )
            case .plan(let date):
                DayPlanSheet(
                    plan: dayPlan(for: date),
                    onApply: { option in
                        let plan = dayPlan(for: date)
                        sheet = nil
                        guard let change = plan.change(for: option, programKey: app.programKey) else { return }
                        Task { await app.record([change]) }
                    },
                    onOpenSession: { session in
                        after(closing: { openedSession = OpenedSession(id: session.id) })
                    },
                    onClose: { sheet = nil }
                )
            }
        }
        .fullScreenCover(item: $openedSession) { opened in
            SessionDetailView(sessionID: opened.id, onClose: { openedSession = nil })
        }
        .fullScreenCover(isPresented: $choosingProgram) {
            ProgramSheet(
                programs: ProgramCatalog.all(personalPlan: app.plan),
                current: ProgramCatalog.current(in: app.state ?? LegacyState(raw: [:]), plan: app.plan),
                onSave: { program in
                    choosingProgram = false
                    Task { await app.record([StateChange(.setProgram(mode: program.mode, sciencePlanID: program.sciencePlanID))]) }
                },
                onClose: { choosingProgram = false }
            )
        }
        #if DEBUG
        // `-SetlineAgenda` and `-SetlinePreview` open the two sheets, so they
        // can be looked at on any simulator without driving taps.
        .task {
            let arguments = ProcessInfo.processInfo.arguments
            try? await Task.sleep(for: .milliseconds(600))
            if arguments.contains("-SetlineChooser") {
                sheet = .chooser
            } else if arguments.contains("-SetlineAgenda") {
                sheet = .agenda
            } else if arguments.contains("-SetlinePreview"),
                      let today = days(containing: Date()).first(where: \.isToday), today.plannedDay != nil {
                sheet = .preview(today)
            }
        }
        #endif
        .sensoryFeedback(.success, trigger: celebrates)
        .alert("End the session?", isPresented: $confirmsEnd) {
            Button("Cancel", role: .cancel) {}
            Button("End") { Task { await app.endActiveSession() } }
        } message: {
            Text(endMessage)
        }
        .slRespondsToTextSize()
    }

    /// Closes whatever sheet is up, and acts once it has gone: the session and
    /// the results both open over the whole screen, which a sheet on its way
    /// out would refuse.
    private func after(closing action: @escaping @MainActor () -> Void) {
        sheet = nil
        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(350))
            action()
        }
    }

    @ViewBuilder
    private func preview(_ day: AgendaDay) -> some View {
        if let workout = day.plannedDay {
            let isMissed = { if case .missed = day.content { return true } else { return false } }()
            WorkoutPreviewView(
                day: day,
                workout: workout,
                // A paused session is resumed from the card, never started
                // over from here.
                onStart: day.isToday && app.resumableSession == nil
                    ? { after(closing: { onStart(workout) }) }
                    : nil,
                onLogPast: isMissed
                    ? { after(closing: { onLogPast(workout, day.date) }) }
                    : nil,
                onChangeDay: { sheet = .plan(day.date) },
                onClose: { sheet = nil }
            )
        }
    }

    /// One date, read the way the strip and the agenda read it.
    private func dayPlan(for date: Date) -> DayPlan {
        DayPlan.make(
            for: date,
            plan: app.schedulePlan,
            overrides: app.scheduleOverrides,
            sessions: app.sessions,
            deload: app.activeDeload
        )
    }

    // MARK: - The head

    /// 1a's head: the avatar, "Hoi" and your name, and under them the date
    /// the card is on. The avatar leads to Account, which stays a tab of its
    /// own. 1a's spacing — 14 beside the avatar, 4 above and 8 below — so the
    /// week starts as far under it as 1a has it.
    private var header: some View {
        // One line: the day is already in the week's ringed dot and TODAY.
        SLTabHeader(title: greeting, ring: tierRing, onAccount: onAccount) {
            alertsBell
        }
    }

    /// The one way to planning and results: a small calendar in the streak
    /// card, beside the week it plans.
    private var agendaButton: some View {
        Button { sheet = .agenda } label: {
            SLGlyph(name: .calendar, size: 15)
                .foregroundStyle(SL.Ink.secondary)
                .frame(width: 34, height: 34)
                .background(Circle().fill(SL.Surface.raised2))
                .frame(width: SL.Space.hitMin, height: SL.Space.hitMin)
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .slFocusRing(Circle())
        .accessibilityLabel("Agenda")
        .accessibilityHint("Opens planning and results")
    }

    /// The way to Meldingen: a bell, with the number of workouts that passed
    /// unlogged on it. Amber, the app's colour for "this needs you", and only
    /// while there is something to answer.
    private var alertsBell: some View {
        let count = Alerts.todos(app).count
        let newWins = count == 0 && Alerts.hasNewWins(app)
        return Button { sheet = .alerts } label: {
            SLGlyph(name: .bell, size: 18, fixed: true)
                .foregroundStyle(SL.Ink.primary)
                .frame(width: 38, height: 38)
                .background(Circle().fill(SL.Surface.raised))
                .overlay(Circle().strokeBorder(SL.Surface.hairline, lineWidth: SL.Metric.border))
                .overlay(alignment: .topTrailing) {
                    if count > 0 {
                        Text("\(min(count, 9))")
                            .font(.slFixed(11, SL.Weight.bold))
                            .foregroundStyle(SL.Signal.onAction)
                            .frame(minWidth: 18, minHeight: 18)
                            .background(Circle().fill(SL.Signal.attention))
                            .offset(x: 4, y: -4)
                    } else if newWins {
                        // Good news waiting: a lime dot, never a number.
                        Circle().fill(SL.Signal.action).frame(width: 10, height: 10)
                            .offset(x: 1, y: -1)
                    }
                }
                .frame(width: SL.Space.hitMin, height: SL.Space.hitMin)
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .slFocusRing(Circle())
        .accessibilityLabel(count == 0 ? (newWins ? "Alerts, new wins" : "Alerts") : "Alerts, \(count) to do")
        .accessibilityHint("Things to do and this week's wins")
    }

    /// Every badge, earned or not, as Training and its sheets read them.
    private var milestones: [Milestone] {
        Milestones.make(sessions: app.sessions, bestStreak: app.streak.best)
    }

    /// The avatar's ring in the metal of the best badge earned: what the
    /// collection has amounted to, worn where you are.
    private var tierRing: AnyShapeStyle {
        let top = milestones.filter(\.isReached).map(\.tier).max()
        switch top {
        case .none: return AnyShapeStyle(SL.Surface.hairlineStrong)
        case .some(0): return AnyShapeStyle(LinearGradient(colors: [Color(hex: 0xE2A576), Color(hex: 0x7A4526)], startPoint: .top, endPoint: .bottom))
        case .some(1): return AnyShapeStyle(LinearGradient(colors: [Color(hex: 0xEEF2F4), Color(hex: 0x7D8A92)], startPoint: .top, endPoint: .bottom))
        case .some(2): return AnyShapeStyle(LinearGradient(colors: [Color(hex: 0xFFE08A), Color(hex: 0xB07D12)], startPoint: .top, endPoint: .bottom))
        default: return AnyShapeStyle(SL.Signal.action)
        }
    }

    /// "Good evening, Yascha", or the greeting alone until a name is given
    /// in Account — never a bare "Hi".
    private var greeting: String {
        let hour = Calendar.current.component(.hour, from: Date())
        let part = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"
        return app.greetingName.map { "\(part), \($0)" } ?? part
    }


    // MARK: - The hero

    /// The streak as one slim card: Tally, the count of weeks in a row, this
    /// week's workouts as a fraction, the seven days, and the Agenda. Two
    /// numbers that mean two things — weeks in a row, workouts this week —
    /// so each says its own unit.
    private func streakCard(_ today: AgendaDay) -> some View {
        let streak = app.streak
        let secured = securedToday(today, streak)
        // Two halves with room between them: the streak (weeks in a row),
        // then under a hairline this week (its days and its count).
        return VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .center, spacing: SL.Space.s4) {
                mascot(today, streak)
                streakRow(streak, secured: secured, risk: streakRisk(streak))
                agendaButton
            }
            Rectangle()
                .fill(secured ? SL.Signal.action.opacity(0.18) : SL.Surface.hairline)
                .frame(height: SL.Metric.border)
                .padding(.horizontal, -SL.Space.s5)
                .padding(.vertical, SL.Space.s5)
            weekHeader(streak)
                .padding(.bottom, SL.Space.s2)
            weekDots
            if let missed = lastMissed {
                missedLine(missed)
                    .padding(.top, SL.Space.s2)
            }
        }
        .padding(.horizontal, SL.Space.s5)
        .padding(.top, SL.Space.s5)
        .padding(.bottom, SL.Space.s4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(heroBackground(lit: secured, streak: streak))
        .clipShape(RoundedRectangle(cornerRadius: SL.Radius.xl, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: SL.Radius.xl, style: .continuous)
                .strokeBorder(secured ? SL.Signal.action.opacity(0.45) : SL.Surface.hairline,
                              lineWidth: SL.Metric.border)
        )
        .shadow(color: secured ? SL.Signal.action.opacity(0.12) : .clear, radius: 18)
        .accessibilityElement(children: .contain)
        .onAppear {
            celebrateIfSecured(today, streak)
            playIntro(streak)
            #if DEBUG
            if ProcessInfo.processInfo.arguments.contains("-SetlineBadges") { sheet = .milestones }
            // `-SetlinePickDay 3` opens the week's Wednesday.
            let arguments = ProcessInfo.processInfo.arguments
            if let flag = arguments.firstIndex(of: "-SetlinePickDay"), arguments.indices.contains(flag + 1),
               let index = Int(arguments[flag + 1]), days(containing: Date()).indices.contains(index - 1) {
                open(days(containing: Date())[index - 1])
            }
            if arguments.contains("-SetlineHistory") { sheet = .history }
            #endif
        }
    }

    /// Today's workout, on its own card: the workout as it was, one action.
    private func todayCard(_ today: AgendaDay) -> some View {
        todayBlock(today)
            .padding(SL.Space.s5)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: 28, style: .continuous).fill(SL.Surface.raised)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 28, style: .continuous)
                    .strokeBorder(SL.Surface.hairlineStrong.opacity(0.6), lineWidth: SL.Metric.border)
            )
            .accessibilityElement(children: .contain)
    }

    private static let insideTopic = SL.Space.s3
    private static let betweenTopics = SL.Space.s8

    /// What's next and what's been: one card, two rows. The next workout
    /// after today (only that one — the schedule is the Agenda's), and under
    /// a hairline the way into every logged workout.
    private func planCard(after today: AgendaDay) -> some View {
        VStack(spacing: 0) {
            if let next = nextTraining(after: today.date), next.plannedDay != nil {
                nextSessionRow(next)
                SLHairline().padding(.leading, SL.Space.s4 + 44 + SL.Space.s3)
            }
            plansRow
            SLHairline().padding(.leading, SL.Space.s4 + 44 + SL.Space.s3)
            allWorkoutsRow
        }
        .background(
            RoundedRectangle(cornerRadius: SL.Radius.xl, style: .continuous).fill(SL.Surface.raised)
        )
        .overlay(
            RoundedRectangle(cornerRadius: SL.Radius.xl, style: .continuous)
                .strokeBorder(SL.Surface.hairline, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: SL.Radius.xl, style: .continuous))
    }

    private func nextSessionRow(_ day: AgendaDay) -> some View {
        let workout = day.plannedDay!
        return Button { open(day) } label: {
            HStack(spacing: SL.Space.s3) {
                SLWorkoutSymbol(dayName: workout.short, size: 20)
                    .foregroundStyle(SL.Signal.action)
                    .frame(width: 44, height: 44)
                    .background(
                        RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous)
                            .fill(SL.Signal.actionTint)
                    )
                VStack(alignment: .leading, spacing: 2) {
                    Text("NEXT · \(whenLabel(day).uppercased())")
                        .font(.sl(SL.TypeSize.micro, SL.Weight.bold))
                        .tracking(0.8)
                        .foregroundStyle(SL.Ink.secondary)
                        .lineLimit(1)
                    Text(workout.short)
                        .font(.sl(SL.TypeSize.title, SL.Weight.bold))
                        .foregroundStyle(SL.Ink.primary)
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                    Text("\(WeekPlan.sets(of: workout)) sets · ~\(WeekPlan.minutes(of: workout)) min")
                        .slMeta()
                        .slNumerals()
                        .foregroundStyle(SL.Ink.secondary)
                        .lineLimit(1)
                }
                Spacer(minLength: SL.Space.s2)
                SLGlyph(name: .chevronRight, size: 13).foregroundStyle(SL.Ink.tertiary)
            }
            .padding(.horizontal, SL.Space.s4)
            .padding(.vertical, SL.Space.s4)
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(SLRowButtonStyle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Next session: \(workout.short), \(whenLabel(day)), \(WeekPlan.sets(of: workout)) sets, about \(WeekPlan.minutes(of: workout)) minutes")
        .accessibilityHint("Shows the exercises. Nothing starts.")
    }

    /// The way to your own workouts and your plan, named for what it is.
    private var plansRow: some View {
        let own = app.customWorkouts.count
        return Button { sheet = .chooser } label: {
            HStack(spacing: SL.Space.s3) {
                Image(systemName: "square.stack.3d.up")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(SL.Ink.secondary)
                    .frame(width: 44)
                VStack(alignment: .leading, spacing: 1) {
                    Text("Plan & workouts").slBody(SL.Weight.medium).foregroundStyle(SL.Ink.primary)
                    Text(own == 0 ? "Create your own workout" : own == 1 ? "1 of your own" : "\(own) of your own")
                        .slMeta().foregroundStyle(SL.Ink.secondary)
                }
                Spacer(minLength: SL.Space.s2)
                SLGlyph(name: .chevronRight, size: 12).foregroundStyle(SL.Ink.tertiary)
            }
            .padding(.horizontal, SL.Space.s4)
            .frame(minHeight: 60)
            .contentShape(Rectangle())
        }
        .buttonStyle(SLRowButtonStyle())
        .accessibilityHint("Build your own workouts, change your plan, or start any workout")
    }

    /// Every logged workout: the card's quiet second row.
    private var allWorkoutsRow: some View {
        let count = app.sessions.filter { $0.kind == .workout }.count
        return Button { sheet = .history } label: {
            HStack(spacing: SL.Space.s3) {
                SLGlyph(name: .list, size: 16)
                    .foregroundStyle(SL.Ink.secondary)
                    .frame(width: 44)
                Text("All workouts")
                    .slBody(SL.Weight.medium)
                    .foregroundStyle(SL.Ink.primary)
                Spacer(minLength: SL.Space.s2)
                Text("\(count)")
                    .slBody()
                    .slNumerals()
                    .foregroundStyle(SL.Ink.secondary)
                SLGlyph(name: .chevronRight, size: 12).foregroundStyle(SL.Ink.tertiary)
            }
            .padding(.horizontal, SL.Space.s4)
            .frame(minHeight: 52)
            .contentShape(Rectangle())
        }
        .buttonStyle(SLRowButtonStyle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("All workouts, \(count)")
        .accessibilityHint("Opens every logged session")
    }

    /// A badge won today, or the next one to win: compact and secondary.
    @ViewBuilder
    private func badgeSection(_ today: AgendaDay) -> some View {
        let isDone = today.session != nil && app.resumableSession == nil
        if let badge = earnedToday.first {
            VStack(alignment: .leading, spacing: SL.Space.s2) {
            topicHead("New badge", link: "All badges") { sheet = .milestones }
            Button { sheet = .badge(badge) } label: {
                EarnedBadgeRow(milestone: badge, next: nextMilestone(after: badge))
                    .padding(SL.Space.s4)
                    .background(RoundedRectangle(cornerRadius: SL.Radius.xl, style: .continuous).fill(SL.Surface.raised))
                    .overlay(
                        RoundedRectangle(cornerRadius: SL.Radius.xl, style: .continuous)
                            .strokeBorder(SL.Signal.action.opacity(0.35), lineWidth: SL.Metric.border)
                    )
                    .contentShape(Rectangle())
            }
            .buttonStyle(SLPressStyle())
            }
        } else if let goal = badgeGoal(for: today, isDone: isDone) {
            VStack(alignment: .leading, spacing: SL.Space.s2) {
                topicHead(goal.unlocks ? "Unlocks today" : "Next badge", link: "All badges", lit: goal.unlocks) {
                    sheet = .milestones
                }
                NextBadgeCard(
                    milestone: goal.milestone,
                    unlocks: goal.unlocks,
                    onOpen: { sheet = .badge(goal.milestone) }
                )
            }
        }
    }

    /// A topic's name over its card, with its one way further — the same
    /// head Quick progress wears.
    private func topicHead(_ title: String, link: String, lit: Bool = false, action: @escaping () -> Void) -> some View {
        HStack(alignment: .firstTextBaseline) {
            SLOverline(text: title, color: lit ? SL.Signal.action : SL.Ink.secondary)
                .accessibilityAddTraits(.isHeader)
            Spacer()
            Button(action: action) {
                HStack(spacing: 4) {
                    Text(link).slMeta(SL.Weight.semibold)
                    SLGlyph(name: .chevronRight, size: 12)
                }
                .foregroundStyle(SL.Ink.secondary)
                .frame(minHeight: SL.Space.hitMin)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
        .padding(.leading, SL.Space.s1)
    }

    private func heroBackground(lit: Bool, streak: TrainingStreak) -> some View {
        ZStack {
            SL.Surface.raised
            if lit {
                RadialGradient(colors: [SL.Signal.action.opacity(0.28), SL.Signal.action.opacity(0.06), .clear],
                               center: .top, startRadius: 0, endRadius: 380)
            } else if streak.weeks > 0 {
                RadialGradient(colors: [SL.Signal.action.opacity(0.16), .clear],
                               center: .topTrailing, startRadius: 0, endRadius: 300)
            }
        }
    }

    /// The paused session's quieter way out, off the card's face.
    private var moreMenu: some View {
        Menu {
            Button("End session", role: .destructive) { confirmsEnd = true }
        } label: {
            SLGlyph(name: .more, size: 20, fixed: true)
                .foregroundStyle(SL.Ink.secondary)
                .frame(width: SL.Space.hitMin, height: SL.Space.hitMin)
                .contentShape(Rectangle())
        }
        .padding(.vertical, -SL.Space.s3)
        .padding(.trailing, -SL.Space.s2)
        .accessibilityLabel("More")
    }

    /// The streak — weeks in a row — beside this week's own count, each
    /// with its unit, so the two are never read as one number. Opens the
    /// streak sheet, where the best, the freeze and the badges are.
    private func streakRow(_ streak: TrainingStreak, secured: Bool, risk: TrainingStreak.Risk) -> some View {
        let left = max(streak.thisWeekGoal - streak.thisWeekDone, 0)
        let lit = streak.weeks > 0
        let done = min(streak.thisWeekDone, streak.thisWeekGoal)
        let nudge: String = {
            if streak.thisWeekMet { return "Week secured" }
            switch risk {
            case .breaks: return "Out of reach this week · streak resets Monday"
            case .freezeCovers: return "Out of reach · your freeze keeps the streak"
            case .tight: return left == 1 ? "Last chance: 1 more this week" : "Every day left counts: \(left) to go"
            case .none: break
            }
            return !lit ? (left == 1 ? "1 more workout this week does it" : "\(left) workouts this week do it")
                : left == 1 ? "1 more keeps it going" : "\(left) more keep it going"
        }()
        // Lime is earned; amber says the streak needs you now.
        let nudgeInk: Color = streak.thisWeekMet ? SL.Signal.action
            : risk == .tight || risk == .breaks ? SL.Signal.attention : SL.Ink.secondary
        let shown = rolledWeeks ?? streak.weeks
        return Button { sheet = .streak } label: {
            VStack(alignment: .leading, spacing: 2) {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    if streak.weeks == 0 && rolledWeeks == nil {
                        // A zero isn't a streak; it's an invitation.
                        Text(streak.best == 0 ? "Start your streak" : "Start a new streak")
                            .font(.sl(SL.TypeSize.title, SL.Weight.bold))
                            .foregroundStyle(SL.Ink.primary)
                            .lineLimit(typeSize.isAccessibilitySize ? 2 : 1)
                            .minimumScaleFactor(0.8)
                    } else {
                    Text("\(shown)")
                        .font(.slCapped(34, SL.Weight.bold, maxScale: 1.3, relativeTo: .title1))
                        .tracking(-1)
                        .monospacedDigit()
                        .foregroundStyle(risk == .breaks ? SL.Signal.attention : lit ? SL.Signal.action : SL.Ink.primary)
                        .contentTransition(.numericText(value: Double(shown)))
                        .lineLimit(1)
                    Text("week streak")
                        .slBody(SL.Weight.semibold)
                        .foregroundStyle(SL.Ink.primary)
                        .lineLimit(typeSize.isAccessibilitySize ? 2 : 1)
                    }
                    if secured {
                        Text("+1")
                            .font(.slFixed(11, SL.Weight.bold))
                            .foregroundStyle(SL.Signal.onAction)
                            .padding(.horizontal, 5)
                            .padding(.vertical, 2)
                            .background(Capsule().fill(SL.Signal.action))
                    }
                }
                HStack(spacing: 4) {
                    if streak.thisWeekMet { SLGlyph(name: .check, size: 11) }
                    Text(nudge)
                        .slMeta(SL.Weight.medium)
                        .lineLimit(typeSize.isAccessibilitySize ? 3 : 1)
                        .minimumScaleFactor(0.85)
                }
                .foregroundStyle(nudgeInk)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(SLPressStyle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(streak.weeks == 1 ? "1-week streak" : "\(streak.weeks)-week streak"). \(done) of \(streak.thisWeekGoal) workouts this week. \(nudge).")
        .accessibilityHint("Shows your streak and badges")
    }

    /// Days still open for a workout this week: today while nothing is
    /// logged, and every day after it.
    private func streakRisk(_ streak: TrainingStreak) -> TrainingStreak.Risk {
        let open = days(containing: Date()).filter { ($0.isToday && !$0.isLogged) || (!$0.isToday && !$0.isPast) }
        return streak.risk(daysLeft: open.count)
    }

    /// The latest planned day this week that went by unlogged.
    private var lastMissed: (day: AgendaDay, workout: WorkoutDay)? {
        days(containing: Date()).reversed().lazy.compactMap { day -> (AgendaDay, WorkoutDay)? in
            if case .missed(let workout) = day.content, !day.isToday { return (day, workout) }
            return nil
        }.first
    }

    /// "Monday wasn't logged · Log it": the missed day, answered where it
    /// shows, rather than only behind the bell.
    private func missedLine(_ missed: (day: AgendaDay, workout: WorkoutDay)) -> some View {
        Button { onLogPast(missed.workout, missed.day.date) } label: {
            HStack(spacing: SL.Space.s2) {
                Circle().fill(SL.Signal.attention).frame(width: 6, height: 6)
                Text("\(WeekPlan.fullWeekday(missed.day.date)) wasn't logged")
                    .slMeta()
                    .foregroundStyle(SL.Ink.secondary)
                Spacer(minLength: SL.Space.s2)
                Text("Log it").slMeta(SL.Weight.semibold).foregroundStyle(SL.Signal.attention)
                SLGlyph(name: .chevronRight, size: 11).foregroundStyle(SL.Signal.attention)
            }
            .frame(minHeight: SL.Space.hitMin)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(WeekPlan.fullWeekday(missed.day.date)) wasn't logged. Log \(missed.workout.short)")
    }

    /// "THIS WEEK · 2 of 4 workouts", over its seven days.
    private func weekHeader(_ streak: TrainingStreak) -> some View {
        let done = min(streak.thisWeekDone, streak.thisWeekGoal)
        return HStack(alignment: .firstTextBaseline) {
            SLOverline(text: "This week")
            Spacer(minLength: SL.Space.s2)
            Text("\(done) of \(streak.thisWeekGoal) workouts")
                .slMeta(SL.Weight.semibold)
                .slNumerals()
                .foregroundStyle(streak.thisWeekMet ? SL.Signal.action : SL.Ink.primary)
        }
        .accessibilityElement(children: .combine)
    }

    /// This week as seven marks: trained days filled, today ringed, rest
    /// days mint, days still to come dashed. A tap opens that day.
    private var weekDots: some View {
        HStack(spacing: 0) {
            ForEach(Array(days(containing: Date()).enumerated()), id: \.element.id) { index, day in
                Button { pick(day) } label: {
                    VStack(spacing: 6) {
                        Text(String(day.weekday.prefix(1)))
                            .font(.sl(SL.TypeSize.micro, day.isToday ? SL.Weight.bold : SL.Weight.regular))
                            .foregroundStyle(day.isToday ? SL.Ink.primary : SL.Ink.secondary)
                        dayMark(day)
                            // Seven coins dropping in, left to right.
                            .scaleEffect(dotsIn ? 1 : 0.3)
                            .opacity(dotsIn ? 1 : 0)
                            .animation(.spring(response: 0.38, dampingFraction: 0.55).delay(0.12 + Double(index) * 0.045), value: dotsIn)
                    }
                    .padding(.vertical, SL.Space.s1)
                    .frame(maxWidth: .infinity, minHeight: SL.Space.hitMin)
                    .background(
                        RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous)
                            .fill(isPicked(day) ? SL.Surface.raised2 : .clear)
                            .padding(.horizontal, 3)
                    )
                    .contentShape(Rectangle())
                }
                .buttonStyle(SLPressStyle(scale: 0.82, bounces: true))
                .accessibilityLabel(StripDay.spokenLabel(day))
                .accessibilityAddTraits(isPicked(day) ? .isSelected : [])
                .accessibilityHint("Opens this day")
            }
        }
        .padding(.horizontal, -SL.Space.s1)
    }

    @ViewBuilder
    private func dayMark(_ day: AgendaDay) -> some View {
        let size: CGFloat = 28
        if day.isLogged {
            Circle().fill(SL.Signal.action)
                .overlay(SLGlyph(name: .check, size: 13).foregroundStyle(SL.Signal.onAction))
                .background(Circle().fill(SL.Signal.action.opacity(day.isToday ? 0.2 : 0)).padding(-5))
                .frame(width: size, height: size)
                .scaleEffect(day.isToday && popsToday ? 0.4 : 1)
        } else if day.isToday {
            Circle().strokeBorder(SL.Signal.action, lineWidth: 2)
                .background(Circle().fill(SL.Signal.action.opacity(0.12)).padding(-4))
                .overlay(Circle().fill(SL.Signal.action).frame(width: 8, height: 8))
                // A ring that leaves it and fades: the next step, waiting.
                .background(
                    Circle()
                        .strokeBorder(SL.Signal.action.opacity(breathes ? 0 : 0.5), lineWidth: 1.5)
                        .scaleEffect(breathes ? 1.7 : 1)
                )
                .frame(width: size, height: size)
        } else if day.isRest {
            Circle().strokeBorder(SL.Signal.recovery.opacity(0.25), lineWidth: 1.5)
                .overlay(Circle().fill(SL.Signal.recovery).frame(width: 5, height: 5))
                .frame(width: size, height: size)
        } else if day.isPast, case .missed = day.content {
            // A planned day that went by: amber, so it reads apart from the
            // days still to come.
            Circle().strokeBorder(SL.Signal.attention.opacity(0.7), lineWidth: 1.5)
                .overlay(Image(systemName: "xmark").font(.system(size: 9, weight: .bold)).foregroundStyle(SL.Signal.attention))
                .frame(width: size, height: size)
        } else if day.isPast {
            Circle().strokeBorder(SL.Surface.mute, lineWidth: 1.5)
                .frame(width: size, height: size)
        } else {
            Circle().strokeBorder(SL.Surface.mute, style: StrokeStyle(lineWidth: 1.5, dash: [3, 3]))
                .frame(width: size, height: size)
        }
    }

    /// Today: the word, the workout, one line of what it holds, the record
    /// chance, the action, and under it the badge it counts toward. A day
    /// already trained, or a rest day, points at the next workout instead.
    private func todayBlock(_ day: AgendaDay) -> some View {
        let content = card(for: day)
        let workout = day.plannedDay ?? app.resumableSession.flatMap { app.day(for: $0) }
        let isDone = day.session != nil && (!day.isToday || app.resumableSession == nil)
        let name = day.isToday ? "TODAY" : WeekPlan.fullWeekday(day.date).uppercased()
        let state = isDone ? " · DONE" : (day.isPast && day.plannedDay != nil && !day.isToday) ? " · NOT LOGGED" : ""
        return VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 4) {
                if isDone { SLGlyph(name: .check, size: 11) }
                Text(name + state)
                    .font(.sl(SL.TypeSize.micro, SL.Weight.bold))
                    .tracking(1)
                Spacer(minLength: 0)
                if day.isToday {
                    if app.resumableSession != nil {
                        moreMenu
                    } else if workout != nil, !isDone, !content.isRest {
                        // Looking first is its own, named way in; the title
                        // is only a title, and the button only starts.
                        Button { sheet = .preview(day) } label: {
                            HStack(spacing: 4) {
                                Text("Exercises").slMeta(SL.Weight.semibold)
                                SLGlyph(name: .chevronRight, size: 11)
                            }
                            .foregroundStyle(SL.Ink.secondary)
                            .frame(minHeight: SL.Space.hitMin)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .padding(.vertical, -SL.Space.s3)
                        .accessibilityHint("Shows today's exercises. Nothing starts.")
                    }
                } else {
                    Button { withAnimation(.easeOut(duration: SL.Motion.base)) { selectedDate = nil } } label: {
                        Text("Today")
                            .font(.sl(SL.TypeSize.meta, SL.Weight.semibold))
                            .foregroundStyle(SL.Ink.secondary)
                            .padding(.horizontal, SL.Space.s3)
                            .frame(minHeight: 30)
                            .background(Capsule().fill(SL.Surface.raised2))
                            .frame(minHeight: SL.Space.hitMin)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Back to today")
                }
            }
            .foregroundStyle(content.isRest ? SL.Signal.recovery : isDone || day.isToday ? SL.Signal.action : SL.Ink.secondary)
            Text(isDone ? (day.session?.dayLabel ?? content.title) : content.title)
                .font(.sl(SL.TypeSize.display, SL.Weight.bold))
                .tracking(-0.02 * SL.TypeSize.display)
                .foregroundStyle(content.isRest ? SL.Signal.recovery : SL.Ink.primary)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                .padding(.top, 2)
                .accessibilityAddTraits(.isHeader)

            if let focus = isDone ? nil : content.focus {
                Text(Self.sentenceCase(focus).slUnbroken)
                    .slLead(SL.Weight.regular)
                    .foregroundStyle(SL.Ink.primary.opacity(0.85))
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, SL.Space.s2)
            }
            if let stats = stats(for: day, workout: workout, isDone: isDone), !stats.isEmpty {
                statRow(stats)
                    .padding(.top, SL.Space.s4)
            } else if let meta = content.meta {
                Text(meta.text.slUnbroken)
                    .slBody()
                    .slNumerals()
                    .foregroundStyle(SL.Ink.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, SL.Space.s2)
            }

            if day.isToday, !isDone, let workout, !content.isRest {
                let lifts = app.liftsReady(in: workout)
                if !lifts.isEmpty { readyLine(lifts).padding(.top, SL.Space.s4) }
            }
            // A rest day holds no start: the next session is the card below.
            if !(day.isToday && content.isRest && !isDone) {
                cardActions(day)
                    .padding(.top, SL.Space.s5)
            }
            // Another plan day, a workout of your own, or a new plan shape —
            // quiet under the start, and the card's one action on a rest day.
            if day.isToday, !isDone, app.resumableSession == nil {
                if content.isRest {
                    Button { sheet = .chooser } label: { chevroned("Train anyway") }
                        .buttonStyle(SLOutlineButtonStyle())
                        .padding(.top, SL.Space.s5)
                        .accessibilityHint("Pick a workout from your plan or your own")
                } else {
                    Button { sheet = .chooser } label: {
                        Text("or choose a different workout")
                            .slMeta(SL.Weight.medium)
                            .foregroundStyle(SL.Ink.secondary)
                            .frame(maxWidth: .infinity, minHeight: SL.Space.hitMin)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .padding(.top, SL.Space.s1)
                    .padding(.bottom, -SL.Space.s3)
                    .accessibilityHint("Any day of your plan, your own workouts, or a new plan shape")
                }
            }
        }
    }

    /// "hamstrings · glutes · core" → "Hamstrings · glutes · core".
    private static func sentenceCase(_ text: String) -> String {
        text.prefix(1).uppercased() + text.dropFirst()
    }

    /// The workout's size as numbers to scan rather than a sentence to read:
    /// exercises, minutes, sets — or, paused, how far it got.
    private func stats(for day: AgendaDay, workout: WorkoutDay?, isDone: Bool) -> [(value: String, label: String)]? {
        if let paused = app.resumableSession, day.isToday, let resumed = app.day(for: paused) {
            let planned = max(SessionPrescription.setCount(of: resumed, deload: app.activeDeload), paused.plannedSetCount)
            return [("\(paused.loggedSetCount)/\(planned)", "sets done"), ("Paused", app.pausedWhenLabel(for: paused))]
        }
        if isDone, let session = day.session,
           let planned = session.plannedSetCount, let completed = session.completedSetCount, planned > 0 {
            // The sets already say how much was done; the time is the new fact.
            var items = [("\(completed)/\(planned)", "sets")]
            if let seconds = session.durationSeconds, seconds >= 60 { items.append(("\(seconds / 60)", "min")) }
            return items
        }
        guard !isDone, let workout, day.plannedDay != nil else { return nil }
        return [
            ("\(workout.exercises.count)", workout.exercises.count == 1 ? "exercise" : "exercises"),
            ("~\(WeekPlan.minutes(of: workout))", "min"),
            ("\(WeekPlan.sets(of: workout))", "sets"),
        ]
    }

    /// Big number over a small word, columns split by hairlines.
    private func statRow(_ items: [(value: String, label: String)]) -> some View {
        HStack(alignment: .top, spacing: 0) {
            ForEach(Array(items.enumerated()), id: \.offset) { index, item in
                HStack(spacing: 0) {
                    if index > 0 {
                        Rectangle().fill(SL.Surface.hairline).frame(width: SL.Metric.border, height: 34)
                            .padding(.trailing, SL.Space.s4)
                    }
                    VStack(alignment: .leading, spacing: 2) {
                        Text(item.value)
                            .font(.sl(SL.TypeSize.title, SL.Weight.semibold))
                            .slNumerals()
                            .foregroundStyle(SL.Ink.primary)
                            .lineLimit(1)
                            .minimumScaleFactor(0.8)
                        Text(item.label)
                            .slMeta()
                            .foregroundStyle(SL.Ink.secondary)
                            .lineLimit(1)
                            .minimumScaleFactor(0.6)
                    }
                    Spacer(minLength: SL.Space.s2)
                }
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(items.map { "\($0.value) \($0.label)" }.joined(separator: ", "))
    }

    /// One line, not a card: the lifts the engine says can go up today.
    /// The reason to start, right above Start: a lime pill, not a grey
    /// footnote — "↑ 7 lifts can go up today · Flat bench 102.5 kg".
    private func readyLine(_ lifts: [ReadyLift]) -> some View {
        HStack(spacing: SL.Space.s2) {
            SLGlyph(name: .trendUp, size: 14, fixed: true)
            (Text(lifts.count == 1 ? "1 lift can go up today" : "\(lifts.count) lifts can go up today")
                .font(.sl(SL.TypeSize.meta, SL.Weight.semibold))
             + Text(" · \(lifts[0].name) \(app.display.kg(lifts[0].toKg))")
                .font(.sl(SL.TypeSize.meta, SL.Weight.regular)))
                .slNumerals()
                .lineLimit(typeSize.isAccessibilitySize ? 3 : 1)
                .minimumScaleFactor(0.8)
            Spacer(minLength: 0)
        }
        .foregroundStyle(SL.Signal.action)
        .padding(.horizontal, SL.Space.s3)
        .padding(.vertical, SL.Space.s2)
        .background(RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous).fill(SL.Signal.actionTint))
        .accessibilityElement(children: .combine)
    }

    // MARK: - Tally

    private func mascotMood(_ today: AgendaDay, _ streak: TrainingStreak) -> TallyMascot.Mood {
        if streak.thisWeekMet { return .struck }
        if today.isLogged { return .proud }
        if today.isRest { return .resting }
        if let workout = today.plannedDay, !app.liftsReady(in: workout).isEmpty { return .focused }
        return .ready
    }

    /// Tally shows how the day feels, not how many: the dots and "n/g this
    /// week" already count. Its three bars are the mark itself; the crossbar
    /// strikes through only when the week is secured — the whole logo, earned.
    private func mascot(_ today: AgendaDay, _ streak: TrainingStreak) -> some View {
        TallyMascot(done: 3, goal: 3, mood: mascotMood(today, streak), unit: 9, jumps: celebrates)
            .accessibilityHidden(true)
    }

    // MARK: - Small motion

    /// Once per launch: the streak counts up to itself and the week's marks
    /// pop in. Every visit after that, the breathing today ring is the only
    /// motion — so the screen moves when it has something to say.
    private func playIntro(_ streak: TrainingStreak) {
        guard !reduceMotion else {
            dotsIn = true
            return
        }
        if !breathes {
            withAnimation(.easeOut(duration: 1.6).repeatForever(autoreverses: false).delay(0.8)) { breathes = true }
        }
        guard !TrainingIntro.played else { return }
        TrainingIntro.played = true
        dotsIn = true
        guard streak.weeks > 1, rolledWeeks == nil else { return }
        var jump = Transaction()
        jump.disablesAnimations = true
        withTransaction(jump) { rolledWeeks = 0 }
        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(250))
            withAnimation(.snappy(duration: 0.7)) { rolledWeeks = nil }
        }
    }

    // MARK: - The game's state

    /// Every badge won since midnight — the finish of today's workout.
    /// Streak badges carry the last workout's date rather than the day they
    /// were won, so one counts only when today's workout secured exactly its
    /// number of weeks for the first time.
    private var earnedToday: [Milestone] {
        let streak = app.streak
        let secured = days(containing: Date()).first(where: \.isToday).map { securedToday($0, streak) } ?? false
        return Milestones.reached(in: milestones, since: Calendar.current.startOfDay(for: Date()))
            .filter { badge in
                guard badge.kind == .streak else { return true }
                return secured && streak.weeks == streak.best && Int(badge.target) == streak.weeks
            }
    }

    /// The badge of the same kind after one just won.
    private func nextMilestone(after badge: Milestone) -> Milestone? {
        milestones.first { $0.kind == badge.kind && !$0.isReached }
    }

    /// Today's workout was the one that met the week.
    private func securedToday(_ today: AgendaDay, _ streak: TrainingStreak) -> Bool {
        today.isLogged && streak.thisWeekMet && streak.thisWeekDone == streak.thisWeekGoal
    }

    /// The badge today counts toward. A workout that would make the streak
    /// reach a streak badge names that one; otherwise the next session count.
    private func badgeGoal(for day: AgendaDay, isDone: Bool) -> (milestone: Milestone, unlocks: Bool)? {
        let streak = app.streak
        let nextSessions = milestones.first { $0.kind == .sessions && !$0.isReached }
        if streak.weeks == 0, streak.best == 0,
           let first = milestones.first(where: { $0.kind == .streak && !$0.isReached }) {
            return (first, false)
        }
        guard !isDone, !day.isRest,
              let workout = day.plannedDay ?? app.resumableSession.flatMap({ app.day(for: $0) })
        else { return nextSessions.map { ($0, false) } }
        let after = app.streak(adding: Date(), day: workout)
        if after.weeks > streak.weeks,
           let badge = milestones.first(where: { $0.kind == .streak && !$0.isReached && Int($0.target) == after.weeks }) {
            return (badge, true)
        }
        return nextSessions.map { ($0, $0.target - $0.current <= 1) }
    }

    /// The return moment, once per secured week: today's mark lands, the
    /// number rolls up by one, and the phone answers.
    private func celebrateIfSecured(_ today: AgendaDay, _ streak: TrainingStreak) {
        let key = today.key
        guard securedToday(today, streak), celebratedWeek != key else { return }
        celebratedWeek = key
        guard !reduceMotion else { return }
        var jump = Transaction()
        jump.disablesAnimations = true
        withTransaction(jump) {
            rolledWeeks = max(streak.weeks - 1, 0)
            popsToday = true
        }
        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(450))
            withAnimation(.spring(duration: 0.5, bounce: 0.45)) { popsToday = false }
            try? await Task.sleep(for: .milliseconds(250))
            withAnimation(.snappy(duration: 0.5)) { rolledWeeks = nil }
            celebrates += 1
        }
    }


    // MARK: - What the card says

    private struct Card {
        struct Meta { let text: String; var timed = false }
        var title: String
        var focus: String?
        var isRest = false
        var meta: Meta?
    }

    /// What each date puts in 1a's slots. The values are the account's own;
    /// the card shows only what 1a's hierarchy has room for, and the rest —
    /// a move, the volume, a gain since last time — waits one tap away in the
    /// preview or the results.
    private func card(for day: AgendaDay) -> Card {
        // A session that was started and paused is the one you are in the
        // middle of, whatever today's plan says.
        if day.isToday, let paused = app.resumableSession, let resumed = app.day(for: paused) {
            let planned = SessionPrescription.setCount(of: resumed, deload: app.activeDeload)
            return Card(
                title: resumed.short,
                focus: resumed.focus.isEmpty ? nil : resumed.focus,
                meta: .init(text: "\(paused.loggedSetCount) of \(max(planned, paused.plannedSetCount)) sets · paused")
            )
        }

        switch day.content {
        case .planned(let workout):
            // 1a: today reads "◷ 5 oefeningen · ~62 min"; another day only
            // what it holds, "20 sets".
            let exercises = workout.exercises.count == 1 ? "1 exercise" : "\(workout.exercises.count) exercises"
            return Card(
                title: workout.short,
                focus: workout.focus.isEmpty ? nil : workout.focus,
                meta: day.isToday
                    ? .init(text: "\(exercises) · ~\(WeekPlan.minutes(of: workout)) min", timed: true)
                    : .init(text: "\(WeekPlan.sets(of: workout)) sets")
            )

        case .missed(let workout):
            return Card(
                title: workout.short,
                focus: workout.focus.isEmpty ? nil : workout.focus,
                meta: .init(text: "\(WeekPlan.sets(of: workout)) sets · not logged")
            )

        case .session(let session):
            // 1a's done card: the word, what it was, how much of it was
            // done, and the way to the results. Volume and the sets
            // themselves are on the results.
            return Card(title: "Done", focus: session.dayLabel, meta: .init(text: doneLine(session)))

        case .rest:
            var card = Card(title: "Rest", focus: "Recovery is part of the plan", isRest: true)
            // Today's next session has its own card right below.
            if !day.isToday, let next = nextTraining(after: day.date), let workout = next.plannedDay {
                card.meta = .init(text: "\(Agenda.restLine(next: next)) · \(workout.short)")
            }
            return card
        }
    }

    /// "16 van 19 sets", from the counts stored with the session; an older
    /// session without them says how much of it was finished.
    private func doneLine(_ session: TrainingSession) -> String {
        if let planned = session.plannedSetCount, let completed = session.completedSetCount, planned > 0 {
            return "\(completed) of \(planned) sets"
        }
        return "\(session.completion)% done"
    }

    /// The next session still to come after a date, read the way the strip
    /// reads its week — across its end as well.
    private func nextTraining(after date: Date) -> AgendaDay? {
        Agenda.nextTraining(
            after: date,
            plan: app.schedulePlan,
            overrides: app.scheduleOverrides,
            sessions: app.sessions,
            deload: app.activeDeload
        )
    }

    // MARK: - What the card offers

    /// One commit per date. Today starts or resumes — the only lime action on
    /// this screen; every other date opens what it holds.
    @ViewBuilder
    private func cardActions(_ day: AgendaDay) -> some View {
        if day.isToday, let paused = app.resumableSession, let resumed = app.day(for: paused) {
            VStack(spacing: SL.Space.s1) {
                Button { onResume(resumed, paused) } label: { startLabel(resumeLabel(paused)) }
                    .buttonStyle(SLPrimaryButtonStyle())
            }
        } else if day.isToday, let workout = day.plannedDay {
            VStack(spacing: SL.Space.s1) {
                Button { onStart(workout) } label: { startLabel("Start training") }
                    .buttonStyle(SLPrimaryButtonStyle())
            }
        } else if let session = day.session {
            Button { openedSession = OpenedSession(id: session.id) } label: { chevroned("View workout") }
                .buttonStyle(SLOutlineButtonStyle())
        } else if day.isPast, let workout = day.plannedDay {
            // A day that has gone by with nothing logged. The work may well
            // have been done; this is where it gets written down, on the date
            // it happened rather than on today.
            VStack(spacing: SL.Space.s1) {
                Button { onLogPast(workout, day.date) } label: { chevroned("Log afterwards") }
                    .buttonStyle(SLOutlineButtonStyle())
                    .accessibilityHint("Logs \(workout.short) for \(Agenda.when(day.date))")
                Button { sheet = .agenda } label: { chevroned("Details in agenda") }
                    .buttonStyle(SLQuietButtonStyle())
            }
        } else if day.plannedDay != nil {
            Button { sheet = .agenda } label: { chevroned("Details in agenda") }
                .buttonStyle(SLOutlineButtonStyle())
                .accessibilityHint("Opens what's planned for \(Agenda.when(day.date)). Nothing starts.")
        } else {
            // A rest day: 1a's own label for it. The action sits where every
            // other date has one, so the card reads the same shape.
            Button { sheet = .agenda } label: { chevroned("Go to agenda") }
                .buttonStyle(SLOutlineButtonStyle())
                .accessibilityHint("Opens the agenda. That's where you change this day.")
        }
    }

    private func startLabel(_ title: String) -> some View {
        HStack(spacing: 10) {
            SLGlyph(name: .play, size: 16)
            Text(title)
        }
    }

    private func chevroned(_ title: String) -> some View {
        HStack(spacing: 6) {
            Text(title)
            SLGlyph(name: .chevronRight, size: 14).foregroundStyle(SL.Ink.secondary)
        }
    }

    private func resumeLabel(_ paused: ActiveSessionSnapshot) -> String {
        let when = app.pausedWhenLabel(for: paused)
        return when == "today" ? "Resume training" : "Resume training \(when)"
    }

    private var endMessage: String {
        guard let paused = app.resumableSession else { return "" }
        return paused.hasProgress
            ? (paused.loggedSetCount == 1
                ? "The set you logged is kept. The rest counts as not trained."
                : "The \(paused.loggedSetCount) sets you logged are kept. The rest counts as not trained.")
            : "You haven't logged anything, so nothing is kept."
    }

    // MARK: - Opening a day

    /// A day in the week opens that day — its results, its workout's
    /// preview, or what a rest day can become. Today's card stays today's.
    private func pick(_ day: AgendaDay) { open(day) }

    private func isPicked(_ day: AgendaDay) -> Bool { day.isToday }

    /// Remembered for the agenda, so it opens where it was left.
    private func select(_ day: AgendaDay) {
        selectedDate = day.isToday ? nil : day.date
    }

    /// A day from the week or Up next: its results once logged, its
    /// workout's preview while planned, and on a rest day what it can become.
    /// Looking never writes.
    private func open(_ day: AgendaDay) {
        if let session = day.session {
            openedSession = OpenedSession(id: session.id)
        } else if day.plannedDay != nil {
            sheet = .preview(day)
        } else {
            sheet = .plan(day.date)
        }
    }


    // MARK: - Herstel

    /// Shown while there is something to say: a proposal waiting for an
    /// answer, the lighter days it led to, or that it was just waved away.
    private var recoveryStatus: DeloadCard.Status? {
        // Read before anything can return: waving a proposal away is
        // remembered outside anything SwiftUI watches, so this flag is what
        // redraws the card — and a flag the body never read redraws nothing.
        let ignored = ignoredProposal
        if app.activeDeload != nil { return .applied }
        if ignored { return .ignored }
        return app.proposesDeload ? .open : nil
    }

    private func recoverySection(_ status: DeloadCard.Status) -> some View {
        VStack(alignment: .leading, spacing: SL.Space.s2) {
            // Headed like the page's other sections, the moon kept beside it.
            HStack(spacing: 6) {
                SLGlyph(name: .moon, size: 14).foregroundStyle(SL.Signal.recovery)
                SLOverline(text: "Herstel")
                    .accessibilityAddTraits(.isHeader)
            }
            .padding(.leading, SL.Space.s1)

            DeloadCard(
                reading: app.fatigue,
                proposal: app.activeDeload ?? Deload(startedAt: Date()),
                status: status,
                onApply: { Task { await app.applyDeload() } },
                onDismiss: {
                    ignoredProposal = true
                    app.dismissDeload()
                }
            )
        }
    }

    /// "Tomorrow", "Tue 13".
    private func whenLabel(_ day: AgendaDay) -> String {
        if Calendar.current.isDateInTomorrow(day.date) { return "Tomorrow" }
        return "\(String(WeekPlan.fullWeekday(day.date).prefix(3))) \(day.date.formatted(.dateTime.day()))"
    }

    // MARK: - Offline

    /// Sync failure is a state of the data, not a red box: amber says so, the
    /// reassurance is in plain words, and everything on the screen keeps
    /// working — logging is local.
    private var offlineCard: some View {
        SLAttentionCard(title: "Offline") {
            Text(offlineText.slUnbroken)
                .slBody()
                .slNumerals()
                .slLineHeight(SL.LineHeight.body, size: SL.TypeSize.body)
                .fixedSize(horizontal: false, vertical: true)
                .foregroundStyle(SL.Ink.primary)
            Button { Task { await app.syncNow() } } label: {
                Text(app.sync == .syncing ? "Syncing…" : "Try again now")
            }
            .buttonStyle(SLOutlineButtonStyle())
            .disabled(app.sync == .syncing)
            .padding(.top, SL.Space.s2)
        }
    }

    private var offlineText: String {
        let count = queue.count
        let waiting = count == 0 ? ""
            : count == 1 ? " 1 change waiting to sync."
            : " \(count) changes waiting to sync."
        return "Nothing lost: everything is saved on this phone.\(waiting) Logging works offline; syncing happens as soon as you're connected."
    }

    private var queueSection: some View {
        VStack(alignment: .leading, spacing: SL.Space.s2) {
            SLSectionHead(title: "Waiting to sync")
            VStack(spacing: 0) {
                ForEach(Array(queue.enumerated()), id: \.offset) { index, row in
                    HStack(alignment: .center, spacing: SL.Space.s3) {
                        VStack(alignment: .leading, spacing: 3) {
                            Text(row.title).slLead().foregroundStyle(SL.Ink.primary)
                            Text(row.detail).slBody().slNumerals().foregroundStyle(SL.Ink.secondary)
                        }
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        Text("Wacht").slMeta(SL.Weight.semibold).foregroundStyle(SL.Signal.attention)
                    }
                    .padding(.horizontal, SL.Space.s4)
                    .padding(.vertical, SL.Space.s3)
                    .frame(minHeight: 72)
                    .overlay(alignment: .top) { if index > 0 { SLHairline() } }
                    .accessibilityElement(children: .combine)
                }
            }
            .slBorderBox()
            .slListCard()

            Text("SETLINE saves on your phone first and syncs after. Export works offline too.")
                .slMeta()
                .slLineHeight(SL.LineHeight.body, size: SL.TypeSize.meta)
                .fixedSize(horizontal: false, vertical: true)
                .foregroundStyle(SL.Ink.secondary)
                .padding(.horizontal, SL.Space.s1)
        }
    }
}

/// What has played once since launch, so a tab switch does not replay it.
@MainActor
enum TrainingIntro {
    static var played = false
}

/// Icon and text small and quiet, side by side: "▤ 19 sets".
private struct CompactLabel: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 3) {
            configuration.icon.font(.system(size: 10, weight: .semibold))
            configuration.title.font(.sl(SL.TypeSize.micro, SL.Weight.medium))
        }
        .foregroundStyle(SL.Ink.secondary)
        .lineLimit(1)
    }
}
