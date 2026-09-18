import XCTest
@testable import SetlineCore

/// One search, ranked once, on the server.
///
/// `tests/fixtures/food-search/skyr.json` records what `/api/food-search`
/// answers for a query; `tests/food-search.test.mjs` proves the endpoint
/// produces exactly that, through either door. This is the other end: what
/// this app makes of the same bytes, which must be the same products in the
/// same order, because it has no ranking of its own to apply.
final class FoodSearchContractTests: XCTestCase {

    private func fixture() throws -> (expected: Data, query: String) {
        guard let root = Fixtures.repoRoot else { throw XCTSkip("Repository root not found") }
        let url = root.appendingPathComponent("tests/fixtures/food-search/skyr.json")
        let object = try JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any]
        guard let expected = object?["expected"], let query = object?["query"] as? String else {
            throw XCTSkip("Fixture is not in the expected shape")
        }
        return (try JSONSerialization.data(withJSONObject: expected), query)
    }

    func testTheServersRankingIsWhatTheAppShows() throws {
        let (expected, _) = try fixture()
        let products = try FoodSearch.results(from: expected)

        XCTAssertEqual(products.map(\.name), ["Magere skyr", "Skyr naturel", "Skyr nature"])
        XCTAssertEqual(products.map(\.brand), ["Generiek", "Boni", "Yoplait"])
        XCTAssertEqual(products.first?.id, "generic-magere-skyr-0")
    }

    func testEveryValueArrivesAsTheServerSentIt() throws {
        let (expected, _) = try fixture()
        let belgian = try XCTUnwrap(FoodSearch.results(from: expected).first { $0.id == "off-5400141000009" })

        XCTAssertEqual(belgian.calories, 63)
        XCTAssertEqual(belgian.protein, 11)
        XCTAssertEqual(belgian.carbs, 3.8)
        XCTAssertEqual(belgian.fat, 0.2)
        XCTAssertEqual(belgian.note, "Belgisch product · per 100 g", "the server's own words, not ours")
    }

    func testTheQueryGoesToTheSharedEndpoint() throws {
        let (_, query) = try fixture()
        XCTAssertEqual(FoodSearch.path(for: query), "/api/food-search?q=skyr")
    }

    func testAQueryIsTrimmedToWhatTheServerAccepts() {
        let long = String(repeating: "a", count: 200)
        XCTAssertEqual(FoodSearch.path(for: long).count, "/api/food-search?q=".count + 80)
    }

    func testGenericOnlyAnswersAreMarkedAsPartial() throws {
        let partial = Data("""
        {"results":[{"id":"generic-banaan-0","name":"Banaan","brand":"Generiek","calories":89,
         "protein":1.1,"carbs":22.8,"fat":0.3,"source":"Generiek","sourceNote":"Gemiddelde schatting per 100 g"}],
         "partial":true,"query":"banaan","disclaimer":"x"}
        """.utf8)
        XCTAssertTrue(FoodSearch.isPartial(partial))
        XCTAssertEqual(try FoodSearch.results(from: partial).count, 1)

        let (expected, _) = try fixture()
        XCTAssertFalse(FoodSearch.isPartial(expected))
    }

    func testTheServersOwnRefusalIsWhatTheReaderIsTold() {
        let refusal = Data(#"{"error":"QUERY_TOO_SHORT","message":"Typ minstens twee tekens."}"#.utf8)
        XCTAssertEqual(FoodSearch.message(from: refusal), "Typ minstens twee tekens.")
    }

    // MARK: Portions, which are this app's own arithmetic

    func testAPortionIsScaledFromTheHundredGramValues() throws {
        let (expected, _) = try fixture()
        let skyr = try XCTUnwrap(FoodSearch.results(from: expected).first)
        let draft = FoodSearch.portion(of: skyr, grams: 250)

        XCTAssertEqual(draft.name, "250 g Magere skyr")
        XCTAssertEqual(draft.calories, 158)
        XCTAssertEqual(draft.protein, 27.5)
        XCTAssertEqual(draft.carbs, 9.5)
        XCTAssertEqual(draft.fat, 0.5)
    }

    func testNoPortionIsNoNumbers() throws {
        let (expected, _) = try fixture()
        let skyr = try XCTUnwrap(FoodSearch.results(from: expected).first)
        let draft = FoodSearch.portion(of: skyr, grams: 0)

        XCTAssertEqual(draft.name, "Magere skyr")
        XCTAssertEqual(draft.calories, 0)
    }
}
