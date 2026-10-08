import SwiftUI
import SetlineCore

/// Redesign 1a · "Agenda · Planning en resultaten".
///
/// One week at a time: how much of it is done, its seven days, and the
/// sessions of the week before with the best set of each. The design draws
/// this week only; the app has always let you look further, so the week can
/// be stepped and a whole month opened to jump to a date.
///
/// It reads dates. A row opens what its day holds — the results of a session
/// that was saved, the exercises of one that is planned, the choice of what a
/// rest day should become — and nothing is written until that choice is made
/// in "Change this day".
struct AgendaSheet: View {
    @Environment(AppState.self) private var app

    /// The date whose day is selected on Training.
    let selectedKey: String
    /// Puts Training on a date picked from the month.
    let onSelect: (AgendaDay) -> Void
    /// Opens a planned day's exercises, which takes the agenda's place.
    let onPreview: (AgendaDay) -> Void
    let onClose: () -> Void

    /// A date inside the week, or the month, being shown.
    @State private var anchor: Date
    @State private var showsMonth = false
    @State private var openedSession: OpenedSession?
    @State private var planning: PlannedDate?
    /// Holding a row opens "Change this day"; the tap that ends the hold must
    /// not open the row as well.
    @State private var heldRow = false

    private struct OpenedSession: Identifiable { let id: String }
    private struct PlannedDate: Identifiable { let date: Date; var id: String { Schedule.dateKey(date) } }

    init(
        initialDate: Date,
        selectedKey: String,
        onSelect: @escaping (AgendaDay) -> Void,
        onPreview: @escaping (AgendaDay) -> Void,
        onClose: @escaping () -> Void
    ) {
        self.selectedKey = selectedKey
        self.onSelect = onSelect
        self.onPreview = onPreview
        self.onClose = onClose
        _anchor = State(initialValue: initialDate)
    }

    var body: some View {
        SLSheet(title: "Agenda", subtitle: "Planning and results", onClose: onClose) {
            VStack(alignment: .leading, spacing: SL.Space.s3) {
                stepper
                tools
                if showsMonth {
                    month
                } else {
                    summary
                    SLSectionHead(title: weekLabel, meta: WeekPlan.range(week.map(\.date)))
                    weekList
                    if !previousSessions.isEmpty {
                        SLSectionHead(
                            title: isThisWeek ? "Last week" : "Week before",
                            meta: WeekPlan.range(previousWeekDates)
                        )
                        .padding(.top, SL.Space.s1)
                        previousList
                    }
                }
            }
        }
        .fullScreenCover(item: $openedSession) { opened in
            SessionDetailView(sessionID: opened.id, onClose: { openedSession = nil })
        }
        .sheet(item: $planning) { target in
            DayPlanSheet(
                plan: dayPlan(for: target.date),
                onApply: { option in
                    let plan = dayPlan(for: target.date)
                    planning = nil
                    guard let change = plan.change(for: option, programKey: app.programKey) else { return }
                    Task { await app.record([change]) }
                },
                onOpenSession: { session in
                    planning = nil
                    openedSession = OpenedSession(id: session.id)
                },
                onClose: { planning = nil }
            )
        }
        .onChange(of: planning?.id) { _, open in
            if open == nil { heldRow = false }
        }
    }

    // MARK: - What is shown

    private var week: [AgendaDay] { days(containing: anchor) }

    private func days(containing date: Date) -> [AgendaDay] {
        Agenda.week(
            containing: date,
            plan: app.plan,
            overrides: app.scheduleOverrides,
            sessions: app.sessions,
            deload: app.activeDeload
        )
    }

    private var weekLabel: String { Agenda.weekLabel(containing: anchor) }
    private var isThisWeek: Bool { week.contains(where: \.isToday) }

    private func dayPlan(for date: Date) -> DayPlan {
        DayPlan.make(
            for: date,
            plan: app.plan,
            overrides: app.scheduleOverrides,
            sessions: app.sessions,
            deload: app.activeDeload
        )
    }

    // MARK: - Stepping

    /// The week, or with the month open the month, and a step either side.
    private var stepper: some View {
        HStack(spacing: SL.Space.s2) {
            step(.chevronLeft, label: showsMonth ? "Previous month" : "Previous week", by: -1)
            VStack(spacing: 0) {
                Text(showsMonth ? monthLabel : weekLabel)
                    .slLead()
                    .foregroundStyle(SL.Ink.primary)
                if !showsMonth {
                    Text(WeekPlan.range(week.map(\.date)))
                        .slMeta()
                        .slNumerals()
                        .foregroundStyle(SL.Ink.secondary)
                }
            }
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity)
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits(.isHeader)
            step(.chevronRight, label: showsMonth ? "Next month" : "Next week", by: 1)
        }
    }

    private func step(_ glyph: SLGlyph.Name, label: String, by direction: Int) -> some View {
        Button {
            let component: Calendar.Component = showsMonth ? .month : .weekOfYear
            guard let next = Calendar.current.date(byAdding: component, value: direction, to: anchor) else { return }
            anchor = next
        } label: {
            SLGlyph(name: glyph, size: 18)
                .foregroundStyle(SL.Ink.secondary)
                .frame(width: SL.Space.hitMin, height: SL.Space.hitMin)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .slFocusRing(RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous))
        .accessibilityLabel(label)
    }

    private var tools: some View {
        HStack(spacing: SL.Space.s2) {
            if showsMonth ? !monthHoldsToday : !isThisWeek {
                Button {
                    anchor = Date()
                } label: { Text(showsMonth ? "This month" : "This week") }
                    .buttonStyle(SLOutlineButtonStyle())
            }
            Button {
                showsMonth.toggle()
            } label: {
                HStack(spacing: 6) {
                    SLGlyph(name: .calendar, size: 16)
                    Text(showsMonth ? "Show week" : "Whole month")
                }
            }
            .buttonStyle(SLOutlineButtonStyle())
            .accessibilityHint(showsMonth ? "Shows one week again" : "Shows a month to pick a date")
        }
    }

    // MARK: - The month

    private var monthLabel: String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US")
        formatter.dateFormat = "MMMM yyyy"
        return formatter.string(from: anchor).capitalized
    }

    private var monthHoldsToday: Bool {
        Calendar.current.isDate(anchor, equalTo: Date(), toGranularity: .month)
    }

    /// Every week that touches the month, Monday first.
    private var monthWeeks: [[AgendaDay]] {
        let calendar = Calendar.current
        guard let interval = calendar.dateInterval(of: .month, for: anchor),
              let lastDay = calendar.date(byAdding: .day, value: -1, to: interval.end)
        else { return [] }
        var weeks: [[AgendaDay]] = []
        var cursor = interval.start
        while true {
            let week = days(containing: cursor)
            weeks.append(week)
            guard let last = week.last?.date, last < calendar.startOfDay(for: lastDay),
                  let next = calendar.date(byAdding: .day, value: 7, to: cursor)
            else { break }
            cursor = next
        }
        return weeks
    }

    private var month: some View {
        let calendar = Calendar.current
        return VStack(spacing: 2) {
            HStack(spacing: 2) {
                ForEach(Array((monthWeeks.first ?? []).enumerated()), id: \.offset) { _, day in
                    Text(day.weekday)
                        .font(.sl(SL.TypeSize.micro, SL.Weight.regular))
                        .foregroundStyle(SL.Ink.secondary)
                        .frame(maxWidth: .infinity)
                }
            }
            .padding(.bottom, SL.Space.s1)
            .accessibilityHidden(true)

            ForEach(Array(monthWeeks.enumerated()), id: \.offset) { _, week in
                HStack(spacing: 2) {
                    ForEach(week) { day in
                        monthDay(day, inMonth: calendar.isDate(day.date, equalTo: anchor, toGranularity: .month))
                    }
                }
            }
        }
        .padding(SL.Space.s3)
        .slBorderBox()
        .slListCard(raised: true)
    }

    private func monthDay(_ day: AgendaDay, inMonth: Bool) -> some View {
        let isSelected = day.key == selectedKey
        let ink: Color = isSelected ? SL.Signal.onAction
            : day.isToday ? SL.Signal.action
            : inMonth ? SL.Ink.primary : SL.Ink.secondary
        return Button {
            onSelect(day)
            anchor = day.date
            showsMonth = false
        } label: {
            Text("\(day.dayNumber)")
                .slBody(SL.Weight.semibold)
                .slNumerals()
                .foregroundStyle(ink)
                .frame(maxWidth: .infinity)
                .frame(minHeight: SL.Space.hitMin)
                .background(
                    RoundedRectangle(cornerRadius: SL.Radius.md, style: .continuous)
                        .fill(isSelected ? SL.Signal.action : Color.clear)
                )
                // A session saved on the day: the same dot wherever it shows.
                .overlay(alignment: .bottom) {
                    if day.isLogged {
                        Circle()
                            .fill(isSelected ? SL.Signal.onAction : SL.Signal.action)
                            .frame(width: 4, height: 4)
                            .padding(.bottom, 6)
                    }
                }
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(StripDay.spokenLabel(day))
        .accessibilityAddTraits(isSelected ? [.isSelected, .isButton] : .isButton)
    }

    // MARK: - The week, counted

    private var summary: some View {
        let trained = week.filter { !$0.isRest }.count
        let done = week.filter(\.isLogged).count
        let isAhead = week.allSatisfy { !$0.isToday && !$0.isPast }
        let count = isAhead ? "\(trained)" : "\(done) of \(trained)"
        let noun = trained == 1 && isAhead ? "workout" : "workouts"
        let rest = isAhead
            ? " \(noun) planned \(weekLabel.lowercased())"
            : " \(noun) done \(weekLabel.lowercased())"
        return VStack(alignment: .leading, spacing: SL.Space.s2) {
            (Text(count).font(.sl(SL.TypeSize.lead, SL.Weight.semibold)).foregroundStyle(SL.Ink.primary)
                + Text(rest).font(.sl(SL.TypeSize.body, SL.Weight.regular)).foregroundStyle(SL.Ink.secondary))
                .slNumerals()
                .fixedSize(horizontal: false, vertical: true)

            HStack(spacing: SL.Space.s1) {
                ForEach(week) { day in
                    Capsule().fill(segment(day)).frame(height: 6)
                }
            }
            .accessibilityHidden(true)
        }
        .padding(.horizontal, SL.Space.s1)
        .padding(.top, SL.Space.s1)
        .padding(.bottom, SL.Space.s2)
    }

    private func segment(_ day: AgendaDay) -> Color {
        if day.isLogged { return SL.Signal.action }
        if day.isRest { return SL.Signal.recovery.opacity(0.25) }
        if day.isToday { return SL.Signal.action.opacity(0.45) }
        return SL.Surface.hairlineStrong
    }

    // MARK: - The week's days

    private var weekList: some View {
        VStack(spacing: 0) {
            ForEach(Array(week.enumerated()), id: \.element.id) { index, day in
                dayRow(day)
                    .overlay(alignment: .top) { if index > 0 { SLHairline() } }
            }
        }
        .slBorderBox()
        .slListCard(raised: true)
    }

    private func dayRow(_ day: AgendaDay) -> some View {
        let highlighted = day.isToday && !day.isLogged && !day.isRest
        return Button {
            if heldRow { heldRow = false } else { open(day) }
        } label: {
            SLAdaptiveRow {
                SLDateColumn(
                    weekday: day.weekday,
                    day: day.dayNumber,
                    weekdayInk: highlighted ? SL.Signal.action : SL.Ink.secondary,
                    dayInk: highlighted ? SL.Signal.action : day.isRest ? SL.Ink.secondary : SL.Ink.primary
                )
            } main: {
                rowMain(day)
            } trailing: {
                HStack(spacing: SL.Space.s2) {
                    if day.isLogged {
                        SLDoneMark()
                    } else if day.isRest {
                        SLGlyph(name: .moon, size: 16).foregroundStyle(SL.Signal.recovery)
                    } else if day.isToday {
                        SLTodayBadge(height: 24)
                    }
                    SLGlyph(name: .chevronRight, size: 14).foregroundStyle(SL.Ink.secondary)
                }
            }
            .padding(.horizontal, SL.Space.s4)
            .padding(.vertical, day.isRest ? SL.Space.s2 : SL.Space.s3)
            .frame(minHeight: day.isRest ? 54 : 72)
            .background(highlighted ? SL.Signal.action.opacity(0.06) : Color.clear)
            .contentShape(Rectangle())
        }
        .buttonStyle(SLRowButtonStyle())
        .simultaneousGesture(
            LongPressGesture().onEnded { _ in
                heldRow = true
                planning = PlannedDate(date: day.date)
            }
        )
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(StripDay.spokenLabel(day))
        .accessibilityHint(hint(for: day))
        .accessibilityAction(named: "Change this day") { planning = PlannedDate(date: day.date) }
    }

    @ViewBuilder
    private func rowMain(_ day: AgendaDay) -> some View {
        switch day.content {
        case .session(let session):
            rowText("Done", "\(session.dayLabel) · \(setsLine(session))")
        case .planned(let workout):
            rowText(workout.short, plannedLine(workout))
        case .missed(let workout):
            rowText(workout.short, "Not logged · \(WeekPlan.sets(of: workout)) sets")
        case .rest:
            Text("Rest")
                .slBody()
                .foregroundStyle(SL.Ink.secondary)
        }
    }

    private func rowText(_ title: String, _ sub: String) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(title)
                .slLead()
                .slLineHeight(1.3, size: SL.TypeSize.lead)
                .foregroundStyle(SL.Ink.primary)
            Text(sub.slUnbroken)
                .slBody()
                .slNumerals()
                .slLineHeight(1.35, size: SL.TypeSize.body)
                .foregroundStyle(SL.Ink.secondary)
        }
        .fixedSize(horizontal: false, vertical: true)
        .multilineTextAlignment(.leading)
    }

    /// "Bank & schouders · 22 sets"
    private func plannedLine(_ workout: WorkoutDay) -> String {
        let sets = "\(WeekPlan.sets(of: workout)) sets"
        return workout.focus.isEmpty ? sets : "\(workout.focus) · \(sets)"
    }

    /// "18 van 18 sets", or the share older sessions stored instead.
    private func setsLine(_ session: TrainingSession) -> String {
        if let planned = session.plannedSetCount, let completed = session.completedSetCount, planned > 0 {
            return "\(completed) of \(planned) sets"
        }
        return "\(session.completion)% done"
    }

    private func hint(for day: AgendaDay) -> String {
        switch day.content {
        case .session: return "Double-tap to view the results"
        case .planned, .missed: return "Double-tap to view the exercises. Nothing starts."
        case .rest: return "Double-tap to change this day"
        }
    }

    /// A row opens what its day holds. Nothing here starts or writes.
    private func open(_ day: AgendaDay) {
        switch day.content {
        case .session(let session):
            openedSession = OpenedSession(id: session.id)
        case .planned, .missed:
            onPreview(day)
        case .rest:
            planning = PlannedDate(date: day.date)
        }
    }

    // MARK: - The week before

    private var previousWeekDates: [Date] {
        guard let first = week.first?.date,
              let before = Calendar.current.date(byAdding: .day, value: -7, to: first)
        else { return [] }
        return Schedule.mondayFirstWeek(containing: before)
    }

    /// The workouts of the week before the one shown, newest first.
    private var previousSessions: [TrainingSession] {
        let keys = Set(previousWeekDates.map { Schedule.dateKey($0) })
        return app.sessions
            .filter { $0.kind == .workout && keys.contains(Schedule.dateKey($0.date)) }
            .sorted { $0.date > $1.date }
    }

    private var previousList: some View {
        VStack(spacing: 0) {
            ForEach(Array(previousSessions.enumerated()), id: \.element.id) { index, session in
                Button {
                    openedSession = OpenedSession(id: session.id)
                } label: {
                    SLAdaptiveRow {
                        SLDateColumn(
                            weekday: Schedule.weekdayLabel(session.date),
                            day: Calendar.current.component(.day, from: session.date)
                        )
                    } main: {
                        rowText(session.dayLabel, bestLine(session))
                    } trailing: {
                        HStack(spacing: SL.Space.s2) {
                            SLDoneMark()
                            SLGlyph(name: .chevronRight, size: 14).foregroundStyle(SL.Ink.secondary)
                        }
                    }
                    .padding(.horizontal, SL.Space.s4)
                    .padding(.vertical, SL.Space.s3)
                    .frame(minHeight: 72)
                    .contentShape(Rectangle())
                }
                .buttonStyle(SLRowButtonStyle())
                .overlay(alignment: .top) { if index > 0 { SLHairline() } }
                .accessibilityElement(children: .combine)
                .accessibilityHint("Double-tap to view the results")
            }
        }
        .slBorderBox()
        .slListCard(raised: true)
    }

    /// "Beste set Bankdrukken 92,5 kg × 5"
    private func bestLine(_ session: TrainingSession) -> String {
        guard let best = ProgressOverview.best(in: session) else { return setsLine(session) }
        return "Best set \(best.name) \(app.display.kg(best.weightKg)) × \(best.reps)"
    }
}
