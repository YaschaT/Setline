import XCTest
@testable import SetlineCore

final class NutritionHistoryTests: XCTestCase {
    private var calendar: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Europe/Brussels")!
        return calendar
    }()
    private let targets = NutritionTargets(calories: 2700, protein: 160, carbs: 330, fat: 80)
    private var today: Date { calendar.date(from: DateComponents(year: 2026, month: 10, day: 11, hour: 9))! }

    private func entry(_ back: Int, kcal: Double, protein: Double, carbs: Double) -> NutritionEntry {
        let date = calendar.date(byAdding: .day, value: -back, to: today)!
        return NutritionEntry(id: "e\(back)-\(kcal)", date: Schedule.dateKey(date, calendar: calendar), meal: "lunch",
                              name: "Food", calories: kcal, protein: protein, carbs: carbs, fat: 60)
    }

    func testTodayIsLeftOutAndDaysRunNewestFirst() {
        let history = NutritionHistory.make(entries: [entry(0, kcal: 900, protein: 50, carbs: 100), entry(1, kcal: 2700, protein: 160, carbs: 330)],
                                            targets: targets, days: 7, before: today, calendar: calendar)
        XCTAssertEqual(history.days.count, 7)
        XCTAssertEqual(history.logged.count, 1)
        XCTAssertTrue(history.days[0].isLogged)
        XCTAssertTrue(history.days[0].onTarget)
    }

    func testFlagsLowProteinLowCarbsAndUnderCalories() {
        let history = NutritionHistory.make(entries: [entry(2, kcal: 2000, protein: 120, carbs: 200)],
                                            targets: targets, days: 7, before: today, calendar: calendar)
        let day = history.logged[0]
        XCTAssertEqual(day.flags, [.underCalories, .lowProtein, .lowCarbs])
        XCTAssertFalse(day.onTarget)
    }

    func testAveragesCountOnlyLoggedDays() {
        let history = NutritionHistory.make(
            entries: [entry(1, kcal: 2500, protein: 160, carbs: 300), entry(3, kcal: 2200, protein: 140, carbs: 300)],
            targets: targets, days: 7, before: today, calendar: calendar)
        XCTAssertEqual(history.averageCalories ?? 0, 2350, accuracy: 0.1)
        XCTAssertEqual(history.averageGap, -350)
        XCTAssertEqual(history.daysOnCalories, 1)
        XCTAssertEqual(history.daysProteinHit, 1)
    }
}
