import XCTest
@testable import SetlineCore

final class NutritionDayTests: XCTestCase {

    private let targets = NutritionTargets(calories: 2250, protein: 165, carbs: 240, fat: 70)

    private func entry(
        _ id: String,
        date: String = "2026-09-17",
        calories: Double,
        protein: Double = 0,
        carbs: Double = 0,
        fat: Double = 0
    ) -> NutritionEntry {
        NutritionEntry(
            id: id, date: date, meal: "Lunch", name: id,
            calories: calories, protein: protein, carbs: carbs, fat: fat
        )
    }

    private func day(_ entries: [NutritionEntry], targets: NutritionTargets? = nil) -> NutritionDay {
        NutritionDay(dateKey: "2026-09-17", entries: entries, targets: targets ?? self.targets)
    }

    func testTheDayAddsUpWhatWasLogged() {
        let day = day([
            entry("a", calories: 520, protein: 40, carbs: 60, fat: 12),
            entry("b", calories: 740, protein: 58, carbs: 96, fat: 14),
        ])
        XCTAssertEqual(day.calories, 1260)
        XCTAssertEqual(day.protein, 98)
        XCTAssertEqual(day.remaining, 990)
    }

    func testOnlyThatDaysFoodCounts() {
        let day = NutritionDay.make(
            entries: [entry("today", calories: 500), entry("yesterday", date: "2026-09-16", calories: 900)],
            on: LegacyAdapter.isoDate("2026-09-17T12:00:00.000Z")!,
            targets: targets,
            calendar: {
                var calendar = Calendar(identifier: .gregorian)
                calendar.timeZone = TimeZone(secondsFromGMT: 0)!
                return calendar
            }()
        )
        XCTAssertEqual(day.entries.map(\.id), ["today"])
        XCTAssertEqual(day.calories, 500)
    }

    func testPastTheTargetThereIsNothingLeftToEat() {
        let day = day([entry("a", calories: 2400)])
        XCTAssertEqual(day.remaining, 0)
        XCTAssertEqual(day.consumed, 1, "the ring stops at full")
    }

    func testAnAccountWithoutTargetsHasNoRingToDraw() {
        let day = day([entry("a", calories: 500)], targets: NutritionTargets(calories: 0, protein: 0, carbs: 0, fat: 0))
        XCTAssertFalse(day.hasTarget)
        XCTAssertEqual(day.consumed, 0)
        XCTAssertEqual(day.fraction(of: .protein), 0)
    }

    func testEachMacroIsMeasuredAgainstItsOwnTarget() {
        let day = day([entry("a", calories: 1000, protein: 82.5, carbs: 120, fat: 35)])
        XCTAssertEqual(day.fraction(of: .protein), 0.5, accuracy: 0.0001)
        XCTAssertEqual(day.fraction(of: .carbs), 0.5, accuracy: 0.0001)
        XCTAssertEqual(day.target(for: .fat), 70)
    }

    func testMacrosStandInForCaloriesTheSameWayTheWebAppDoes() {
        XCTAssertEqual(NutritionEntry.calories(protein: 40, carbs: 60, fat: 12), 508)
        XCTAssertEqual(NutritionEntry.calories(protein: 0, carbs: 0, fat: 0), 0)
    }

    func testAnEntryIsWrittenInTheShapeTheWebAppReads() throws {
        let fields = try XCTUnwrap(entry("m1", calories: 520, protein: 40).json.objectValue)
        XCTAssertEqual(Set(fields.keys), ["id", "date", "meal", "name", "calories", "protein", "carbs", "fat"])
        XCTAssertEqual(fields["calories"], .number(520))
        XCTAssertEqual(fields["meal"], .string("Lunch"))
    }

    func testStoredFoodIsReadBackWholeAndAnythingUnnamedIsSkipped() {
        let state = LegacyState(raw: ["nutritionEntries": .array([
            .object([
                "id": .string("m1"), "date": .string("2026-09-17"), "meal": .string("Ontbijt"),
                "name": .string("Havermout"), "calories": .number(520), "protein": .number(40),
                "carbs": .number(60), "fat": .number(12),
            ]),
            .object(["name": .string("geen id")]),
        ])])
        let entries = LegacyAdapter.nutritionEntries(from: state)
        XCTAssertEqual(entries.count, 1)
        XCTAssertEqual(entries.first?.name, "Havermout")
        XCTAssertEqual(entries.first?.protein, 40)
    }

    func testTheMealPickerOpensOnWhatIsLikelyBeingEaten() {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        func meal(_ hour: Int) -> Meal {
            Meal.likely(at: LegacyAdapter.isoDate(String(format: "2026-09-17T%02d:00:00.000Z", hour))!, calendar: calendar)
        }
        XCTAssertEqual(meal(8), .ontbijt)
        XCTAssertEqual(meal(13), .lunch)
        XCTAssertEqual(meal(19), .avondeten)
        XCTAssertEqual(meal(23), .snack)
    }
}

final class NumberInputTests: XCTestCase {

    func testOnlyDigitsAndOneSeparatorSurvive() {
        XCTAssertEqual(NumberInput.numericOnly("&'("), "")
        XCTAssertEqual(NumberInput.numericOnly("145"), "145")
        XCTAssertEqual(NumberInput.numericOnly("2.5"), "2,5")
        XCTAssertEqual(NumberInput.numericOnly("2,5,5"), "2,55")
        XCTAssertEqual(NumberInput.numericOnly("12 kcal"), "12")
    }

    func testWhatTheFieldIsWorth() {
        XCTAssertEqual(NumberInput.value("2,5"), 2.5)
        XCTAssertEqual(NumberInput.value(""), 0)
        XCTAssertEqual(NumberInput.value("abc"), 0)
    }
}
