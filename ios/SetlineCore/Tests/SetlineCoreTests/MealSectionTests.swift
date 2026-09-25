import XCTest
@testable import SetlineCore

/// Artboards 42a–42d: the four headings a day is read in, the amount behind a
/// row, and the two lists the add sheet offers.
final class MealSectionTests: XCTestCase {

    private let calendar: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Europe/Brussels")!
        calendar.firstWeekday = 2
        return calendar
    }()

    private func entry(
        _ name: String,
        date: String = "2026-09-10",
        meal: String = "Lunch",
        calories: Double = 100,
        protein: Double = 0,
        carbs: Double = 0,
        fat: Double = 0,
        amount: Double? = nil,
        unit: String? = nil,
        loggedAt: Date? = nil
    ) -> NutritionEntry {
        NutritionEntry(
            id: "\(name)-\(date)-\(meal)", date: date, meal: meal, name: name,
            calories: calories, protein: protein, carbs: carbs, fat: fat,
            amount: amount, unit: unit, loggedAt: loggedAt
        )
    }

    private func day(_ entries: [NutritionEntry]) -> NutritionDay {
        NutritionDay(dateKey: "2026-09-10", entries: entries, targets: nil)
    }

    // MARK: - 42a · four headings, always four

    func testADayIsReadUnderFourHeadingsInTheOrderTheyAreEaten() {
        XCTAssertEqual(day([]).sections.map(\.title), ["Ontbijt", "Lunch", "Avondeten", "Snacks"])
    }

    func testAnEmptyMealKeepsItsHeadingSoALogAtNoonStillHasAShape() {
        let sections = day([entry("Kaas", meal: "Lunch", calories: 100)]).sections
        XCTAssertEqual(sections.count, 4)
        XCTAssertEqual(sections.filter(\.isEmpty).map(\.title), ["Ontbijt", "Avondeten", "Snacks"])
        XCTAssertEqual(sections.first { $0.title == "Lunch" }?.calories, 100)
    }

    func testSnacksGathersEveryMealThisAppDoesNotDrawItsOwnHeadingFor() {
        let sections = day([
            entry("Whey", meal: "Pre-workout", calories: 120),
            entry("Banaan", meal: "Snack", calories: 190),
            entry("Soep", meal: "Brunch", calories: 60),
        ]).sections
        let snacks = sections.first { $0.title == "Snacks" }
        XCTAssertEqual(snacks?.entries.map(\.name), ["Whey", "Banaan", "Soep"], "no entry is hidden by a heading")
        XCTAssertEqual(snacks?.calories, 370)
    }

    func testAMealsHeadingCountsOnlyItsOwnFood() {
        let sections = day([
            entry("Havermout", meal: "Ontbijt", calories: 375),
            entry("Magere kwark", meal: "Ontbijt", calories: 145),
            entry("Kaas", meal: "Lunch", calories: 100),
        ]).sections
        XCTAssertEqual(sections.first { $0.title == "Ontbijt" }?.calories, 520)
        XCTAssertEqual(sections.first { $0.title == "Lunch" }?.calories, 100)
    }

    func testEntriesKeepTheOrderTheyWereLoggedIn() {
        // 42a's annotation: nothing is re-sorted by hour, and an entry's own
        // time is never manufactured from the meal it sits under.
        let sections = day([
            entry("Kaas", meal: "Lunch", loggedAt: Date(timeIntervalSince1970: 3_000)),
            entry("Boterham", meal: "Lunch", loggedAt: Date(timeIntervalSince1970: 1_000)),
        ]).sections
        XCTAssertEqual(sections.first { $0.title == "Lunch" }?.entries.map(\.name), ["Kaas", "Boterham"])
    }

    // MARK: - 42d · the amount behind a row

    func testAPortionReadsAsTheRowWritesIt() {
        XCTAssertEqual(entry("Havermout", amount: 100, unit: "g").portion, "100 g")
        XCTAssertEqual(entry("Boterham", amount: 2, unit: "sneden").portion, "2 sneden")
        XCTAssertEqual(entry("Yoghurt", amount: 1.5, unit: "potje").portion, "1,5 potje")
        XCTAssertNil(entry("Kaas").portion, "an entry the web app wrote kept no amount")
    }

    func testChangingTheAmountScalesWhatItIsWorth() {
        let kwark = entry(
            "Magere kwark", calories: 145, protein: 24, carbs: 10, fat: 0.5,
            amount: 250, unit: "g"
        )
        let smaller = kwark.scaled(to: 125)
        XCTAssertEqual(smaller.amount, 125)
        XCTAssertEqual(smaller.calories, 73)
        XCTAssertEqual(smaller.protein, 12)
        XCTAssertEqual(smaller.carbs, 5)
        XCTAssertEqual(smaller.fat, 0.3)
        XCTAssertEqual(smaller.id, kwark.id, "the same row, at another amount")
        XCTAssertEqual(smaller.date, kwark.date)
        XCTAssertEqual(smaller.meal, kwark.meal)
    }

    func testAnEntryWithoutAnAmountCannotBeScaledAndIsLeftAlone() {
        let kaas = entry("Kaas", calories: 100, protein: 7)
        XCTAssertEqual(kaas.scaled(to: 60), kaas)
    }

    func testTheStepperStepsInSomethingUsefulAndSaysWhichInItsLabel() {
        XCTAssertEqual(entry("a", amount: 250, unit: "g").step, 25)
        XCTAssertEqual(entry("a", amount: 100, unit: "g").step, 10)
        XCTAssertEqual(entry("a", amount: 30, unit: "g").step, 5)
        XCTAssertEqual(entry("a", amount: 8, unit: "g").step, 1)
        XCTAssertEqual(entry("a", amount: 500, unit: "ml").step, 25)
        XCTAssertEqual(entry("a", amount: 2, unit: "sneden").step, 1, "half a slice is not weighable")
        XCTAssertEqual(entry("a", amount: 300, unit: "stuk").step, 1)
    }

    func testFilingAnEntryUnderAnotherMealKeepsItsOwnClock() {
        let logged = Date(timeIntervalSince1970: 1_757_486_400)
        let late = entry("Boterham", meal: "Ontbijt", amount: 2, unit: "sneden", loggedAt: logged)
        let moved = late.filed(under: .lunch)
        XCTAssertEqual(moved.meal, "Lunch")
        XCTAssertEqual(moved.loggedAt, logged, "the heading says which meal it was; the clock is not rewritten")
        XCTAssertEqual(moved.id, late.id)
        XCTAssertEqual(moved.date, late.date)
        XCTAssertEqual(moved.calories, late.calories)
    }

    func testWhatIsWrittenCarriesTheAmountAndTheHourOnlyWhenThereIsOne() throws {
        let with = entry("Havermout", amount: 100, unit: "g", loggedAt: LegacyAdapter.isoDate("2026-09-10T07:40:00.000Z"))
        guard case .object(let object) = with.json else { return XCTFail("not an object") }
        XCTAssertEqual(object["amount"], .number(100))
        XCTAssertEqual(object["unit"], .string("g"))
        XCTAssertEqual(object["loggedAt"], .string("2026-09-10T07:40:00.000Z"))

        guard case .object(let plain) = entry("Kaas").json else { return XCTFail("not an object") }
        XCTAssertNil(plain["amount"], "no key where there is no amount")
        XCTAssertNil(plain["unit"])
        XCTAssertNil(plain["loggedAt"])
        XCTAssertEqual(plain["name"], .string("Kaas"), "and the entry still reads everywhere")
    }

    func testAnAmountSurvivesBeingWrittenAndReadBack() throws {
        let written = entry(
            "Magere kwark", meal: "Ontbijt", calories: 145, protein: 24, carbs: 10, fat: 0.5,
            amount: 250, unit: "g", loggedAt: LegacyAdapter.isoDate("2026-09-10T07:40:00.000Z")
        )
        let state = LegacyState(raw: ["nutritionEntries": .array([written.json])])
        let read = try XCTUnwrap(LegacyAdapter.nutritionEntries(from: state).first)
        XCTAssertEqual(read, written)
    }

    // MARK: - 42c · what this account has eaten before

    func testWhatIsEatenAtThisMealMostOftenComesFirst() {
        let entries = [
            entry("Kipfilet", date: "2026-09-01", meal: "Avondeten"),
            entry("Rijst, gekookt", date: "2026-09-01", meal: "Avondeten"),
            entry("Kipfilet", date: "2026-09-02", meal: "Avondeten"),
            entry("Broccoli", date: "2026-09-02", meal: "Avondeten"),
            entry("Rijst, gekookt", date: "2026-09-03", meal: "Avondeten"),
            entry("Havermout", date: "2026-09-03", meal: "Ontbijt"),
        ]
        XCTAssertEqual(
            FoodMemory.often(at: .avondeten, in: entries).map(\.name),
            ["Rijst, gekookt", "Kipfilet", "Broccoli"],
            "twice, twice, once — and of the two twices the one eaten last night comes first"
        )
    }

    func testTheMostRecentVersionOfAFoodIsTheOneOffered() throws {
        let entries = [
            entry("Kipfilet", date: "2026-09-01", meal: "Avondeten", calories: 250, amount: 150, unit: "g"),
            entry("Kipfilet", date: "2026-09-02", meal: "Avondeten", calories: 290, amount: 180, unit: "g"),
        ]
        let offered = try XCTUnwrap(FoodMemory.often(at: .avondeten, in: entries).first)
        XCTAssertEqual(offered.amount, 180, "the amount it was last eaten at, not an average")
        XCTAssertEqual(offered.calories, 290)
    }

    func testTodaysOwnFoodIsNotOfferedBackToTheDayItIsAlreadyOn() {
        let entries = [
            entry("Kipfilet", date: "2026-09-09", meal: "Avondeten"),
            entry("Broccoli", date: "2026-09-10", meal: "Avondeten"),
        ]
        XCTAssertEqual(
            FoodMemory.often(at: .avondeten, in: entries, excluding: "2026-09-10").map(\.name),
            ["Kipfilet"]
        )
        XCTAssertEqual(
            FoodMemory.recent(in: entries, excluding: "2026-09-10").map(\.name),
            ["Kipfilet"]
        )
    }

    func testRecentIsTheLastThingsLoggedWhateverMealTheyWereAt() {
        let entries = [
            entry("Havermout", date: "2026-09-01", meal: "Ontbijt"),
            entry("Kaas", date: "2026-09-02", meal: "Lunch"),
            entry("Magere kwark", date: "2026-09-03", meal: "Ontbijt"),
            entry("Whey", date: "2026-09-03", meal: "Snack"),
        ]
        XCTAssertEqual(
            FoodMemory.recent(in: entries, limit: 3).map(\.name),
            ["Whey", "Magere kwark", "Kaas"],
            "newest first"
        )
    }

    func testAFoodAppearsOnceInRecentHoweverOftenItWasLogged() {
        let entries = [
            entry("Whey", date: "2026-09-01", meal: "Snack"),
            entry("Whey", date: "2026-09-02", meal: "Snack"),
            entry("Kaas", date: "2026-09-02", meal: "Lunch"),
        ]
        XCTAssertEqual(FoodMemory.recent(in: entries).map(\.name), ["Kaas", "Whey"])
    }

    func testAnAccountThatHasLoggedNothingIsOfferedNothing() {
        // 42b's rule: no fabricated foods, no suggestions, no estimates.
        XCTAssertTrue(FoodMemory.often(at: .ontbijt, in: []).isEmpty)
        XCTAssertTrue(FoodMemory.recent(in: []).isEmpty)
    }

    func testLoggingSomethingAgainIsANewEntryOnThisDayAtTheSameAmount() {
        let before = entry(
            "Kipfilet", date: "2026-09-02", meal: "Avondeten",
            calories: 290, protein: 62, amount: 180, unit: "g",
            loggedAt: Date(timeIntervalSince1970: 1_000)
        )
        let now = LegacyAdapter.isoDate("2026-09-10T18:30:00.000Z")!
        let again = FoodMemory.repeated(before, on: now, meal: .lunch, id: "food-2", calendar: calendar)

        XCTAssertEqual(again.id, "food-2", "a new row, not the old one rewritten")
        XCTAssertEqual(again.date, "2026-09-10")
        XCTAssertEqual(again.meal, "Lunch", "the meal it is being added to")
        XCTAssertEqual(again.name, before.name)
        XCTAssertEqual(again.amount, 180)
        XCTAssertEqual(again.unit, "g")
        XCTAssertEqual(again.calories, 290)
        XCTAssertEqual(again.protein, 62)
        XCTAssertEqual(again.loggedAt, now, "logged now, because that is when it was logged")
    }

    // MARK: - Reading a day changes nothing

    func testReadingAndPreviewingADayLeavesTheAccountAsItWas() {
        let stored: [JSONValue] = [
            entry("Havermout", meal: "Ontbijt", amount: 100, unit: "g").json,
            entry("Kaas", meal: "Lunch").json,
        ]
        let state = LegacyState(raw: ["nutritionEntries": .array(stored)])
        let before = state.raw

        let entries = LegacyAdapter.nutritionEntries(from: state)
        let today = NutritionDay(dateKey: "2026-09-10", entries: entries, targets: nil)
        for section in today.sections {
            for entry in section.entries {
                _ = entry.portion
                _ = entry.step
                _ = entry.scaled(to: entry.amount ?? 0 + 25)
                _ = entry.filed(under: section.meal)
                _ = entry.json
            }
        }
        _ = FoodMemory.often(at: .lunch, in: entries)
        _ = FoodMemory.recent(in: entries)

        XCTAssertEqual(state.raw, before, "looking at a day never writes one")
    }
}
