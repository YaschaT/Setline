import XCTest
@testable import SetlineCore

/// Paused reps belong to the set that holds them.
///
/// "120 kg × 6, de laatste 2 gepauzeerd" is one set of six reps, two of which
/// carried the pause: six reps of volume, one completed set, and no second
/// set anywhere. The count therefore lives inside `reps`, bounded by it.
final class PausedRepsTests: XCTestCase {

    private func set(reps: Int, paused: Int?, weightKg: Decimal = 120) -> LoggedSet {
        let within = LoggedSet.pausedRepsWithin(paused, reps: reps)
        return LoggedSet(
            index: 0,
            weightKg: weightKg,
            reps: reps,
            modifiers: SetModifiers(
                pauseEnabled: (paused ?? 0) > 0,
                pauseSeconds: (paused ?? 0) > 0 ? 2 : nil
            ),
            pausedReps: within
        )
    }

    // MARK: - The three shapes

    func testSixRepsWithNoPauseIsAnOrdinarySet() {
        let plain = set(reps: 6, paused: nil)
        XCTAssertEqual(plain.reps, 6)
        XCTAssertNil(plain.pausedReps)
        XCTAssertFalse(plain.modifiers.pauseEnabled)
        XCTAssertEqual(RecordsEngine.volumeLoad([plain]), 720)
        XCTAssertTrue(plain.countsTowardProgression)
    }

    func testSixRepsWithTwoPausedIsOneSetOfSix() {
        let mixed = set(reps: 6, paused: 2)
        XCTAssertEqual(mixed.reps, 6, "The reps performed, paused ones included")
        XCTAssertEqual(mixed.pausedReps, 2, "Two of those six carried the pause")
        XCTAssertTrue(mixed.modifiers.pauseEnabled)
        XCTAssertEqual(RecordsEngine.volumeLoad([mixed]), 720, "Six reps of volume, not eight")
        XCTAssertTrue(mixed.countsTowardVolume)
        XCTAssertFalse(mixed.countsTowardProgression, "Comparable to neither series, as before")
    }

    func testEveryRepPausedIsSimplyAPausedSet() {
        let paused = set(reps: 6, paused: 6)
        XCTAssertEqual(paused.reps, 6)
        XCTAssertNil(paused.pausedReps, "A count of all of them says nothing the modifier does not")
        XCTAssertTrue(paused.modifiers.pauseEnabled)
        XCTAssertEqual(RecordsEngine.volumeLoad([paused]), 720)
        XCTAssertTrue(paused.countsTowardProgression, "Within its own paused series it is a normal set")
    }

    // MARK: - The bound

    func testAPausedCountNeverPassesTheRepsPerformed() {
        XCTAssertEqual(LoggedSet.pausedRepsWithin(2, reps: 6), 2)
        XCTAssertNil(LoggedSet.pausedRepsWithin(6, reps: 6), "All of them is a paused set")
        XCTAssertNil(LoggedSet.pausedRepsWithin(9, reps: 6), "And so is more than all of them")
        XCTAssertNil(LoggedSet.pausedRepsWithin(0, reps: 6))
        XCTAssertNil(LoggedSet.pausedRepsWithin(nil, reps: 6))
        XCTAssertNil(LoggedSet.pausedRepsWithin(3, reps: 0), "Nothing performed, nothing paused")

        // Lowering the reps under a standing count brings the count with it.
        XCTAssertEqual(LoggedSet.pausedRepsWithin(4, reps: 5), 4)
        XCTAssertNil(LoggedSet.pausedRepsWithin(4, reps: 3))
    }

    // MARK: - One set, and one set only

    func testAPausedSetIsStillOneCompletedSet() {
        let result = ExerciseResult(
            exerciseID: "flat-bench",
            name: "Flat bench press",
            sets: [set(reps: 6, paused: 2)]
        )
        let logged = result.sets.filter(\.isLogged)
        XCTAssertEqual(logged.count, 1, "One set performed, however its reps were done")
        XCTAssertEqual(logged.reduce(0) { $0 + $1.reps }, 6, "And six reps, counted once")
        XCTAssertEqual(RecordsEngine.volumeLoad(result.sets), 720)
    }

    // MARK: - Persistence: save, relaunch, sync

    func testTheCountSurvivesTheAppsOwnStore() throws {
        // The paused session snapshot and the local store both go through
        // Codable, which is what a cold relaunch reads back.
        let original = set(reps: 6, paused: 2)
        let data = try JSONEncoder().encode(original)
        let restored = try JSONDecoder().decode(LoggedSet.self, from: data)
        XCTAssertEqual(restored.pausedReps, 2)
        XCTAssertEqual(restored.reps, 6)
        XCTAssertTrue(restored.modifiers.pauseEnabled)
    }

    func testTheCountSurvivesTheSharedWireFormat() throws {
        let written = JSONValue(set: set(reps: 6, paused: 2))
        XCTAssertEqual(written.objectValue?["reps"]?.stringValue, "6")
        XCTAssertEqual(written.objectValue?["pausedReps"]?.stringValue, "2")

        let readBack = try XCTUnwrap(LegacyAdapter.loggedSet(from: written, index: 0))
        XCTAssertEqual(readBack.reps, 6, "Nothing is summed on the way back in")
        XCTAssertEqual(readBack.pausedReps, 2)
        XCTAssertTrue(readBack.modifiers.pauseEnabled)
        XCTAssertEqual(RecordsEngine.volumeLoad([readBack]), 720)
    }

    func testAPausedSetWithoutACountRoundTripsAsAPausedSet() throws {
        let written = JSONValue(set: set(reps: 6, paused: 6))
        XCTAssertEqual(written.objectValue?["pausedReps"]?.stringValue, "")
        XCTAssertEqual(written.objectValue?["pauseEnabled"]?.boolValue, true)

        let readBack = try XCTUnwrap(LegacyAdapter.loggedSet(from: written, index: 0))
        XCTAssertNil(readBack.pausedReps)
        XCTAssertEqual(readBack.reps, 6)
        XCTAssertTrue(readBack.modifiers.pauseEnabled)
    }

    // MARK: - A correction keeps the same rule

    func testACorrectionCarriesTheCountAndItsBound() {
        let correction = SetCorrection(
            exerciseID: "flat-bench",
            setIndex: 0,
            set: set(reps: 6, paused: 2)
        )
        XCTAssertEqual(correction.pausedReps, 2)

        let stored: [String: JSONValue] = [
            "weight": .string("120"), "reps": .string("6"),
            "pausedReps": .string(""), "pauseEnabled": .bool(false),
            "isWarmup": .bool(false),
        ]
        let applied = correction.applied(to: stored)
        XCTAssertEqual(applied["reps"]?.stringValue, "6")
        XCTAssertEqual(applied["pausedReps"]?.stringValue, "2")
        XCTAssertEqual(applied["isWarmup"]?.boolValue, false, "Keys the correction does not own stay")
    }

    // MARK: - How it reads afterwards

    func testTheSetRowNamesTheRepsThatWerePaused() {
        let rows = SetRowPresenter.rows(
            sets: [set(reps: 6, paused: 2)],
            reference: nil,
            history: ExerciseHistory(exerciseID: "flat-bench", modifiers: .none, appearances: []),
            activeIndex: nil
        )
        XCTAssertEqual(rows.first?.delta, .paused(reps: 2))
        XCTAssertEqual(rows.first?.repsLabel, "6", "The rep column shows the reps performed")
    }

    func testAFullyPausedSetStillReadsAsAPausedSet() {
        let rows = SetRowPresenter.rows(
            sets: [set(reps: 6, paused: 6)],
            reference: nil,
            history: ExerciseHistory(exerciseID: "flat-bench", modifiers: .none, appearances: []),
            activeIndex: nil
        )
        XCTAssertEqual(rows.first?.delta, .paused(reps: nil))
    }
}
