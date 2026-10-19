import Foundation

/// Weeks in a row in which you trained as often as your plan asked.
///
/// A weekly streak rather than Duolingo's daily one, because lifting has
/// rest days: a daily count would break on the days the plan tells you not
/// to train. A week counts once it holds as many logged workouts as the plan
/// has training days that week — on any days, so a session moved to Sunday
/// still counts. The week that is running never breaks the streak: until it
/// is over it can still be met, and once met it joins the count at once.
///
/// A streak freeze: one missed week in any four is forgiven — the streak
/// neither grows nor breaks — so one sick week doesn't undo months of
/// training. Two misses within four weeks still break it.
public struct TrainingStreak: Equatable, Sendable {
    /// Weeks met in a row, the running week included once it is met.
    public let weeks: Int
    /// Workouts logged this week, and how many the plan asks for.
    public let thisWeekDone: Int
    public let thisWeekGoal: Int
    /// The longest streak this account has had, the current one included.
    public var best: Int = 0
    /// Whether a missed week would be forgiven right now.
    public var freezeAvailable: Bool = true
    /// Last week was missed and the freeze covered it.
    public var freezeUsedLastWeek: Bool = false

    public var thisWeekMet: Bool { thisWeekDone >= thisWeekGoal }

    public init(weeks: Int, thisWeekDone: Int, thisWeekGoal: Int,
                best: Int = 0, freezeAvailable: Bool = true, freezeUsedLastWeek: Bool = false) {
        self.weeks = weeks
        self.thisWeekDone = thisWeekDone
        self.thisWeekGoal = thisWeekGoal
        self.best = max(best, weeks)
        self.freezeAvailable = freezeAvailable
        self.freezeUsedLastWeek = freezeUsedLastWeek
    }

    /// Weeks a freeze needs between uses.
    public static let freezeEvery = 4

    /// How the running week stands against the streak, given how many days
    /// are still open for a workout (today counts while nothing is logged).
    public enum Risk: Equatable, Sendable {
        /// Met, no streak to lose, or room to spare.
        case none
        /// Every day left needs a workout.
        case tight
        /// The week can no longer be met; the freeze will forgive it.
        case freezeCovers
        /// The week can no longer be met, and the streak ends with it.
        case breaks
    }

    public func risk(daysLeft: Int) -> Risk {
        guard weeks > 0, !thisWeekMet else { return .none }
        let left = thisWeekGoal - thisWeekDone
        if left > daysLeft { return freezeAvailable ? .freezeCovers : .breaks }
        return left == daysLeft ? .tight : .none
    }

    /// The streak over a run of finished weeks, oldest first: where it stands
    /// after the last one, the best it reached, and how the freeze stands.
    static func run(_ met: [Bool]) -> (streak: Int, best: Int, sinceFreeze: Int, lastFrozen: Bool) {
        var streak = 0, best = 0, sinceFreeze = freezeEvery, lastFrozen = false
        for week in met {
            lastFrozen = false
            if week {
                streak += 1
                sinceFreeze += 1
            } else if streak > 0, sinceFreeze >= freezeEvery {
                sinceFreeze = 0
                lastFrozen = true
            } else {
                streak = 0
                sinceFreeze = freezeEvery
            }
            best = max(best, streak)
        }
        return (streak, best, sinceFreeze, lastFrozen)
    }

    public static func make(
        sessions: [TrainingSession],
        plan: [WorkoutDay],
        overrides: [String: String],
        now: Date = Date(),
        calendar: Calendar = .current
    ) -> TrainingStreak {
        let workouts = sessions.filter { $0.kind == .workout }
        // Days trained, by the Monday of their week: two sessions on one day
        // are one training day.
        var trainedDays: [String: Set<String>] = [:]
        for session in workouts {
            guard let monday = Schedule.mondayFirstWeek(containing: session.date, calendar: calendar).first else { continue }
            trainedDays[Schedule.dateKey(monday, calendar: calendar), default: []]
                .insert(Schedule.dateKey(session.date, calendar: calendar))
        }

        func week(_ monday: Date) -> (done: Int, goal: Int) {
            let goal = WeekPlan.week(containing: monday, overrides: overrides, plan: plan, calendar: calendar)
                .filter(\.isTraining).count
            let done = trainedDays[Schedule.dateKey(monday, calendar: calendar)]?.count ?? 0
            return (done, max(goal, 1))
        }

        guard let thisMonday = Schedule.mondayFirstWeek(containing: now, calendar: calendar).first else {
            return TrainingStreak(weeks: 0, thisWeekDone: 0, thisWeekGoal: 1)
        }
        let current = week(thisMonday)
        guard let first = workouts.map(\.date).min(),
              let firstMonday = Schedule.mondayFirstWeek(containing: first, calendar: calendar).first
        else {
            return TrainingStreak(weeks: 0, thisWeekDone: current.done, thisWeekGoal: current.goal)
        }

        // Every finished week since the first workout, oldest first.
        var met: [Bool] = []
        var monday = firstMonday
        while monday < thisMonday {
            let past = week(monday)
            met.append(past.done >= past.goal)
            guard let next = calendar.date(byAdding: .day, value: 7, to: monday) else { break }
            monday = next
        }
        let history = run(met)
        let weeks = history.streak + (current.done >= current.goal ? 1 : 0)
        return TrainingStreak(
            weeks: weeks, thisWeekDone: current.done, thisWeekGoal: current.goal,
            best: max(history.best, weeks),
            freezeAvailable: history.sinceFreeze >= freezeEvery,
            freezeUsedLastWeek: history.lastFrozen
        )
    }
}
