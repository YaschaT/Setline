import XCTest
@testable import SetlineCore

final class HabitBadgeTests: XCTestCase {
    private var calendar: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "Europe/Brussels")!
        return c
    }()
    private func day(_ n: Int) -> Date { calendar.date(from: DateComponents(year: 2026, month: 9, day: 1 + n))! }
    private func entry(_ n: Int, meal: Meal, protein: Double) -> NutritionEntry {
        NutritionEntry(id: "\(n)-\(meal.rawValue)", date: Schedule.dateKey(day(n), calendar: calendar), meal: meal.rawValue,
                       name: "x", calories: 500, protein: protein, carbs: 50, fat: 10)
    }

    func testLoggingProteinAndFullDays() {
        var entries: [NutritionEntry] = []
        for n in 0..<10 {
            entries += [entry(n, meal: .ontbijt, protein: 60), entry(n, meal: .lunch, protein: 60), entry(n, meal: .avondeten, protein: 60)]
        }
        let badges = Milestones.habits(entries: entries, proteinTarget: 160, weighInDates: [], photoDates: [],
                                       bestWeeksOnTrack: 0, calendar: calendar)
        XCTAssertTrue(badges.first { $0.id == "logging-7" }!.isReached)
        XCTAssertFalse(badges.first { $0.id == "logging-30" }!.isReached)
        XCTAssertTrue(badges.first { $0.id == "protein-5" }!.isReached)
        XCTAssertFalse(badges.first { $0.id == "protein-14" }!.isReached)
        XCTAssertTrue(badges.first { $0.id == "fullday-10" }!.isReached)
        XCTAssertEqual(badges.first { $0.id == "logging-7" }!.kind.family, .food)
    }

    func testProteinStreakBreaksOnAGap() {
        let entries = [0, 1, 2, 4, 5].map { entry($0, meal: .lunch, protein: 170) }
        let badges = Milestones.habits(entries: entries, proteinTarget: 160, weighInDates: [], photoDates: [],
                                       bestWeeksOnTrack: 0, calendar: calendar)
        XCTAssertEqual(badges.first { $0.id == "protein-5" }!.current, 3)
    }

    func testGoalBandGrowsAtTheGoalsPace() {
        let band = GoalBand(goal: .leanBulk, start: day(0), startKg: 80)
        let later = band.range(on: day(28))
        XCTAssertEqual(later.lowerBound, 80.32, accuracy: 0.01)
        XCTAssertEqual(later.upperBound, 80.8, accuracy: 0.01)
    }
}
