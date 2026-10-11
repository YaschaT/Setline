import XCTest
@testable import SetlineCore

final class FoodLookupTests: XCTestCase {
    func testBarcodeParsesValuesPer100gAndServing() throws {
        let json = """
        {"status":1,"product":{"product_name":"Skyr naturel","brands":"Arla, Lidl","serving_quantity":"150",
        "image_front_small_url":"https://images.openfoodfacts.org/x.jpg",
        "nutriments":{"energy-kcal_100g":63,"proteins_100g":11,"carbohydrates_100g":3.8,"fat_100g":0.2}}}
        """.data(using: .utf8)!
        let product = try XCTUnwrap(BarcodeProduct.parse(json, barcode: "5701234567890"))
        XCTAssertEqual(product.product.name, "Skyr naturel")
        XCTAssertEqual(product.product.brand, "Arla")
        XCTAssertEqual(product.product.calories, 63)
        XCTAssertEqual(product.product.protein, 11)
        XCTAssertEqual(product.servingGrams, 150)
    }

    func testBarcodeWithoutProductOrEnergyIsNil() {
        XCTAssertNil(BarcodeProduct.parse(#"{"status":0}"#.data(using: .utf8)!, barcode: "1"))
        XCTAssertNil(BarcodeProduct.parse(#"{"status":1,"product":{"product_name":"X","nutriments":{}}}"#.data(using: .utf8)!, barcode: "1"))
    }

    func testBarcodeFallsBackToKilojoules() throws {
        let json = #"{"status":1,"product":{"product_name":"Bar","nutriments":{"energy_100g":1674}}}"#.data(using: .utf8)!
        XCTAssertEqual(try XCTUnwrap(BarcodeProduct.parse(json, barcode: "2")).product.calories, 400)
    }

    func testScannedFoodScalesWithGrams() throws {
        let answer = try JSONDecoder().decode(FoodScanAnswer.self, from: """
        {"items":[{"name":"Chicken breast","grams":150,"calories":248,"protein":46.5,"carbs":0,"fat":5.4,"confidence":"high"}]}
        """.data(using: .utf8)!)
        let doubled = answer.items[0].scaled(to: 300)
        XCTAssertEqual(doubled.calories, 496)
        XCTAssertEqual(doubled.protein, 93)
        XCTAssertEqual(answer.items[0].confidence, .high)
    }

    func testFavoriteRoundTripsAnEntry() {
        let entry = NutritionEntry(id: "a", date: "2026-10-10", meal: "lunch", name: "Skyr", calories: 95, protein: 16.5, carbs: 5.7, fat: 0.3, amount: 150, unit: "g")
        let favorite = FavoriteFood(entry)
        XCTAssertTrue(favorite.matches(entry))
        XCTAssertEqual(favorite.portion, "150 g")
        let again = favorite.entry(id: "b", on: Date(), meal: .snack)
        XCTAssertEqual(again.calories, 95)
        XCTAssertEqual(again.meal, Meal.snack.rawValue)
    }
}
