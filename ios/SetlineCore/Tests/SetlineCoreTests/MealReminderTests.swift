import XCTest
@testable import SetlineCore

final class MealReminderTests: XCTestCase {
    private var calendar: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Europe/Brussels")!
        return calendar
    }()
    private func at(_ hour: Int, _ minute: Int = 0, day: Int = 11) -> Date {
        calendar.date(from: DateComponents(year: 2026, month: 10, day: day, hour: hour, minute: minute))!
    }

    func testUpcomingCoversTheNextDaysToo() {
        let reminders = MealWindow.upcoming(entries: [], now: at(13), days: 3, calendar: calendar)
        // Today: lunch and dinner still ahead; then 3 × 3 for the coming days.
        XCTAssertEqual(reminders.count, 2 + 9)
        XCTAssertEqual(reminders.first?.window.meal, .lunch)
        XCTAssertEqual(calendar.component(.day, from: reminders.last!.fire), 14)
    }

    func testMissingMealAfterItsReminderTime() {
        XCTAssertNil(MealWindow.missing(entries: [], now: at(10, 0), calendar: calendar))
        XCTAssertEqual(MealWindow.missing(entries: [], now: at(10, 45), calendar: calendar)?.meal, .ontbijt)
        XCTAssertNil(MealWindow.missing(entries: [], now: at(11, 30), calendar: calendar))
        XCTAssertEqual(MealWindow.missing(entries: [], now: at(21), calendar: calendar)?.meal, .avondeten)
        let lunch = NutritionEntry(id: "l", date: Schedule.dateKey(at(14), calendar: calendar), meal: Meal.lunch.rawValue,
                                   name: "Wrap", calories: 400, protein: 30, carbs: 40, fat: 10)
        XCTAssertNil(MealWindow.missing(entries: [lunch], now: at(14, 40), calendar: calendar))
    }
}
