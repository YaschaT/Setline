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
                resolve(day, logged: logged, deload: deload, now: now, calendar: calendar)
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
            movedFrom: day.movedFrom
        )
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
