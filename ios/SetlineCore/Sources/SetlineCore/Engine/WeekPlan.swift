import Foundation

/// One week of the plan, as the week agenda shows it.
///
/// The plan says which day of the week each session belongs on. An override
/// says otherwise for one date. This reads both and reports, per date, what is
/// planned, whether the account said so itself, and whether the session is
/// sitting somewhere other than its usual day.
public enum WeekPlan {

    /// What a date holds.
    ///
    /// `rest` is a decision — the account marked this date as a rest day.
    /// `open` is the absence of one: nothing is planned and nothing was said,
    /// which is why it can still be marked.
    public enum Kind: Equatable, Sendable {
        case training(WorkoutDay)
        case rest
        case open
    }

    public struct Day: Identifiable, Equatable, Sendable {
        public let date: Date
        public let key: String
        public let weekday: String
        public let assignment: String?
        public let kind: Kind
        /// The weekday this session usually falls on, when it is not there.
        public let movedFrom: String?

        public var id: String { key }

        public var workout: WorkoutDay? {
            if case let .training(day) = kind { return day }
            return nil
        }

        public var isTraining: Bool { workout != nil }
    }

    /// The seven dates of the week `date` falls in, Monday first.
    public static func week(
        containing date: Date,
        overrides: [String: String],
        plan: [WorkoutDay],
        calendar: Calendar = .current
    ) -> [Day] {
        let dates = Schedule.mondayFirstWeek(containing: date, calendar: calendar)
        let keys = dates.map { Schedule.dateKey($0, calendar: calendar) }

        return dates.enumerated().map { index, date in
            let key = keys[index]
            let assignment = overrides[key]
            let canonical = assignment ?? defaultDay(for: date, calendar: calendar)
            let workout = Schedule.day(for: canonical, in: plan)

            let kind: Kind
            if let workout {
                kind = .training(workout)
            } else {
                kind = assignment == nil ? .open : .rest
            }

            return Day(
                date: date,
                key: key,
                weekday: Schedule.weekdayLabel(date),
                assignment: assignment,
                kind: kind,
                movedFrom: workout == nil ? nil : movedFrom(
                    canonical: canonical, on: key, dates: dates, keys: keys,
                    overrides: overrides, calendar: calendar
                )
            )
        }
    }

    static func defaultDay(for date: Date, calendar: Calendar) -> String {
        Schedule.defaultWeek[calendar.component(.weekday, from: date) - 1] ?? "rest"
    }

    /// The usual weekday for this session, named in full — and only when the
    /// session has actually left it. A session still on its own weekday has
    /// not moved, and a second copy of it elsewhere is a second copy, not a
    /// move.
    private static func movedFrom(
        canonical: String,
        on key: String,
        dates: [Date],
        keys: [String],
        overrides: [String: String],
        calendar: Calendar
    ) -> String? {
        guard let home = dates.firstIndex(where: { defaultDay(for: $0, calendar: calendar) == canonical }) else { return nil }
        guard keys[home] != key else { return nil }
        let atHome = overrides[keys[home]] ?? defaultDay(for: dates[home], calendar: calendar)
        guard atHome != canonical else { return nil }
        return fullWeekday(dates[home])
    }

    // MARK: - What a session costs

    public static func sets(of day: WorkoutDay) -> Int {
        day.exercises.reduce(0) { $0 + $1.targetSets }
    }

    /// Planned sets times the rest each one's role prescribes, plus about
    /// 40 s under the bar. Presented as an estimate, never as a promise.
    public static func minutes(of day: WorkoutDay) -> Int {
        let seconds = day.exercises.reduce(0) { total, planned in
            total + planned.targetSets * (RestPrescription.forRole(planned.role).defaultSeconds + 40)
        }
        return max(1, seconds / 60)
    }

    // MARK: - Labels

    /// "14–20 sep", or "28 sep–4 okt" across a month boundary.
    public static func range(_ dates: [Date], calendar: Calendar = .current) -> String {
        guard let first = dates.first, let last = dates.last else { return "" }
        let sameMonth = calendar.isDate(first, equalTo: last, toGranularity: .month)
        return sameMonth
            ? "\(dayNumber(first))–\(dayNumber(last)) \(month(last))"
            : "\(dayNumber(first)) \(month(first))–\(dayNumber(last)) \(month(last))"
    }

    /// Week 1 is the week of the first session logged; before that, week 1.
    ///
    /// Counted from the start of each week, so every date inside a week gives
    /// the same number — the drawer's header and its rows cannot disagree
    /// about which week you are looking at.
    public static func number(firstSession: Date?, on date: Date = Date(), calendar: Calendar = .current) -> Int {
        guard let firstSession else { return 1 }
        let from = Schedule.mondayFirstWeek(containing: firstSession, calendar: calendar).first ?? firstSession
        let to = Schedule.mondayFirstWeek(containing: date, calendar: calendar).first ?? date
        let weeks = calendar.dateComponents([.weekOfYear], from: from, to: to).weekOfYear ?? 0
        return max(1, weeks + 1)
    }

    public static func fullWeekday(_ date: Date) -> String {
        formatted(date, "EEEE")
    }

    private static func dayNumber(_ date: Date) -> String { formatted(date, "d") }

    private static func month(_ date: Date) -> String { formatted(date, "MMM") }

    private static func formatted(_ date: Date, _ format: String) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US")
        formatter.dateFormat = format
        return formatter.string(from: date).replacingOccurrences(of: ".", with: "")
    }
}

/// A week being rearranged, before it is saved.
///
/// Every state this can reach is one the web app reads the same way, which is
/// the whole constraint: a date either names a day of the plan, names `rest`,
/// or says nothing at all and lets the plan decide. There is no fourth value
/// meaning "emptied", so moving a session gives the date it left the day the
/// other date was holding — the same trade the web app performs.
public struct WeekDraft: Equatable, Sendable {

    public let dates: [Date]
    public let keys: [String]
    private let calendar: Calendar
    private let stored: [String: String]
    private var overrides: [String: String]

    public init(dates: [Date], overrides stored: [String: String], calendar: Calendar = .current) {
        self.dates = dates
        self.calendar = calendar
        let keys = dates.map { Schedule.dateKey($0, calendar: calendar) }
        self.keys = keys
        let mine = stored.filter { keys.contains($0.key) }
        self.stored = mine
        self.overrides = mine
    }

    public var assignments: [String: String] { overrides }

    public var isChanged: Bool { overrides != stored }

    /// What the date holds once the plan has had its say.
    public func canonical(on key: String) -> String {
        if let named = overrides[key] { return named }
        guard let index = keys.firstIndex(of: key) else { return "rest" }
        return WeekPlan.defaultDay(for: dates[index], calendar: calendar)
    }

    /// The two dates trade what they hold, so nothing is dropped on the way.
    ///
    /// Each end is then written down only where it differs from the plan. A
    /// date left holding what the plan would have given it anyway keeps no
    /// override at all — which is why a session dragged off a day the plan
    /// rests on leaves that day empty rather than resting by decree, and why
    /// dragging a session back to its own weekday tidies up after itself.
    public mutating func move(from source: String, to target: String) {
        guard source != target, keys.contains(source), keys.contains(target) else { return }
        let moving = canonical(on: source)
        let displaced = canonical(on: target)
        assign(moving, to: target)
        assign(displaced, to: source)
    }

    /// Puts a day on a date, writing it down only where it differs from the
    /// plan's own shape.
    public mutating func assign(_ canonical: String, to key: String) {
        guard let index = keys.firstIndex(of: key) else { return }
        if canonical == WeekPlan.defaultDay(for: dates[index], calendar: calendar) {
            overrides.removeValue(forKey: key)
        } else {
            overrides[key] = canonical
        }
    }

    /// "Markeer als rustdag" — a decision, recorded, even where the plan rests
    /// anyway.
    public mutating func markRest(_ key: String) {
        guard keys.contains(key) else { return }
        overrides[key] = "rest"
    }

    /// Hands the date back to the plan.
    public mutating func clear(_ key: String) {
        overrides.removeValue(forKey: key)
    }

    public func week(plan: [WorkoutDay]) -> [WeekPlan.Day] {
        guard let first = dates.first else { return [] }
        return WeekPlan.week(containing: first, overrides: overrides, plan: plan, calendar: calendar)
    }

    /// One change per date that actually moved, and nothing for the rest of
    /// the account's schedule.
    public func changes(programKey: String, now: Date = Date()) -> [StateChange] {
        keys.compactMap { key in
            let before = stored[key]
            let after = overrides[key]
            guard before != after else { return nil }
            guard let after else {
                return StateChange(.removeScheduleOverride(key: "\(programKey):\(key)"), createdAt: now)
            }
            return StateChange(.setScheduleDay(key: "\(programKey):\(key)", dayID: after), createdAt: now)
        }
    }
}
