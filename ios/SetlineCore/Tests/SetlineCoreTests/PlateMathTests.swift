import XCTest
@testable import SetlineCore

final class PlateMathTests: XCTestCase {

    func testAnExactLoadIsGivenExactly() {
        let solution = PlateMath.solve(target: 50)
        XCTAssertEqual(solution.perSide, [15])
        XCTAssertEqual(solution.total, 50)
        XCTAssertTrue(solution.isExact)
    }

    func testHeaviestPlatesGoOnFirst() {
        XCTAssertEqual(PlateMath.solve(target: 105).perSide, [20, 20, 2.5])
        XCTAssertEqual(PlateMath.solve(target: 55).perSide, [15, 2.5])
    }

    func testAWeightThePlatesCannotMakeBecomesTheClosestTheyCan() {
        let solution = PlateMath.solve(target: 51)
        XCTAssertEqual(solution.total, 50)
        XCTAssertFalse(solution.isExact)

        XCTAssertEqual(PlateMath.solve(target: 52).total, 52.5, "the nearest, not the one below")
    }

    func testTheBarAloneIsAnAnswer() {
        let solution = PlateMath.solve(target: 20)
        XCTAssertTrue(solution.perSide.isEmpty)
        XCTAssertEqual(solution.total, 20)
        XCTAssertTrue(solution.isExact)
    }

    func testNothingLighterThanTheBarIsOffered() {
        XCTAssertEqual(PlateMath.solve(target: 10).total, 20)
        XCTAssertTrue(PlateMath.nearby(target: 20).allSatisfy { $0 >= 20 })
    }

    func testTheFiddlyPlateIsNamedOnlyWhenYouCanLeaveItAlone() {
        XCTAssertEqual(PlateMath.solve(target: 50).unused, 1.25, "15 a side, so the 1,25 stays in the rack")
        XCTAssertEqual(PlateMath.solve(target: 100).unused, 1.25)
        XCTAssertNil(PlateMath.solve(target: 52.5).unused, "16,25 a side needs it")
    }

    func testWithoutTheSmallestPlatesTheStepsGetBigger() {
        let solution = PlateMath.solve(target: 51, plates: [20, 15, 10, 5])
        XCTAssertEqual(solution.total, 50, "5 kg plates move in tens")
        XCTAssertEqual(PlateMath.solve(target: 56, plates: [20, 15, 10, 5]).total, 60)
    }

    func testTheNearbyRowIsWhatThePlatesCanMake() {
        XCTAssertEqual(PlateMath.nearby(target: 50), [47.5, 50, 52.5, 55])
    }

    func testADifferentBarChangesEverything() {
        let solution = PlateMath.solve(target: 60, bar: 15)
        XCTAssertEqual(solution.total, 60)
        XCTAssertEqual(solution.perSide, [20, 2.5])
    }
}
