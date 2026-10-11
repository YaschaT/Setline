import SwiftUI
import SetlineCore

/// Training — the streak, the week and today, as one hero card.
///
/// The card reads top to bottom: the streak, the week it is built from, and
/// today's workout that adds to it. A day in the week, or a row in Up next,
/// opens that day. Looking never writes: a session starts from `Start training`
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

    @State private var confirmsEnd = false
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
    /// What Tally is saying, if anything, and how often it was tapped.
    @State private var mascotLine: String?
    @State private var mascotTaps = 0
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

        var id: String {
            switch self {
            case .agenda: return "agenda"
            case .alerts: return "alerts"
            case .streak: return "streak"
            case .milestones: return "milestones"
            case .badge(let item): return "badge-\(item.id)"
            case .preview(let day): return "preview-\(day.key)"
            case .plan(let date): return "plan-\(Schedule.dateKey(date))"
            }
        }
    }

    // MARK: - What the screen reads

    /// The week the strip shows: the one the selected date falls in, so
    /// picking a date in the agenda brings its week back with it.
    private var week: [AgendaDay] { days(containing: selectedDate ?? Date()) }

    /// The seven days after today, across the end of the week: what is
    /// coming, never empty on a Sunday.
    private var upcoming: [AgendaDay] {
        let next = Calendar.current.date(byAdding: .day, value: 7, to: Date()) ?? Date()
        let all = days(containing: Date()) + days(containing: next)
        return Array(all.filter { !$0.isPast && !$0.isToday }.prefix(7))
    }

    private func days(containing date: Date) -> [AgendaDay] {
        Agenda.week(
            containing: date,
            plan: app.plan,
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
                VStack(alignment: .leading, spacing: SL.Space.s4) {
                    if isOffline { offlineCard }
                    if let today = days(containing: Date()).first(where: \.isToday) {
                        hero(today)
                        underHero(today)
                    }
                    if let status = recoveryStatus {
                        recoverySection(status)
                            .padding(.top, Self.afterCard)
                    }
                    if !upcoming.isEmpty {
                        upNext
                            .padding(.top, recoveryStatus == nil ? Self.afterCard : Self.betweenSections)
                    }
                    if isOffline, !queue.isEmpty { queueSection }
                }
                .padding(.horizontal, SL.Space.gutterSession)
                .padding(.top, SL.Metric.tabContentTop)
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
        #if DEBUG
        // `-SetlineAgenda` and `-SetlinePreview` open the two sheets, so they
        // can be looked at on any simulator without driving taps.
        .task {
            let arguments = ProcessInfo.processInfo.arguments
            try? await Task.sleep(for: .milliseconds(600))
            if arguments.contains("-SetlineAgenda") {
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
            plan: app.plan,
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
        SLTabHeader(title: greeting, subtitle: longDate, ring: tierRing, onAccount: onAccount) {
            agendaButton
            alertsBell
        }
    }

    /// The way to planning and results, beside the bell where a calendar is
    /// looked for.
    private var agendaButton: some View {
        Button { sheet = .agenda } label: {
            SLGlyph(name: .calendar, size: 16)
                .foregroundStyle(SL.Ink.primary)
                .frame(width: 38, height: 38)
                .background(Circle().fill(SL.Surface.raised))
                .overlay(Circle().strokeBorder(SL.Surface.hairline, lineWidth: SL.Metric.border))
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
        let count = app.missedDays.count
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
                    }
                }
                .frame(width: SL.Space.hitMin, height: SL.Space.hitMin)
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .slFocusRing(Circle())
        .accessibilityLabel(count == 0 ? "Alerts" : "Alerts, \(count) not logged")
        .accessibilityHint("Shows workouts you haven't logged yet")
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

    /// "Hoi Yascha", or just "Hoi" until a name is given in Account.
    private var greeting: String {
        app.greetingName.map { "Hi \($0)" } ?? "Hi"
    }

    /// "Woensdag 9 september" — the date the card is on.
    private var longDate: String { SLDateText.long(Date()) }

    // MARK: - The hero

    /// One card for the one story the screen tells: the streak, the week it
    /// is built from, and today's workout that adds to it — top to bottom,
    /// the number first because it is the reason, the button last because it
    /// is the act.
    private func hero(_ today: AgendaDay) -> some View {
        let streak = app.streak
        let secured = securedToday(today, streak)
        let earned = earnedToday
        return VStack(alignment: .leading, spacing: 0) {
            // One layout at every streak, zero included, so the card never
            // changes shape when a streak starts or lapses. Tally stands
            // beside the number it is the face of.
            HStack(alignment: .bottom, spacing: SL.Space.s2) {
                streakRow(streak, secured: secured)
                mascot(today, streak)
            }
            .overlay(alignment: .bottomTrailing) { mascotBubble }
            .zIndex(1)
            weekDots
                .padding(.top, SL.Space.s5)
            heroDivider(lit: secured)
            if let badge = earned.first {
                Button { sheet = .badge(badge) } label: {
                    EarnedBadgeRow(milestone: badge, next: nextMilestone(after: badge)).contentShape(Rectangle())
                }
                .buttonStyle(SLPressStyle())
                .padding(.bottom, SL.Space.s5)
            }
            todayBlock(selectedDay ?? today)
                .id(selectedDay?.key ?? today.key)
                .transition(.opacity)
        }
        .animation(.easeOut(duration: SL.Motion.base), value: selectedDate)
        .padding(.horizontal, SL.Space.s5)
        .padding(.top, SL.Space.s5)
        .padding(.bottom, SL.Space.s5)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(heroBackground(lit: secured, streak: streak))
        .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .strokeBorder(secured ? SL.Signal.action.opacity(0.45) : SL.Surface.hairlineStrong.opacity(0.6),
                              lineWidth: SL.Metric.border)
        )
        .shadow(color: secured ? SL.Signal.action.opacity(0.14) : .clear, radius: 24)
        .accessibilityElement(children: .contain)
        .onAppear {
            celebrateIfSecured(today, streak)
            playIntro(streak)
            #if DEBUG
            if ProcessInfo.processInfo.arguments.contains("-SetlineBadges") { sheet = .milestones }
            // `-SetlinePickDay 3` shows the week's Wednesday in the card.
            let arguments = ProcessInfo.processInfo.arguments
            if let flag = arguments.firstIndex(of: "-SetlinePickDay"), arguments.indices.contains(flag + 1),
               let index = Int(arguments[flag + 1]), days(containing: Date()).indices.contains(index - 1) {
                selectedDate = days(containing: Date())[index - 1].date
            }
            // `-SetlineMascotTalk` opens with Tally's first line showing.
            if ProcessInfo.processInfo.arguments.contains("-SetlineMascotTalk") {
                mascotLine = mascotLines(today, streak).first
            }
            #endif
        }
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

    private func heroDivider(lit: Bool) -> some View {
        Rectangle()
            .fill(lit ? SL.Signal.action.opacity(0.18) : SL.Surface.hairline)
            .frame(height: SL.Metric.border)
            .padding(.horizontal, -SL.Space.s5)
            .padding(.vertical, SL.Space.s5)
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

    /// The streak as the number, and what this week still asks under its
    /// label. Opens the streak sheet, where the best, the freeze and the
    /// badges are.
    private func streakRow(_ streak: TrainingStreak, secured: Bool) -> some View {
        let left = max(streak.thisWeekGoal - streak.thisWeekDone, 0)
        let lit = streak.weeks > 0
        let nudge = streak.thisWeekMet ? "Week secured"
            : !lit ? (left == 1 ? "1 workout starts your streak" : "\(left) workouts start your streak")
            : left == 1 ? "1 to go this week" : "\(left) to go this week"
        let shown = rolledWeeks ?? streak.weeks
        return Button { sheet = .streak } label: {
            HStack(alignment: .bottom, spacing: SL.Space.s3) {
                Text("\(shown)")
                    .font(.slCapped(96, SL.Weight.bold, maxScale: 1.2, relativeTo: .largeTitle))
                    .tracking(-5)
                    .monospacedDigit()
                    .foregroundStyle(lit ? SL.Signal.action : SL.Ink.primary)
                    .contentTransition(.numericText(value: Double(shown)))
                    .lineLimit(1)
                    .padding(.vertical, -13)
                    .overlay(alignment: .topTrailing) {
                        if secured {
                            Text("+1")
                                .font(.slFixed(11, SL.Weight.bold))
                                .foregroundStyle(SL.Signal.onAction)
                                .padding(.horizontal, 5)
                                .padding(.vertical, 2)
                                .background(Capsule().fill(SL.Signal.action))
                                .offset(x: 16, y: -8)
                        }
                    }
                VStack(alignment: .leading, spacing: 2) {
                    Text("week streak")
                        .slLead(SL.Weight.semibold)
                        .foregroundStyle(SL.Ink.primary)
                    HStack(spacing: 4) {
                        if streak.thisWeekMet { SLGlyph(name: .check, size: 12) }
                        Text(nudge).slMeta(SL.Weight.semibold).slNumerals()
                    }
                    // Lime is for what is earned: "Week secured", not the
                    // count still to go.
                    .foregroundStyle(streak.thisWeekMet ? SL.Signal.action : SL.Ink.secondary)
                }
                .fixedSize(horizontal: false, vertical: true)
                .padding(.bottom, 2)
                .padding(.leading, secured ? SL.Space.s3 : 0)
                Spacer(minLength: 0)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(SLPressStyle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(streak.weeks == 1 ? "1-week streak" : "\(streak.weeks)-week streak"). \(nudge).")
        .accessibilityHint("Shows your streak and badges")
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
                .accessibilityHint(isPicked(day) && !day.isToday ? "Opens this day" : "Shows this day in the card")
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
                    if app.resumableSession != nil { moreMenu }
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
            Button {
                if workout != nil, !isDone { sheet = .preview(day) } else { open(day) }
            } label: {
                HStack(alignment: .firstTextBaseline, spacing: SL.Space.s2) {
                    Text(isDone ? (day.session?.dayLabel ?? content.title) : content.title)
                        .font(.sl(SL.TypeSize.display, SL.Weight.bold))
                        .tracking(-0.02 * SL.TypeSize.display)
                        .foregroundStyle(content.isRest ? SL.Signal.recovery : SL.Ink.primary)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                    SLGlyph(name: .chevronRight, size: 16)
                        .foregroundStyle(SL.Ink.tertiary)
                    Spacer(minLength: 0)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(SLPressStyle())
            .padding(.top, 2)
            .accessibilityHint(isDone ? "Shows the results" : workout != nil ? "Shows today's exercises. Nothing starts." : "Opens this day")

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

            if day.isToday, isDone || content.isRest {
                nextUp(after: day)
                    .padding(.top, SL.Space.s4)
            } else {
                cardActions(day)
                    .padding(.top, SL.Space.s5)
            }
        }
    }

    /// Under the hero, in the order a lifter reads them: how to make today
    /// count, then what it all adds up to.
    @ViewBuilder
    private func underHero(_ today: AgendaDay) -> some View {
        let isDone = today.session != nil && app.resumableSession == nil
        let workout = today.plannedDay ?? app.resumableSession.flatMap { app.day(for: $0) }
        let lifts = (isDone ? nil : workout).map { app.liftsReady(in: $0) } ?? []
        if !lifts.isEmpty {
            ReadyLiftsCard(lifts: lifts, display: app.display)
        }
        if earnedToday.isEmpty, let goal = badgeGoal(for: today, isDone: isDone) {
            NextBadgeCard(
                milestone: goal.milestone,
                unlocks: goal.unlocks,
                onOpen: { sheet = .badge(goal.milestone) },
                onAll: { sheet = .milestones }
            )
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
            return [("\(completed)/\(planned)", "sets"), ("\(session.completion)%", "done")]
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
                    }
                    Spacer(minLength: SL.Space.s2)
                }
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(items.map { "\($0.value) \($0.label)" }.joined(separator: ", "))
    }

    /// After today's work, or on a rest day: the next workout, one tap away.
    @ViewBuilder
    private func nextUp(after day: AgendaDay, lead: String? = nil) -> some View {
        if let next = nextTraining(after: day.date), let workout = next.plannedDay {
            Button { open(next) } label: {
                HStack(spacing: SL.Space.s2) {
                    Text(lead ?? (day.isRest ? "Rest today." : "Recover well."))
                        .slBody(SL.Weight.semibold)
                        .foregroundStyle(lead == nil ? SL.Signal.recovery : SL.Ink.primary)
                    Text(lead == nil
                         ? "Next: \(workout.short) \(Agenda.when(next.date))"
                         : "\(workout.short) · \(Agenda.when(next.date)) · \(WeekPlan.sets(of: workout)) sets")
                        .slBody()
                        .foregroundStyle(SL.Ink.secondary)
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                    Spacer(minLength: 0)
                    SLGlyph(name: .chevronRight, size: 12).foregroundStyle(SL.Ink.tertiary)
                }
                .padding(.horizontal, SL.Space.s3)
                .frame(minHeight: 48)
                .overlay(
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .strokeBorder(SL.Surface.hairlineStrong.opacity(0.7), lineWidth: 1)
                )
                .contentShape(Rectangle())
            }
            .buttonStyle(SLPressStyle())
        }
    }

    // MARK: - Tally

    private func mascotMood(_ today: AgendaDay, _ streak: TrainingStreak) -> TallyMascot.Mood {
        if streak.thisWeekMet { return .struck }
        if today.isLogged { return .proud }
        if today.isRest { return .resting }
        if let workout = today.plannedDay, !app.liftsReady(in: workout).isEmpty { return .focused }
        return .ready
    }

    private func mascot(_ today: AgendaDay, _ streak: TrainingStreak) -> some View {
        Button {
            mascotTaps += 1
            let lines = mascotLines(today, streak)
            withAnimation(.spring(response: 0.3, dampingFraction: 0.75)) {
                mascotLine = lines[(mascotTaps - 1) % lines.count]
            }
            let shown = mascotLine
            Task { @MainActor in
                try? await Task.sleep(for: .seconds(3.5))
                if mascotLine == shown { withAnimation(.easeOut(duration: 0.2)) { mascotLine = nil } }
            }
        } label: {
            TallyMascot(
                done: streak.thisWeekDone,
                goal: streak.thisWeekGoal,
                mood: mascotMood(today, streak),
                jumps: mascotTaps
            )
            .padding(SL.Space.s1)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .sensoryFeedback(.impact(flexibility: .soft, intensity: 0.8), trigger: mascotTaps)
        .accessibilityLabel("Tally, \(min(streak.thisWeekDone, streak.thisWeekGoal)) of \(streak.thisWeekGoal) workouts this week")
        .accessibilityHint("Says how your week is going")
    }

    /// What Tally says, always from the account's own numbers. A tap moves
    /// to the next line.
    private func mascotLines(_ today: AgendaDay, _ streak: TrainingStreak) -> [String] {
        let left = max(streak.thisWeekGoal - streak.thisWeekDone, 0)
        let next = nextTraining(after: today.date).flatMap { day in day.plannedDay.map { "\($0.short) \(Agenda.when(day.date))" } }
        switch mascotMood(today, streak) {
        case .struck:
            return [streak.weeks == 1 ? "Week struck. Your streak has started." : "Week struck. That's \(streak.weeks) in a row.",
                    "Nothing left to prove this week. Rest well."]
        case .proud:
            return [left == 0 ? "Logged. That's the week." : left == 1 ? "Logged. One more strikes the week." : "Logged. \(left) to go this week.",
                    "Good session. Eat, sleep, come back stronger."]
        case .resting:
            return ["Rest counts too. My bars need it.", next.map { "Next up: \($0)." } ?? "See you next session."]
        case .focused:
            let lifts = today.plannedDay.map { app.liftsReady(in: $0) } ?? []
            return [lifts.count == 1 ? "\(lifts[0].name) can go up today." : "\(lifts.count) lifts can go up today. \(lifts.first?.name ?? "Bench") first?",
                    left == 1 ? "One more and the week is struck." : "\(left) to go this week. Today's the next one."]
        case .ready:
            if streak.weeks == 0 {
                return ["Every bar is a workout. Fill them all to start a streak.",
                        left == 1 ? "One more and the week is struck." : "\(left) to go. Today's the next one."]
            }
            return [left == 1 ? "One more and the week is struck." : "\(left) to go this week. Today's the next one.",
                    "Keep the \(streak.weeks)-week streak alive."]
        }
    }

    @ViewBuilder
    private var mascotBubble: some View {
        if let mascotLine {
            Text(mascotLine)
                .slMeta(SL.Weight.medium)
                .foregroundStyle(SL.Ink.primary)
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.horizontal, SL.Space.s3)
                .padding(.vertical, SL.Space.s2)
                .background(
                    UnevenRoundedRectangle(topLeadingRadius: 14, bottomLeadingRadius: 14, bottomTrailingRadius: 14, topTrailingRadius: 4, style: .continuous)
                        .fill(SL.Surface.raised2)
                )
                .overlay(
                    UnevenRoundedRectangle(topLeadingRadius: 14, bottomLeadingRadius: 14, bottomTrailingRadius: 14, topTrailingRadius: 4, style: .continuous)
                        .strokeBorder(SL.Surface.hairlineStrong, lineWidth: SL.Metric.border)
                )
                .frame(maxWidth: 220, alignment: .trailing)
                .offset(y: 44)
                .transition(.scale(scale: 0.6, anchor: .topTrailing).combined(with: .opacity))
                .allowsHitTesting(false)
                .accessibilityAddTraits(.updatesFrequently)
        }
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
            var card = Card(title: "Rest", focus: "No training planned", isRest: true)
            if let next = nextTraining(after: day.date), let workout = next.plannedDay {
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
            plan: app.plan,
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
            Button { openedSession = OpenedSession(id: session.id) } label: { chevroned("View results") }
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

    /// Added to the page's 16 between blocks.
    private static let afterCard = SL.Space.s5
    private static let betweenSections = SL.Space.s4

    /// A day in the card's week: the first tap shows it in the card, a
    /// second opens it; today always brings the card back to today.
    private func pick(_ day: AgendaDay) {
        if day.isToday {
            withAnimation(.easeOut(duration: SL.Motion.base)) { selectedDate = nil }
        } else if isPicked(day) {
            open(day)
        } else {
            withAnimation(.easeOut(duration: SL.Motion.base)) { selectedDate = day.date }
        }
    }

    private func isPicked(_ day: AgendaDay) -> Bool {
        selectedDate.map { Schedule.dateKey($0) == day.key } ?? day.isToday
    }

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

    // MARK: - Up next

    /// What the week still holds after today: one slim row a day, the
    /// agenda one tap away for the rest.
    // MARK: - Up next

    /// What is coming, as a row of cards rather than a list: the week marks
    /// in the card say how the week went, these say what the next days hold.
    /// A workout gets its symbol, its name and its size; a rest day folds to
    /// a slim mint card, so the training days stand out at a glance.
    private var upNext: some View {
        let firstWorkout = upcoming.first { $0.plannedDay != nil }?.key
        return VStack(alignment: .leading, spacing: SL.Space.s2) {
            HStack(alignment: .center) {
                SLOverline(text: "Up next")
                    .accessibilityAddTraits(.isHeader)
                Spacer()
                Button { sheet = .agenda } label: {
                    HStack(spacing: 4) {
                        Text("Agenda").slMeta(SL.Weight.semibold)
                        SLGlyph(name: .chevronRight, size: 12)
                    }
                    .foregroundStyle(SL.Ink.secondary)
                    .frame(minHeight: SL.Space.hitMin)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityHint("Opens planning and results")
            }
            .padding(.leading, SL.Space.s1)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(alignment: .top, spacing: SL.Space.s2) {
                    ForEach(upcoming) { day in
                        if day.plannedDay != nil {
                            upNextCard(day, isNext: day.key == firstWorkout)
                        } else {
                            restCard(day)
                        }
                    }
                }
                .scrollTargetLayout()
            }
            .scrollTargetBehavior(.viewAligned)
            .contentMargins(.horizontal, SL.Space.gutterSession, for: .scrollContent)
            .padding(.horizontal, -SL.Space.gutterSession)
        }
    }

    /// "Tomorrow", "Tue 13".
    private func whenLabel(_ day: AgendaDay) -> String {
        if Calendar.current.isDateInTomorrow(day.date) { return "Tomorrow" }
        return "\(String(WeekPlan.fullWeekday(day.date).prefix(3))) \(day.date.formatted(.dateTime.day()))"
    }

    private func upNextCard(_ day: AgendaDay, isNext: Bool) -> some View {
        let workout = day.plannedDay!
        return Button { open(day) } label: {
            VStack(alignment: .leading, spacing: 0) {
                HStack(alignment: .top) {
                    SLWorkoutSymbol(dayName: workout.short, size: 20)
                        .foregroundStyle(isNext ? SL.Signal.onAction : SL.Signal.action)
                        .frame(width: 40, height: 40)
                        .background(
                            RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous)
                                .fill(isNext ? SL.Signal.action : SL.Signal.actionTint)
                        )
                    Spacer(minLength: SL.Space.s2)
                    Text(whenLabel(day).uppercased())
                        .font(.sl(SL.TypeSize.micro, SL.Weight.bold))
                        .tracking(0.8)
                        .foregroundStyle(isNext ? SL.Signal.action : SL.Ink.secondary)
                        .lineLimit(1)
                }
                Spacer(minLength: SL.Space.s4)
                Text(workout.short)
                    .font(.sl(SL.TypeSize.title, SL.Weight.bold))
                    .foregroundStyle(SL.Ink.primary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                if !workout.focus.isEmpty {
                    Text(Self.sentenceCase(workout.focus))
                        .slMeta()
                        .foregroundStyle(SL.Ink.secondary)
                        .lineLimit(1)
                        .padding(.top, 1)
                }
                HStack(spacing: SL.Space.s2) {
                    Label("\(WeekPlan.sets(of: workout)) sets", systemImage: "square.stack.3d.up")
                    Label("~\(WeekPlan.minutes(of: workout)) min", systemImage: "clock")
                }
                .labelStyle(CompactLabel())
                .padding(.top, SL.Space.s3)
            }
            .padding(SL.Space.s4)
            .frame(width: 172, height: 168, alignment: .topLeading)
            .background(
                RoundedRectangle(cornerRadius: SL.Radius.xl, style: .continuous)
                    .fill(SL.Surface.raised)
            )
            .overlay(
                RoundedRectangle(cornerRadius: SL.Radius.xl, style: .continuous)
                    .strokeBorder(isNext ? SL.Signal.action.opacity(0.45) : SL.Surface.hairline, lineWidth: 1)
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(SLPressStyle(scale: 0.96))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(whenLabel(day)), \(workout.short), \(WeekPlan.sets(of: workout)) sets, about \(WeekPlan.minutes(of: workout)) minutes")
        .accessibilityHint("Shows the exercises. Nothing starts.")
    }

    private func restCard(_ day: AgendaDay) -> some View {
        Button { open(day) } label: {
            VStack(spacing: SL.Space.s2) {
                Text(whenLabel(day).uppercased())
                    .font(.sl(SL.TypeSize.micro, SL.Weight.bold))
                    .tracking(0.8)
                    .foregroundStyle(SL.Ink.secondary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                Spacer(minLength: 0)
                SLGlyph(name: .moon, size: 18, fixed: true)
                    .foregroundStyle(SL.Signal.recovery)
                Text("Rest")
                    .slBody(SL.Weight.semibold)
                    .foregroundStyle(SL.Signal.recovery)
                Spacer(minLength: 0)
            }
            .padding(.vertical, SL.Space.s4)
            .padding(.horizontal, SL.Space.s2)
            .frame(width: 84, height: 168)
            .background(
                RoundedRectangle(cornerRadius: SL.Radius.xl, style: .continuous)
                    .fill(SL.Signal.recoveryTint.opacity(0.5))
            )
            .overlay(
                RoundedRectangle(cornerRadius: SL.Radius.xl, style: .continuous)
                    .strokeBorder(SL.Signal.recovery.opacity(0.2), lineWidth: 1)
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(SLPressStyle(scale: 0.96))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(whenLabel(day)), rest day")
        .accessibilityHint("Opens this day")
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
