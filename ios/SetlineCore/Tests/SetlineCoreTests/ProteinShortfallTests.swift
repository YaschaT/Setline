import XCTest
@testable import SetlineCore

/// "Aandacht": days in a row under the protein target, read from what was
/// logged and from nothing else.
final class ProteinShortfallTests: XCTestCase {

    private let calendar: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Europe/Brussels")!
        return calendar
    }()

    private var today: Date {
        calendar.date(from: DateComponents(year: 2026, month: 9, day: 9, hour: 14))!
    }

    private let targets = NutritionTargets(calories: 2450, protein: 175, carbs: 280, fat: 70)

    private func entry(_ date: String, protein: Double) -> NutritionEntry {
        NutritionEntry(
            id: "\(date)-\(protein)", date: date, meal: "Lunch", name: "Eten",
            calories: 500, protein: protein, carbs: 40, fat: 10
        )
    }

    func testThreeShortDaysAreCountedAndAveraged() {
        let entries = [
            entry("2026-09-08", protein: 150),   // 25 short
            entry("2026-09-07", protein: 140),   // 35 short
            entry("2026-09-06", protein: 100),   // 21 short, with the next
            entry("2026-09-06", protein: 54),
        ]
        let result = ProteinShortfall.make(entries: entries, targets: targets, today: today, calendar: calendar)
        XCTAssertEqual(result, ProteinShortfall(days: 3, averageGrams: 27))
    }

    func testOneShortDayIsNotAPattern() {
        let entries = [entry("2026-09-08", protein: 150), entry("2026-09-07", protein: 180)]
        XCTAssertNil(ProteinShortfall.make(entries: entries, targets: targets, today: today, calendar: calendar))
    }

    func testTodayNeverCounts() {
        // Today is short so far, and that says nothing: the day is not over.
        let entries = [entry("2026-09-09", protein: 40), entry("2026-09-08", protein: 150)]
        XCTAssertNil(ProteinShortfall.make(entries: entries, targets: targets, today: today, calendar: calendar))
    }

    func testADayWithNothingLoggedEndsTheRun() {
        let entries = [
            entry("2026-09-08", protein: 150),
            // 7 Sep: nothing logged.
            entry("2026-09-06", protein: 100),
            entry("2026-09-05", protein: 100),
        ]
        XCTAssertNil(ProteinShortfall.make(entries: entries, targets: targets, today: today, calendar: calendar))
    }

    func testADayOnTargetEndsTheRun() {
        let entries = [
            entry("2026-09-08", protein: 150),
            entry("2026-09-07", protein: 150),
            entry("2026-09-06", protein: 175),
            entry("2026-09-05", protein: 100),
        ]
        let result = ProteinShortfall.make(entries: entries, targets: targets, today: today, calendar: calendar)
        XCTAssertEqual(result?.days, 2)
        XCTAssertEqual(result?.averageGrams, 25)
    }

    func testWithoutATargetNothingIsShort() {
        let entries = [entry("2026-09-08", protein: 10), entry("2026-09-07", protein: 10)]
        XCTAssertNil(ProteinShortfall.make(entries: entries, targets: nil, today: today, calendar: calendar))
        let zero = NutritionTargets(calories: 0, protein: 0, carbs: 0, fat: 0)
        XCTAssertNil(ProteinShortfall.make(entries: entries, targets: zero, today: today, calendar: calendar))
    }
}
