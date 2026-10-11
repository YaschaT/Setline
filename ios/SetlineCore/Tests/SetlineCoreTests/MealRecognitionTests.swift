import XCTest
@testable import SetlineCore

final class MealRecognitionTests: XCTestCase {
    func testTypedLineSplitsAndReadsAmounts() {
        let parts = MealRecognition.parts(of: "200 g rice, 2 eggs and kipfilet")
        XCTAssertEqual(parts.count, 3)
        XCTAssertEqual(parts[0], .init(words: "rice", grams: 200, count: nil))
        XCTAssertEqual(parts[1], .init(words: "eggs", grams: nil, count: 2))
        XCTAssertEqual(parts[2].words, "kipfilet")
    }

    func testTypedPartsBecomeFoods() throws {
        let parts = MealRecognition.parts(of: "200g rijst met 2 eieren en kipfilet")
        let foods = parts.compactMap(MealRecognition.scanned)
        XCTAssertEqual(foods.map(\.name), ["White rice, cooked", "Eggs, boiled", "Chicken breast, cooked"])
        XCTAssertEqual(foods[0].grams, 200)
        XCTAssertEqual(foods[0].calories, 260)
        XCTAssertEqual(foods[1].grams, 100)
        XCTAssertEqual(foods[2].confidence, .medium)
    }

    func testLongestAliasWins() {
        XCTAssertEqual(MealRecognition.match("peanut butter")?.key, "peanut_butter")
        XCTAssertEqual(MealRecognition.match("fried chicken")?.key, "fried_chicken")
        XCTAssertNil(MealRecognition.match("zzz"))
    }

    func testLabelsPreferPreciseFoodsOverBroadOnes() {
        let foods = MealRecognition.fromLabels([
            ("food", 0.9), ("vegetable", 0.7), ("rice", 0.65), ("grilled_chicken", 0.4), ("broccoli", 0.2), ("plate", 0.8),
        ])
        XCTAssertEqual(foods.map(\.name), ["White rice, cooked", "Chicken breast, cooked", "Broccoli"])
        XCTAssertEqual(foods[0].confidence, .high)
        XCTAssertEqual(foods[2].confidence, .low)
    }

    func testOnlyBroadLabelsStillGiveSomething() {
        XCTAssertEqual(MealRecognition.fromLabels([("fruit", 0.5)]).map(\.name), ["Fruit"])
    }
}
