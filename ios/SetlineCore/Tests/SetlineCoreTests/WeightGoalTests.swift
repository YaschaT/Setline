import XCTest
@testable import SetlineCore

final class WeightGoalTests: XCTestCase {
    private let now = Date(timeIntervalSince1970: 1_790_000_000)
    private func day(_ offset: Int) -> Date { now.addingTimeInterval(Double(offset) * 86_400) }

    /// Weigh-ins every other day over the last `days`, gaining `perWeek` kilos a week.
    private func series(from start: Double, perWeek: Double, days: Int = 20) -> [(date: Date, kg: Double)] {
        stride(from: -days, through: 0, by: 2).map { offset in
            (day(offset), start + perWeek * Double(offset + days) / 7)
        }
    }

    func testTooEarlyWithFewWeighIns() {
        let check = GoalCheck.evaluate(goal: .leanBulk, weighIns: [(day(-2), 80), (day(0), 80.1)], now: now)
        XCTAssertEqual(check.verdict, .tooEarly(weighInsNeeded: 2, daysNeeded: 12))
        XCTAssertNil(check.weeklyKg)
    }

    func testLeanBulkOnTrack() {
        // 80 kg: target +0.08 … +0.2 kg a week.
        let check = GoalCheck.evaluate(goal: .leanBulk, weighIns: series(from: 80, perWeek: 0.15), now: now)
        XCTAssertEqual(check.verdict, .onTrack)
        XCTAssertEqual(check.weeklyKg ?? 0, 0.15, accuracy: 0.001)
        XCTAssertNil(check.dailyKcalAdjustment)
    }

    func testLeanBulkStuckIsTooSlowWithAPlusSuggestion() {
        let check = GoalCheck.evaluate(goal: .leanBulk, weighIns: series(from: 80, perWeek: 0), now: now)
        XCTAssertEqual(check.verdict, .tooSlow)
        // Middle of the range ≈ 0.14 kg/week → ≈ 154 kcal/day → 150.
        XCTAssertEqual(check.dailyKcalAdjustment, 150)
    }

    func testCutGainingIsTheWrongWay() {
        let check = GoalCheck.evaluate(goal: .cut, weighIns: series(from: 90, perWeek: 0.2), now: now)
        XCTAssertEqual(check.verdict, .wrongWay)
        XCTAssertLessThan(check.dailyKcalAdjustment ?? 0, 0)
    }

    func testBulkTooFast() {
        let check = GoalCheck.evaluate(goal: .bulk, weighIns: series(from: 70, perWeek: 0.8), now: now)
        XCTAssertEqual(check.verdict, .tooFast)
        XCTAssertLessThan(check.dailyKcalAdjustment ?? 0, 0)
    }

    func testOneHeavyMorningDoesNotFlipTheVerdict() {
        var weighIns = series(from: 80, perWeek: 0.15)
        weighIns[weighIns.count / 2].kg += 1.5
        XCTAssertEqual(GoalCheck.evaluate(goal: .leanBulk, weighIns: weighIns, now: now).verdict, .onTrack)
    }

    /// Four scattered weigh-ins whose line reads +0.6 kg a week on a bulk
    /// (goal +0.2 … +0.4): over the range, but by less than mornings swing.
    func testSparseNoisyWeighInsAreUnclearNotTooFast() {
        let weighIns = [(day(-14), 80.0), (day(-10), 81.0), (day(-5), 80.4), (day(0), 81.6)]
        let check = GoalCheck.evaluate(goal: .bulk, weighIns: weighIns, now: now)
        XCTAssertEqual(check.verdict, .unclear)
        XCTAssertEqual(check.weeklyKg ?? 0, 0.62, accuracy: 0.01)
        XCTAssertNil(check.dailyKcalAdjustment)
        XCTAssertFalse(check.isOffTrack)
    }

    /// The same pace, weighed every other day without the scatter, is
    /// clearly too fast.
    func testSteadyWeighInsAtTheSamePaceAreTooFast() {
        let check = GoalCheck.evaluate(goal: .bulk, weighIns: series(from: 80, perWeek: 0.62), now: now)
        XCTAssertEqual(check.verdict, .tooFast)
    }

    /// A goal set five days ago: the weigh-ins before it and its first week
    /// don't count, so it waits two more days, then two weeks.
    func testWeighInsBeforeTheGoalAndItsFirstWeekDoNotCount() {
        let check = GoalCheck.evaluate(goal: .bulk, weighIns: series(from: 80, perWeek: 1.0), startedAt: day(-5), now: now)
        XCTAssertEqual(check.verdict, .tooEarly(weighInsNeeded: 4, daysNeeded: 16))
    }

    func testMealWindowsRemindOnlyForWhatIsNotLogged() {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Europe/Brussels")!
        let morning = calendar.date(from: DateComponents(year: 2026, month: 10, day: 10, hour: 9))!
        let key = Schedule.dateKey(morning, calendar: calendar)
        let breakfast = NutritionEntry(id: "1", date: key, meal: Meal.ontbijt.rawValue, name: "Oats",
                                       calories: 300, protein: 10, carbs: 50, fat: 5)
        let due = MealWindow.due(entries: [breakfast], now: morning, calendar: calendar)
        XCTAssertEqual(due.map(\.window.label), ["Lunch", "Dinner"])

        let evening = calendar.date(from: DateComponents(year: 2026, month: 10, day: 10, hour: 21))!
        XCTAssertTrue(MealWindow.due(entries: [], now: evening, calendar: calendar).isEmpty)

        let snack = NutritionEntry(id: "2", date: key, meal: Meal.snack.rawValue, name: "Shake",
                                   calories: 200, protein: 30, carbs: 5, fat: 2)
        XCTAssertEqual(MealWindow.due(entries: [breakfast, snack], now: morning, calendar: calendar).map(\.window.label), ["Lunch"])
    }
}
