import Foundation

/// Artboards 41e–41g · what one date can be set to.
///
/// "Wijzig deze dag" changes which session belongs to a date — never the
/// exercises inside that session, and never another date. A date holds one
/// assignment: choosing again replaces the one before it, and choosing the
/// programme's own standard removes the change altogether.
///
/// A date that already holds a saved session is not assignable at all: the
/// date belongs to what was done on it (41g).
public struct DayPlan: Equatable, Sendable {

    /// One row of the sheet.
    public struct Option: Identifiable, Equatable, Sendable {
        public enum Kind: Equatable, Sendable {
            /// A session from the active programme.
            case session(id: String)
            /// No session on this date.
            case rest
            /// Whatever the programme itself says — the change is removed.
            case standard
        }

        public let kind: Kind
        public let title: String
        /// "ook ma 7" — the other dates this week already holding it —
        /// "huidig", or what the programme's standard is for this date.
        public let hint: String?
        /// What the date reads as right now.
        public let isCurrent: Bool

        public var id: String {
            switch kind {
            case .session(let id): return "session-\(id)"
            case .rest: return "rest"
            case .standard: return "standard"
            }
        }

        public init(kind: Kind, title: String, hint: String?, isCurrent: Bool) {
            self.kind = kind
            self.title = title
            self.hint = hint
            self.isCurrent = isCurrent
        }
    }

    public let date: Date
    /// `yyyy-MM-dd`, the half of the override key that names the date.
    public let dateKey: String
    /// "Donderdag 10 sep"
    public let title: String
    /// "Nu: rustdag · volgens je plan", "Nu: Pull A · door jou gezet", or what
    /// a logged day holds: "Pull A · gelogd · 54 min".
    public let state: String
    /// A date whose session was logged. Nothing here may be assigned (41g).
    public let isLocked: Bool
    /// Set by hand rather than by the programme, which the rail draws dashed.
    public let isOverridden: Bool
    public let session: TrainingSession?
    public let options: [Option]

    /// What the programme itself says about this date, named: a session or
    /// "rustdag". The sheet offers it as the way back to standard.
    public let standardTitle: String
    /// The programme's own day id for this date, or `rest`.
    public let standardID: String

    // MARK: - Reading a date

    public static func make(
        for date: Date,
        plan: [WorkoutDay],
        overrides: [String: String],
        sessions: [TrainingSession],
        deload: Deload? = nil,
        now: Date = Date(),
        calendar: Calendar = .current
    ) -> DayPlan {
        let key = Schedule.dateKey(date, calendar: calendar)
        let week = Agenda.week(
            containing: date, plan: plan, overrides: overrides, sessions: sessions,
            deload: deload, now: now, calendar: calendar
        )
        let day = week.first { $0.key == key }
        let isOverridden = overrides[key] != nil

        // The programme's own reading of this date, with every change taken
        // off: the way back to standard has to name what it returns to.
        let standardID = Schedule.canonicalDay(for: date, overrides: [:], calendar: calendar)
        let standard = Schedule.day(for: standardID, in: plan)
        let standardTitle = standard?.short ?? "rest day"
        let standardDayID = standard?.id ?? "rest"

        let title = "\(WeekPlan.fullWeekday(date).capitalized) \(Agenda.shortDate(date))"

        if let session = day?.session {
            var state = "\(session.dayLabel) · logged"
            if let seconds = session.durationSeconds, seconds > 0 {
                state += " · \(max(1, seconds / 60)) min"
            }
            return DayPlan(
                date: date, dateKey: key, title: title, state: state,
                isLocked: true, isOverridden: isOverridden, session: session,
                options: [], standardTitle: standardTitle, standardID: standardDayID
            )
        }

        let currentID = Schedule.canonicalDay(for: date, overrides: overrides, calendar: calendar)
        let current = Schedule.day(for: currentID, in: plan)
        let state: String
        if isOverridden {
            state = "Now: \(current?.short ?? "rest") · set by you"
        } else {
            state = "Now: \(current.map { "\($0.short)" } ?? "rest day") · from your plan"
        }

        var options: [Option] = plan.map { workout in
            Option(
                kind: .session(id: workout.id),
                title: workout.short,
                hint: hint(for: workout, on: key, in: week, isCurrent: workout.id == current?.id),
                isCurrent: workout.id == current?.id
            )
        }
        options.append(Option(
            kind: .rest,
            title: "Rest",
            hint: current == nil && !isOverridden ? nil : (current == nil ? "current" : nil),
            isCurrent: current == nil
        ))
        // Offered only where there is a change to undo: without one, the date
        // already is the standard.
        if isOverridden {
            options.insert(
                Option(kind: .standard, title: "Back to standard", hint: standardTitle, isCurrent: false),
                at: 0
            )
        } else {
            options.append(Option(
                kind: .standard,
                title: "Your plan's standard",
                hint: standardTitle,
                isCurrent: true
            ))
        }

        return DayPlan(
            date: date, dateKey: key, title: title, state: state,
            isLocked: false, isOverridden: isOverridden, session: nil,
            options: options, standardTitle: standardTitle, standardID: standardDayID
        )
    }

    /// "ook ma 7" — where else this week the same session already falls, so
    /// putting it here twice is a choice rather than an accident. The session
    /// the date already holds says "huidig" instead.
    private static func hint(
        for workout: WorkoutDay,
        on key: String,
        in week: [AgendaDay],
        isCurrent: Bool
    ) -> String? {
        let elsewhere = week
            .filter { $0.key != key && $0.plannedDay?.id == workout.id }
            .map { "\($0.weekday) \($0.dayNumber)" }
        let also = elsewhere.isEmpty ? nil : "also \(elsewhere.joined(separator: " · "))"
        if isCurrent { return also.map { "current · \($0)" } ?? "current" }
        return also
    }

    // MARK: - What the sheet says about a choice

    /// The line under the options: what changing this date does, and what it
    /// deliberately leaves alone.
    public func note(for option: Option, calendar: Calendar = .current) -> String {
        switch option.kind {
        case .standard:
            return "A change replaces the previous one; nothing stacks. The dotted ring on the strip disappears once the day is back to standard."
        case .rest:
            return "This only changes this date. Your plan itself stays as it is."
        case .session:
            let doubled = option.hint?.contains("also ") == true
            let stays = option.hint?
                .replacingOccurrences(of: "current · ", with: "")
                .replacingOccurrences(of: "also ", with: "") ?? ""
            if doubled {
                return "\(option.title) will then be in this week twice; \(stays) stays. This only changes this date, not the exercises in \(option.title)."
            }
            return "This only changes this date, not the exercises in \(option.title)."
        }
    }

    /// The button: what it will do, named, so nothing is confirmed blind.
    public func confirmTitle(for option: Option, calendar: Calendar = .current) -> String {
        let when = "\(Schedule.weekdayLabel(date)) \(calendar.component(.day, from: date))"
        switch option.kind {
        case .standard: return "Reset to \(standardTitle)"
        case .rest: return "Make \(when) a rest day"
        case .session: return "Put \(option.title) on \(when)"
        }
    }

    /// The one change this sheet writes: one date, by its own key. A date
    /// going back to standard drops its override; anything else names what it
    /// now holds. Nothing else in the schedule is touched.
    public func change(for option: Option, programKey: String, now: Date = Date()) -> StateChange? {
        guard !isLocked, !option.isCurrent else { return nil }
        let key = "\(programKey):\(dateKey)"
        switch option.kind {
        case .standard:
            guard isOverridden else { return nil }
            return StateChange(.removeScheduleOverride(key: key), createdAt: now)
        case .rest:
            // Choosing what the programme itself says takes the change off
            // rather than writing the same thing over it.
            if isOverridden, standardID == "rest" {
                return StateChange(.removeScheduleOverride(key: key), createdAt: now)
            }
            return StateChange(.setScheduleDay(key: key, dayID: "rest"), createdAt: now)
        case .session(let id):
            if isOverridden, id == standardID {
                return StateChange(.removeScheduleOverride(key: key), createdAt: now)
            }
            return StateChange(.setScheduleDay(key: key, dayID: id), createdAt: now)
        }
    }
}
