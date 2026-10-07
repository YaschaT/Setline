import Foundation

/// Weeks in a row in which you trained as often as your plan asked.
///
/// A weekly streak rather than Duolingo's daily one, because lifting has
/// rest days: a daily count would break on the days the plan tells you not
/// to train. A week counts once it holds as many logged workouts as the plan
/// has training days that week — on any days, so a session moved to Sunday
/// still counts. The week that is running never breaks the streak: until it
/// is over it can still be met, and once met it joins the count at once.
public struct TrainingStreak: Equatable, Sendable {
    /// Weeks met in a row, the running week included once it is met.
    public let weeks: Int
    /// Workouts logged this week, and how many the plan asks for.
    public let thisWeekDone: Int
    public let thisWeekGoal: Int

    public var thisWeekMet: Bool { thisWeekDone >= thisWeekGoal }

    public init(weeks: Int, thisWeekDone: Int, thisWeekGoal: Int) {
        self.weeks = weeks
        self.thisWeekDone = thisWeekDone
        self.thisWeekGoal = thisWeekGoal
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

        var weeks = current.done >= current.goal ? 1 : 0
        var monday = thisMonday
        while let previous = calendar.date(byAdding: .day, value: -7, to: monday), previous >= firstMonday {
            let past = week(previous)
            guard past.done >= past.goal else { break }
            weeks += 1
            monday = previous
        }
        return TrainingStreak(weeks: weeks, thisWeekDone: current.done, thisWeekGoal: current.goal)
    }
}
