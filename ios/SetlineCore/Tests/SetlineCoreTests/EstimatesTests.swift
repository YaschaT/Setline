import XCTest
@testable import SetlineCore

/// The estimated 1RM, and the guards around it (TRAINING_LOGIC §10.2).
///
/// The table lives in `tests/fixtures/one-rep-max.json` and is read by the web
/// app's own test as well, so a formula that changes on one side only fails on
/// the other.
final class EstimatesTests: XCTestCase {

    private struct Fixture: Decodable {
        struct Case: Decodable {
            let weightKg: Decimal
            let reps: Int
            let e1RM: Decimal
            let roundedHalfKg: Decimal
        }
        struct Refusal: Decodable {
            let weightKg: Decimal
            let reps: Int
        }
        let tolerance: Decimal
        let cases: [Case]
        let refused: [Refusal]
    }

    private func fixture() throws -> Fixture {
        guard let root = Fixtures.repoRoot else { throw XCTSkip("Repository root not found") }
        let url = root.appendingPathComponent("tests/fixtures/one-rep-max.json")
        return try JSONDecoder().decode(Fixture.self, from: Data(contentsOf: url))
    }

    func testTheSharedTableIsWhatThisAppComputes() throws {
        let fixture = try fixture()
        XCTAssertFalse(fixture.cases.isEmpty)

        for entry in fixture.cases {
            let estimate = try XCTUnwrap(
                Estimates.e1RM(weightKg: entry.weightKg, reps: entry.reps),
                "\(entry.weightKg) × \(entry.reps) has an estimate"
            )
            let difference = abs((estimate - entry.e1RM) as Decimal)
            XCTAssertLessThanOrEqual(
                difference, fixture.tolerance,
                "\(entry.weightKg) kg × \(entry.reps): computed \(estimate), fixture says \(entry.e1RM)"
            )
            XCTAssertEqual(
                Estimates.round(estimate, toIncrement: 0.5), entry.roundedHalfKg,
                "\(entry.weightKg) kg × \(entry.reps) reads as \(entry.roundedHalfKg) on screen"
            )
        }
    }

    func testWhatTheSharedTableRefusesIsRefusedHereToo() throws {
        for entry in try fixture().refused {
            XCTAssertNil(
                Estimates.e1RM(weightKg: entry.weightKg, reps: entry.reps),
                "\(entry.weightKg) × \(entry.reps) is not an estimate"
            )
        }
    }

    // MARK: - The shape of the formula

    func testASingleIsWorthExactlyWhatWasLifted() throws {
        // Epley's old answer here was 103,3 kg for a 100 kg single — an
        // estimate above a weight that was actually lifted for one.
        XCTAssertEqual(Estimates.e1RM(weightKg: 100, reps: 1), 100)
    }

    func testTenRepsIsWhereBrzyckiAndEpleyAgree() throws {
        let brzycki = try XCTUnwrap(Estimates.e1RM(weightKg: 100, reps: 10))
        let epley: Decimal = 100 * (1 + Decimal(10) / 30)
        XCTAssertLessThanOrEqual(abs((brzycki - epley) as Decimal), 0.001)
    }

    func testTheEstimateRisesWithBothWeightAndReps() throws {
        let lighter = try XCTUnwrap(Estimates.e1RM(weightKg: 100, reps: 5))
        let heavier = try XCTUnwrap(Estimates.e1RM(weightKg: 105, reps: 5))
        let longer = try XCTUnwrap(Estimates.e1RM(weightKg: 100, reps: 6))
        XCTAssertGreaterThan(heavier, lighter)
        XCTAssertGreaterThan(longer, lighter)
    }

    func testAboveTenRepsTheAppSaysNothingRatherThanSomethingFlattering() {
        XCTAssertNotNil(Estimates.e1RM(weightKg: 60, reps: 10))
        XCTAssertNil(Estimates.e1RM(weightKg: 60, reps: 11))
        XCTAssertNil(Estimates.e1RM(weightKg: 60, reps: 20))
    }
}
