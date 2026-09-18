import XCTest
@testable import SetlineCore

final class FoodSearchTests: XCTestCase {

    private func payload(_ products: String) -> Data {
        Data("{\"products\":[\(products)]}".utf8)
    }

    // MARK: The generic table

    func testAGenericFoodIsFoundByItsNameOrByWhatPeopleCallIt() {
        XCTAssertEqual(FoodSearch.generic(matching: "haver").first?.name, "Havermout")
        XCTAssertEqual(FoodSearch.generic(matching: "kwark").first?.name, "Magere skyr")
        XCTAssertEqual(FoodSearch.generic(matching: "chicken").first?.name, "Kipfilet, bereid")
    }

    func testOneLetterIsNotASearch() {
        XCTAssertTrue(FoodSearch.generic(matching: "k").isEmpty)
    }

    func testAtMostFiveGenericFoods() {
        XCTAssertLessThanOrEqual(FoodSearch.generic(matching: "e").count, 5)
    }

    // MARK: Products

    func testAProductIsReadWithItsDutchNameAndItsFirstBrand() throws {
        let products = try FoodSearch.products(from: payload("""
        {"code":"123","product_name":"Skyr plain","product_name_nl":"Skyr naturel",
         "brands":"Boni, Colruyt","countries_tags":["en:belgium"],
         "nutriments":{"energy-kcal_100g":63,"proteins_100g":11,"carbohydrates_100g":3.8,"fat_100g":0.2}}
        """))
        let product = try XCTUnwrap(products.first)
        XCTAssertEqual(product.name, "Skyr naturel")
        XCTAssertEqual(product.brand, "Boni")
        XCTAssertEqual(product.id, "off-123")
        XCTAssertEqual(product.protein, 11)
        XCTAssertEqual(product.note, "Belgisch product · per 100 g")
    }

    func testNumbersArriveAsNumbersOrAsText() throws {
        let products = try FoodSearch.products(from: payload("""
        {"code":"1","product_name":"Melk","nutriments":{"energy-kcal_100g":"47","proteins_100g":"3,5"}}
        """))
        XCTAssertEqual(products.first?.calories, 47)
        XCTAssertEqual(products.first?.protein, 3.5)
    }

    func testAProductWithoutANameOrAPlausibleEnergyIsNotShown() throws {
        let products = try FoodSearch.products(from: payload("""
        {"code":"1","product_name":"","nutriments":{"energy-kcal_100g":100}},
        {"code":"2","product_name":"Leeg","nutriments":{}},
        {"code":"3","product_name":"Onmogelijk","nutriments":{"energy-kcal_100g":4000}}
        """))
        XCTAssertTrue(products.isEmpty)
    }

    func testBelgianProductsComeFirst() throws {
        let products = try FoodSearch.products(from: payload("""
        {"code":"1","product_name":"Frans","countries_tags":["en:france"],"nutriments":{"energy-kcal_100g":100}},
        {"code":"2","product_name":"Belgisch","countries_tags":["en:belgium"],"nutriments":{"energy-kcal_100g":100}}
        """))
        XCTAssertEqual(products.map(\.name), ["Belgisch", "Frans"])
    }

    func testTheSameProductIsNotListedTwice() {
        let one = FoodProduct(id: "a", name: "Skyr", brand: "Boni", calories: 63, protein: 11, carbs: 4, fat: 0, note: "")
        let again = FoodProduct(id: "b", name: "skyr", brand: "boni", calories: 63, protein: 11, carbs: 4, fat: 0, note: "")
        XCTAssertEqual(FoodSearch.merged(generic: [one], products: [again]).count, 1)
    }

    func testAtMostFifteenResults() {
        let many = (0..<30).map {
            FoodProduct(id: "\($0)", name: "Product \($0)", brand: "Merk", calories: 100, protein: 0, carbs: 0, fat: 0, note: "")
        }
        XCTAssertEqual(FoodSearch.merged(generic: [], products: many).count, 15)
    }

    // MARK: Portions

    func testAPortionIsScaledFromTheHundredGramValues() {
        let skyr = FoodProduct(id: "a", name: "Magere skyr", brand: "Generiek", calories: 63, protein: 11, carbs: 3.8, fat: 0.2, note: "")
        let draft = FoodSearch.portion(of: skyr, grams: 250)
        XCTAssertEqual(draft.name, "250 g Magere skyr")
        XCTAssertEqual(draft.calories, 158)
        XCTAssertEqual(draft.protein, 27.5)
        XCTAssertEqual(draft.carbs, 9.5)
        XCTAssertEqual(draft.fat, 0.5)
    }

    func testNoPortionIsNoNumbers() {
        let skyr = FoodProduct(id: "a", name: "Magere skyr", brand: "", calories: 63, protein: 11, carbs: 4, fat: 0, note: "")
        let draft = FoodSearch.portion(of: skyr, grams: 0)
        XCTAssertEqual(draft.name, "Magere skyr")
        XCTAssertEqual(draft.calories, 0)
    }

    // MARK: The query

    func testTheQueryAsksForWhatTheServerAsksFor() throws {
        let url = try XCTUnwrap(FoodSearch.endpoint(for: "skyr"))
        let query = try XCTUnwrap(URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems)
        let values = Dictionary(uniqueKeysWithValues: query.map { ($0.name, $0.value ?? "") })
        XCTAssertEqual(values["search_terms"], "skyr")
        XCTAssertEqual(values["lc"], "nl")
        XCTAssertEqual(values["cc"], "be")
        XCTAssertEqual(values["page_size"], "15")
    }
}
