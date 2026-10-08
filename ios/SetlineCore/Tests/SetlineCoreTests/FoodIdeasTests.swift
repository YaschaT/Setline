import XCTest
@testable import SetlineCore

final class FoodIdeasTests: XCTestCase {

    func testAProductKeepsItsPhotoAndAnEmptyOneIsNone() throws {
        let json = """
        [{"id":"1","name":"Skyr","brand":"Arla","calories":63,"protein":11,"carbs":4,"fat":0.2,
          "sourceNote":"Open Food Facts","imageUrl":"https://images.openfoodfacts.org/x.jpg"},
         {"id":"2","name":"Rice","brand":"","calories":130,"protein":2.7,"carbs":28,"fat":0.3,
          "sourceNote":"Generic","imageUrl":""}]
        """.data(using: .utf8)!
        let products = try JSONDecoder().decode([FoodProduct].self, from: json)
        XCTAssertEqual(products[0].imageURL?.absoluteString, "https://images.openfoodfacts.org/x.jpg")
        XCTAssertNil(products[1].imageURL)
    }

    func testAnIdeaLogsItsPortionNotHundredGrams() throws {
        let chicken = try XCTUnwrap(FoodIdeas.all.first { $0.id == "chicken" })
        XCTAssertEqual(chicken.calories, 248)
        XCTAssertEqual(chicken.protein, 47)
        let entry = chicken.entry(id: "x", date: Date(), meal: .lunch)
        XCTAssertEqual(entry.amount, 150)
        XCTAssertEqual(entry.meal, Meal.lunch.rawValue)
        XCTAssertEqual(entry.protein, 47)
    }

    func testProteinFirstWhenProteinIsMissing() {
        XCTAssertEqual(FoodIdeas.ordered(proteinLeft: 0).map(\.id), FoodIdeas.all.map(\.id))
        let ordered = FoodIdeas.ordered(proteinLeft: 90)
        XCTAssertEqual(ordered.first?.id, "tuna", "most protein per calorie")
        XCTAssertEqual(ordered.last?.id, "banana")
    }
}
