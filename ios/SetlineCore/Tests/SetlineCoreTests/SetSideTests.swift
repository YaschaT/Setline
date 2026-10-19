import XCTest
@testable import SetlineCore

/// The side of a one-sided set travels with the set, and never doubles it.
final class SetSideTests: XCTestCase {

    private func set(side: SetSide?) -> LoggedSet {
        LoggedSet(index: 0, weightKg: 30, reps: 10, origin: .prescribed, side: side)
    }

    func testTheSideSurvivesTheSharedWireFormat() throws {
        for side in SetSide.allCases {
            let written = JSONValue(set: set(side: side))
            XCTAssertEqual(written.objectValue?["side"]?.stringValue, side.rawValue)
            let readBack = try XCTUnwrap(LegacyAdapter.loggedSet(from: written, index: 0))
            XCTAssertEqual(readBack.side, side)
        }
    }

    func testNoSideWritesNoKey() {
        let written = JSONValue(set: set(side: nil))
        XCTAssertNil(written.objectValue?["side"])
    }

    func testTheSideSurvivesTheSessionSnapshot() throws {
        let data = try JSONEncoder().encode(set(side: .left))
        XCTAssertEqual(try JSONDecoder().decode(LoggedSet.self, from: data).side, .left)
    }

    func testBothSidesCountOnceInVolume() {
        XCTAssertEqual(RecordsEngine.volumeLoad([set(side: .both)]), 300)
        XCTAssertEqual(RecordsEngine.volumeLoad([set(side: .left), set(side: .right)]), 600)
    }

    func testACorrectionKeepsTheSide() {
        let stored = JSONValue(set: set(side: .right)).objectValue ?? [:]
        let corrected = SetCorrection(exerciseID: "x", setIndex: 0, weightKg: 32.5, reps: 8).applied(to: stored)
        XCTAssertEqual(corrected["side"]?.stringValue, "R")
    }
}

/// To failure, failed and drop sets travel with the set.
final class SetIntensityTests: XCTestCase {

    func testAFailedSetStaysFailedAfterSaving() throws {
        let set = LoggedSet(index: 0, weightKg: 100, reps: 4, flags: [.failed])
        let written = JSONValue(set: set)
        XCTAssertEqual(written.objectValue?["failed"]?.boolValue, true)
        XCTAssertTrue(try XCTUnwrap(LegacyAdapter.loggedSet(from: written, index: 0)).flags.contains(.failed))
        XCTAssertNil(JSONValue(set: LoggedSet(index: 0, weightKg: 100, reps: 4)).objectValue?["failed"])
    }

    func testToFailureIsReserveZeroAndSurvives() throws {
        let written = JSONValue(set: LoggedSet(index: 0, weightKg: 100, reps: 8, rirReported: 0))
        XCTAssertEqual(try XCTUnwrap(LegacyAdapter.loggedSet(from: written, index: 0)).rirReported, 0)
    }

    func testDropsRoundTripAndAddVolumeOnly() throws {
        let set = LoggedSet(index: 0, weightKg: 100, reps: 8, drops: [DropStep(weightKg: 80, reps: 6), DropStep(weightKg: 60, reps: 6)])
        let readBack = try XCTUnwrap(LegacyAdapter.loggedSet(from: JSONValue(set: set), index: 0))
        XCTAssertEqual(readBack.drops, set.drops)
        XCTAssertEqual(readBack.reps, 8, "the set's own reps never take the drops in")
        XCTAssertEqual(RecordsEngine.volumeLoad([readBack]), 800 + 480 + 360)
        let data = try JSONEncoder().encode(set)
        XCTAssertEqual(try JSONDecoder().decode(LoggedSet.self, from: data).drops.count, 2)
    }

    func testDropsNeverMoveTheEstimate() {
        let plain = LoggedSet(index: 0, weightKg: 100, reps: 5)
        var dropped = plain
        dropped.drops = [DropStep(weightKg: 70, reps: 12)]
        XCTAssertEqual(ProgressOverview.best(of: [plain])?.weightKg, ProgressOverview.best(of: [dropped])?.weightKg)
        XCTAssertEqual(dropped.countsTowardProgression, plain.countsTowardProgression)
    }
}

/// Reps per side within one two-sided set.
final class SideRepsTests: XCTestCase {

    private func set(left: Int, right: Int) -> LoggedSet {
        let sides = SideReps(left: left, right: right)
        return LoggedSet(index: 0, weightKg: 20, reps: sides.weaker, side: .both, sideReps: sides)
    }

    func testTheSidesRoundTripAndTheSetCountsAsTheWeakerSide() throws {
        let readBack = try XCTUnwrap(LegacyAdapter.loggedSet(from: JSONValue(set: set(left: 8, right: 7)), index: 0))
        XCTAssertEqual(readBack.sideReps, SideReps(left: 8, right: 7))
        XCTAssertEqual(readBack.reps, 7)
        XCTAssertEqual(readBack.sideReps?.label, "L 8 · R 7")
    }

    func testVolumeTakesTheAverageSoEqualSidesCountOnce() {
        XCTAssertEqual(RecordsEngine.volumeLoad([set(left: 8, right: 6)]), 140)
        XCTAssertEqual(RecordsEngine.volumeLoad([set(left: 8, right: 8)]),
                       RecordsEngine.volumeLoad([LoggedSet(index: 0, weightKg: 20, reps: 8, side: .both)]))
    }

    func testACorrectionThatChangesTheRepsDropsTheSides() {
        let stored = JSONValue(set: set(left: 8, right: 7)).objectValue ?? [:]
        let kept = SetCorrection(exerciseID: "x", setIndex: 0, weightKg: 22, reps: 7).applied(to: stored)
        XCTAssertEqual(kept["repsLeft"]?.stringValue, "8", "same reps: the sides stay")
        let changed = SetCorrection(exerciseID: "x", setIndex: 0, weightKg: 20, reps: 10).applied(to: stored)
        XCTAssertNil(changed["repsLeft"])
        XCTAssertNil(changed["repsRight"])
    }
}
