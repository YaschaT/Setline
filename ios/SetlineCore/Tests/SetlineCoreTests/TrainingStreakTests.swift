import XCTest
@testable import SetlineCore

/// The weekly streak: weeks in a row with as many workouts as the plan asks.
final class TrainingStreakTests: XCTestCase {

    private let calendar: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Europe/Brussels")!
        calendar.firstWeekday = 2
        return calendar
    }()

    private var plan: [WorkoutDay] { PlanCatalog.personal }

    private func date(_ day: Int, month: Int = 9, hour: Int = 17) -> Date {
        calendar.date(from: DateComponents(year: 2026, month: month, day: day, hour: hour))!
    }

    private func session(_ day: Int, month: Int = 9) -> TrainingSession {
        TrainingSession(id: "s-\(month)-\(day)", date: date(day, month: month), dayID: "push", dayLabel: "Push",
                        completion: 100, results: [])
    }

    /// How many training days the personal plan has in a week.
    private var goal: Int {
        WeekPlan.week(containing: date(7), overrides: [:], plan: plan, calendar: calendar).filter(\.isTraining).count
    }

    private func full(week monday: Int) -> [TrainingSession] {
        (0..<goal).map { session(monday + $0) }
    }

    private func streak(_ sessions: [TrainingSession], now: Date) -> TrainingStreak {
        TrainingStreak.make(sessions: sessions, plan: plan, overrides: [:], now: now, calendar: calendar)
    }

    func testNoWorkoutsIsNoStreak() {
        let result = streak([], now: date(9))
        XCTAssertEqual(result.weeks, 0)
        XCTAssertEqual(result.thisWeekDone, 0)
        XCTAssertEqual(result.thisWeekGoal, goal)
    }

    func testFullWeeksInARowCountAndTheRunningWeekDoesNotBreakIt() {
        // Weeks of 31 aug, 7 sep and 14 sep met; the week of 21 sep has begun.
        let met = (0..<goal).map { day in
            TrainingSession(id: "a\(day)", date: date(31, month: 8).addingTimeInterval(Double(day) * 86_400),
                            dayID: "push", dayLabel: "Push", completion: 100, results: [])
        } + full(week: 7) + full(week: 14)
        let result = streak(met + [session(21)], now: date(22, hour: 12))
        XCTAssertEqual(result.weeks, 3)
        XCTAssertEqual(result.thisWeekDone, 1)
        XCTAssertFalse(result.thisWeekMet)
    }

    func testAMetRunningWeekJoinsTheCount() {
        let result = streak(full(week: 7) + full(week: 14), now: date(20, hour: 12))
        XCTAssertEqual(result.weeks, 2)
        XCTAssertTrue(result.thisWeekMet)
    }

    func testAShortWeekBreaksTheStreak() {
        let short = Array(full(week: 7).prefix(goal - 1))
        let result = streak(short + full(week: 14), now: date(22, hour: 12))
        XCTAssertEqual(result.weeks, 1)
    }

    func testTwoSessionsOnOneDayAreOneTrainingDay() {
        let doubled = [session(14), session(14)]
        let result = streak(doubled, now: date(15, hour: 12))
        XCTAssertEqual(result.thisWeekDone, 1)
    }
}
