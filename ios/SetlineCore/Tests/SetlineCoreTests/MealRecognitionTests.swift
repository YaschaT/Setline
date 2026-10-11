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

    func testBelgianDishesAndCompounds() {
        XCTAssertEqual(MealRecognition.match("kippenpastei")?.key, "pie")
        XCTAssertEqual(MealRecognition.match("kippenpasteitje met frietjes")?.key, "pie")
        XCTAssertEqual(MealRecognition.match("stoofvlees")?.key, "stew")
        XCTAssertEqual(MealRecognition.match("vol-au-vent")?.key, "pie")
        XCTAssertEqual(MealRecognition.match("kip")?.key, "grilled_chicken")
        let parts = MealRecognition.parts(of: "kippenpastei met frietjes en mayo")
        XCTAssertEqual(parts.compactMap(MealRecognition.scanned).map(\.name),
                       ["Chicken pie (vol-au-vent)", "Fries", "Mayonnaise"])
    }

    func testSimilarityPrefersTheNameThatWasTyped() {
        let good = MealRecognition.similarity("kipfilet", to: "Kipfilet, bereid", brand: "Generiek")
        let bad = MealRecognition.similarity("kippenpastei", to: "Pasta salade", brand: "Delhaize")
        XCTAssertGreaterThan(good, 0.9)
        XCTAssertLessThan(bad, 0.5)
    }

    func testTyposAndShortWordsInsideCompounds() {
        XCTAssertEqual(MealRecognition.match("kippenpqstei")?.key, "pie")
        XCTAssertEqual(MealRecognition.match("stoofvees")?.key, "stew")
        let others = MealRecognition.candidates("kippenpqstei").map(\.key)
        XCTAssertFalse(others.contains("egg"))
    }

    func testBrandedProductBeatsTheGeneralDish() throws {
        let pizza = try XCTUnwrap(MealRecognition.match("dokter oetker pizza bolognaise"))
        XCTAssertEqual(pizza.key, "pizza")
        XCTAssertLessThan(MealRecognition.coverage("dokter oetker pizza bolognaise", by: pizza), 0.6)
        XCTAssertEqual(MealRecognition.coverage("pizza", by: pizza), 1)
        let product = MealRecognition.similarity("dokter oetker pizza bolognaise", to: "Ristorante Pizza Bolognese", brand: "Dr. Oetker")
        XCTAssertEqual(product, 1, accuracy: 0.01)
    }

    func testBreadAsksWhatIsOnItPerSlice() throws {
        let bread = try XCTUnwrap(MealRecognition.scanned(.init(words: "boterhammen", grams: nil, count: 4)))
        XCTAssertEqual(bread.grams, 140)
        let question = try XCTUnwrap(MealRecognition.questions(for: bread.key).first)
        XCTAssertEqual(question.text, "What's on it?")
        let choco = try XCTUnwrap(question.answers.first { $0.id == "choco" })
        let added = try XCTUnwrap(MealRecognition.added(choco, to: bread))
        XCTAssertEqual(added.name, "Chocolate spread")
        XCTAssertEqual(added.grams, 60)
    }

    func testDishAsksHowBigAndKeepsItsRow() throws {
        let pizza = try XCTUnwrap(MealRecognition.match("pizza")).scanned(confidence: .medium)
        let question = try XCTUnwrap(MealRecognition.questions(for: pizza.key).first)
        let large = try XCTUnwrap(question.answers.first { $0.id == "large" })
        let bigger = MealRecognition.sized(pizza, by: large)
        XCTAssertEqual(bigger.grams, 350)
        XCTAssertEqual(bigger.id, pizza.id)
    }
}
