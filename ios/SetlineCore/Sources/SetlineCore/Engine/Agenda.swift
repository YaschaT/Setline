import Foundation

/// What one date holds, for the screens that browse dates: the selectable
/// strip on Training (32a–32f) and the Agenda (34a–34e).
///
/// This is a reading, never a writing. Nothing here creates a session, marks a
/// date or touches the schedule — browsing a week leaves the account exactly
/// as it was. `WeekPlan` stays the one calendar model; this adds what a date
/// means once the saved sessions and the lighter week are taken into account.
public struct AgendaDay: Identifiable, Equatable, Sendable {

    /// A date holds one of four things, and the case decides which source may
    /// be read.
    ///
    /// The split is the point: a day that was logged is described by the saved
    /// session and never by today's programme, because the programme may have
    /// changed since (32c: "Dit is wat je deed, niet wat er nu gepland staat").
    /// A day still to come is described by the programme, because there is
    /// nothing else to describe it with.
    public enum Content: Equatable, Sendable {
        /// A session was saved on this date. The only truth for a past day.
        case session(TrainingSession)
        /// Planned and still ahead — today included, until something is saved.
        case planned(WorkoutDay)
        /// Planned, the day is over, nothing was saved. SETLINE moves nothing.
        case missed(WorkoutDay)
        /// No session planned: a rest day, or a date the plan leaves open.
        case rest
    }

    public let date: Date
    /// `yyyy-MM-dd`, the key both clients agree on.
    public let key: String
    /// "ma"
    public let weekday: String
    public let dayNumber: Int
    public let isToday: Bool
    public let isPast: Bool
    public let content: Content
    /// The weekday this session usually falls on, when it is not there.
    public let movedFrom: String?
    /// Set by hand for this date rather than by the programme (41: "de
    /// gestippelde ring als marker voor een gewijzigde dag").
    public let isOverridden: Bool

    public var id: String { key }

    /// The saved session, and only where one exists.
    public var session: TrainingSession? {
        if case .session(let session) = content { return session }
        return nil
    }

    /// The effective prescription, and only for a date that has none saved.
    public var plannedDay: WorkoutDay? {
        switch content {
        case .planned(let day), .missed(let day): return day
        case .session, .rest: return nil
        }
    }

    public var isRest: Bool { content == .rest }
    public var isLogged: Bool { session != nil }
    public var isMoved: Bool { movedFrom != nil }

    /// The mark a date carries in the week rail (39a) — one shape per state,
    /// so a state never rests on colour alone.
    public enum Mark: Equatable, Sendable {
        /// A filled dot: a session was saved.
        case logged
        /// An open ring: planned, still to come.
        case planned
        /// A dashed ring: a date you set yourself — a session moved here from
        /// its own weekday, or one put here beside it (41).
        case moved
        /// An open ring on a day that passed with nothing saved.
        case missed
        /// A small dot: nothing planned.
        case rest
    }

    public var mark: Mark {
        switch content {
        case .session: return .logged
        case .planned: return isMoved || isOverridden ? .moved : .planned
        case .missed: return .missed
        case .rest: return .rest
        }
    }

    /// The name a row shows: the session's own label for a logged day, the
    /// programme's for a planned one.
    public var title: String? {
        switch content {
        case .session(let session): return session.dayLabel
        case .planned(let day), .missed(let day): return day.short
        case .rest: return nil
        }
    }
}

public enum Agenda {

    /// The seven dates of the week `date` falls in, Monday first, with what
    /// each one holds.
    ///
    /// - Parameters:
    ///   - deload: the lighter week now running, if one is. It is applied per
    ///     date rather than to the week, so a date outside its window keeps
    ///     the full prescription — and the preview of a date always matches
    ///     the session that date would open, because both go through
    ///     `SessionPrescription`.
    public static func week(
        containing date: Date,
        plan: [WorkoutDay],
        overrides: [String: String],
        sessions: [TrainingSession],
        deload: Deload? = nil,
        now: Date = Date(),
        calendar: Calendar = .current
    ) -> [AgendaDay] {
        let logged = byDate(sessions, calendar: calendar)
        return WeekPlan.week(containing: date, overrides: overrides, plan: plan, calendar: calendar)
            .map { day in
                resolve(
                    day, logged: logged, deload: deload,
                    isOverridden: overrides[day.key] != nil,
                    now: now, calendar: calendar
                )
            }
    }

    /// One date, read the same way the week reads it.
    public static func day(
        on date: Date,
        plan: [WorkoutDay],
        overrides: [String: String],
        sessions: [TrainingSession],
        deload: Deload? = nil,
        now: Date = Date(),
        calendar: Calendar = .current
    ) -> AgendaDay? {
        let key = Schedule.dateKey(date, calendar: calendar)
        return week(
            containing: date, plan: plan, overrides: overrides, sessions: sessions,
            deload: deload, now: now, calendar: calendar
        ).first { $0.key == key }
    }

    /// Workouts by the date they were saved on. A date holding more than one
    /// keeps the newest, which is the one a re-log produced.
    static func byDate(_ sessions: [TrainingSession], calendar: Calendar) -> [String: TrainingSession] {
        sessions
            .filter { $0.kind == .workout }
            .sorted { $0.date < $1.date }
            .reduce(into: [:]) { result, session in
                result[Schedule.dateKey(session.date, calendar: calendar)] = session
            }
    }

    private static func resolve(
        _ day: WeekPlan.Day,
        logged: [String: TrainingSession],
        deload: Deload?,
        isOverridden: Bool,
        now: Date,
        calendar: Calendar
    ) -> AgendaDay {
        let isToday = calendar.isDate(day.date, inSameDayAs: now)
        let isPast = calendar.startOfDay(for: day.date) < calendar.startOfDay(for: now)

        let content: AgendaDay.Content
        if let session = logged[day.key] {
            content = .session(session)
        } else if let workout = day.workout {
            // The lighter week reaches only the dates it covers, and reaches
            // them through the rule the session runner uses.
            let applies = deload.flatMap { $0.covers(day.date, calendar: calendar) ? $0 : nil }
            let effective = SessionPrescription.day(workout, deload: applies)
            content = isPast ? .missed(effective) : .planned(effective)
        } else {
            content = .rest
        }

        return AgendaDay(
            date: day.date,
            key: day.key,
            weekday: day.weekday,
            dayNumber: calendar.component(.day, from: day.date),
            isToday: isToday,
            isPast: isPast,
            content: content,
            movedFrom: day.movedFrom,
            isOverridden: isOverridden
        )
    }

    // MARK: - Several weeks at once (41d)

    /// One week in the pulled-out drawer: its dates and what it is called.
    public struct Week: Identifiable, Equatable, Sendable {
        public let days: [AgendaDay]
        public let number: Int
        public let isCurrent: Bool

        public var id: String { days.first?.key ?? "\(number)" }

        /// "Week 6 · deze week", or the week with the Monday it starts on.
        public var label: String {
            guard let first = days.first else { return "Week \(number)" }
            return isCurrent ? "Week \(number) · deze week" : "Week \(number) · \(shortDate(first.date))"
        }
    }

    /// The weeks the drawer shows when it is pulled open: the week `date`
    /// falls in, the one before it and the two after — read exactly as the
    /// rail reads its own week.
    public static func weeks(
        around date: Date,
        back: Int = 1,
        forward: Int = 2,
        plan: [WorkoutDay],
        overrides: [String: String],
        sessions: [TrainingSession],
        deload: Deload? = nil,
        firstSession: Date? = nil,
        now: Date = Date(),
        calendar: Calendar = .current
    ) -> [Week] {
        (-back...forward).compactMap { offset in
            guard let anchor = calendar.date(byAdding: .weekOfYear, value: offset, to: date) else { return nil }
            let days = week(
                containing: anchor, plan: plan, overrides: overrides, sessions: sessions,
                deload: deload, now: now, calendar: calendar
            )
            guard let first = days.first else { return nil }
            return Week(
                days: days,
                number: WeekPlan.number(firstSession: firstSession, on: first.date, calendar: calendar),
                isCurrent: days.contains(where: \.isToday)
            )
        }
    }

    // MARK: - What comes next

    /// The first session still to come after `date`: the next date holding a
    /// planned session with nothing saved on it. Rest days, logged days and
    /// days that passed unlogged are stepped over — from a rest day, this is
    /// the answer to 39a's second question.
    ///
    /// It reads through `week(containing:)`, so it sees exactly what the rail
    /// and the Agenda see: the schedule's overrides, the saved sessions, and
    /// the lighter week on the dates it covers. The search runs through the
    /// week `date` falls in and the `weeks` after it; past that, nothing is
    /// planned. Nothing is written.
    public static func nextTraining(
        after date: Date,
        plan: [WorkoutDay],
        overrides: [String: String],
        sessions: [TrainingSession],
        deload: Deload? = nil,
        now: Date = Date(),
        calendar: Calendar = .current,
        withinWeeks weeks: Int = 4
    ) -> AgendaDay? {
        let from = calendar.startOfDay(for: date)
        for offset in 0...max(0, weeks) {
            guard let anchor = calendar.date(byAdding: .weekOfYear, value: offset, to: date) else { break }
            let days = week(
                containing: anchor, plan: plan, overrides: overrides, sessions: sessions,
                deload: deload, now: now, calendar: calendar
            )
            if let next = days.first(where: { day in
                guard calendar.startOfDay(for: day.date) > from else { return false }
                if case .planned = day.content { return true }
                return false
            }) {
                return next
            }
        }
        return nil
    }

    /// When a date falls, said from `now` the way 39a says it: "morgen",
    /// "overmorgen", a weekday later this week, and the weekday with its date
    /// once it lies beyond this week — where the rail no longer shows it.
    public static func when(_ date: Date, from now: Date = Date(), calendar: Calendar = .current) -> String {
        let days = calendar.dateComponents(
            [.day],
            from: calendar.startOfDay(for: now),
            to: calendar.startOfDay(for: date)
        ).day ?? 0
        switch days {
        case 0: return "vandaag"
        case 1: return "morgen"
        case 2: return "overmorgen"
        case -1: return "gisteren"
        case -2: return "eergisteren"
        default:
            let thisWeek = Schedule.mondayFirstWeek(containing: now, calendar: calendar)
            if thisWeek.contains(where: { calendar.isDate($0, inSameDayAs: date) }) {
                return WeekPlan.fullWeekday(date)
            }
            return "\(WeekPlan.fullWeekday(date)) \(shortDate(date))"
        }
    }

    /// 39a's supporting line: "Volgende training morgen", or that nothing is
    /// planned at all.
    public static func restLine(next: AgendaDay?, now: Date = Date(), calendar: Calendar = .current) -> String {
        guard let next else { return "Geen training gepland" }
        return "Volgende training \(when(next.date, from: now, calendar: calendar))"
    }

    /// 39a's next-session row, right side: "vr 11 sep · ±55 min". The minutes
    /// come from the effective prescription, so a lighter week says less.
    public static func sessionLine(_ day: AgendaDay) -> String? {
        guard let workout = day.plannedDay else { return nil }
        return "\(day.weekday) \(shortDate(day.date)) · ±\(WeekPlan.minutes(of: workout)) min"
    }

    // MARK: - What a week says about itself

    /// "4 sessies gelogd", "geen sessies gelogd", or where today is
    /// (34a: "vandaag maandag 7 sep").
    public static func summary(of week: [AgendaDay], now: Date = Date(), calendar: Calendar = .current) -> String {
        if let today = week.first(where: \.isToday) {
            return "vandaag \(WeekPlan.fullWeekday(today.date).lowercased()) \(shortDate(today.date))"
        }
        let count = week.filter(\.isLogged).count
        switch count {
        case 0: return "geen sessies gelogd"
        case 1: return "1 sessie gelogd"
        default: return "\(count) sessies gelogd"
        }
    }

    /// "7 sep"
    static func shortDate(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "nl_BE")
        formatter.dateFormat = "d MMM"
        return formatter.string(from: date).replacingOccurrences(of: ".", with: "")
    }
}
