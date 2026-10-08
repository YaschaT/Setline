import XCTest
@testable import SetlineCore

/// Taking a set out of a workout that was already saved.
///
/// A correction rewrites a set; this removes one. Both name a set the same
/// way, and both leave everything else in the account exactly as it was.
final class SetRemovalTests: XCTestCase {

    private func set(_ weight: String, _ reps: Int) -> JSONValue {
        .object([
            "weight": .string(weight),
            "reps": .string("\(reps)"),
            "pausedReps": .string(""),
            "pauseEnabled": .bool(false),
        ])
    }

    private func state(
        results: [JSONValue],
        sessionID: String = "s-1",
        extra: [String: JSONValue] = [:]
    ) -> LegacyState {
        var session: [String: JSONValue] = [
            "id": .string(sessionID),
            "date": .string("2026-09-18T17:00:00.000Z"),
            "dayId": .string("push"),
            "dayLabel": .string("Push"),
            "completion": .number(100),
            "results": .array(results),
            LegacyAdapter.plannedSetCountKey: .number(3),
            LegacyAdapter.completedSetCountKey: .number(3),
        ]
        for (key, value) in extra { session[key] = value }
        return LegacyState(raw: [
            "sessions": .array([.object(session)]),
            "planMode": .string("personal"),
        ])
    }

    private func bench(_ sets: [JSONValue], name: String = "Bankdrukken", id: String = "flat-bench") -> JSONValue {
        .object(["exerciseId": .string(id), "name": .string(name), "sets": .array(sets)])
    }

    private func sessions(in state: LegacyState) -> [TrainingSession] {
        LegacyAdapter.sessions(from: state)
    }

    // MARK: - One set

    func testOneSetLeavesAndTheOthersKeepTheirOrder() throws {
        let start = state(results: [bench([set("100", 8), set("100", 6), set("95", 6)])])
        let after = StateMerge.apply(
            [StateChange(.removeSessionSets(sessionID: "s-1", removals: [
                SetRemoval(exerciseID: "flat-bench", setIndex: 1),
            ]))],
            to: start
        )

        let result = try XCTUnwrap(sessions(in: after).first?.results.first)
        XCTAssertEqual(result.sets.map(\.reps), [8, 6], "the middle set went, the ends stayed")
        XCTAssertEqual(result.sets.map { $0.weightKg ?? 0 }, [100, 95])
    }

    func testSeveralSetsGoByTheIndicesTheReaderSaw() throws {
        let start = state(results: [bench([set("100", 8), set("100", 6), set("95", 6), set("90", 6)])])
        let after = StateMerge.apply(
            [StateChange(.removeSessionSets(sessionID: "s-1", removals: [
                SetRemoval(exerciseID: "flat-bench", setIndex: 0),
                SetRemoval(exerciseID: "flat-bench", setIndex: 2),
            ]))],
            to: start
        )

        let result = try XCTUnwrap(sessions(in: after).first?.results.first)
        XCTAssertEqual(
            result.sets.map { "\($0.weightKg ?? 0)×\($0.reps)" },
            ["100×6", "90×6"],
            "removing the first set must not shift the second one out from under the request"
        )
    }

    func testTheSameExerciseTwiceInOneSessionIsToldApartByOccurrence() throws {
        let start = state(results: [
            bench([set("100", 8), set("100", 6)]),
            bench([set("80", 10)]),
        ])
        let after = StateMerge.apply(
            [StateChange(.removeSessionSets(sessionID: "s-1", removals: [
                SetRemoval(exerciseID: "flat-bench", occurrence: 1, setIndex: 0),
            ]))],
            to: start
        )

        let results = try XCTUnwrap(sessions(in: after).first?.results)
        XCTAssertEqual(results.count, 1, "the emptied second block went")
        XCTAssertEqual(results.first?.sets.count, 2, "the first block is untouched")
    }

    // MARK: - What goes with it

    func testAnExerciseLeftWithNoSetsLeavesTheSession() throws {
        let start = state(results: [
            bench([set("100", 8)]),
            bench([set("60", 12)], name: "Flyes", id: "pec-fly"),
        ])
        let after = StateMerge.apply(
            [StateChange(.removeSessionSets(sessionID: "s-1", removals: [
                SetRemoval(exerciseID: "pec-fly", setIndex: 0),
            ]))],
            to: start
        )

        let session = try XCTUnwrap(sessions(in: after).first)
        XCTAssertEqual(session.results.map(\.exerciseID), ["flat-bench"])
    }

    func testTheLastSetTakesTheSessionWithIt() {
        let start = state(results: [bench([set("100", 8)])])
        let after = StateMerge.apply(
            [StateChange(.removeSessionSets(sessionID: "s-1", removals: [
                SetRemoval(exerciseID: "flat-bench", setIndex: 0),
            ]))],
            to: start
        )
        XCTAssertTrue(sessions(in: after).isEmpty, "an empty workout would still read as a trained day")
    }

    func testTheDerivedSetCountsGoBecauseTheyNoLongerDescribeTheSession() throws {
        let start = state(results: [bench([set("100", 8), set("100", 6)])])
        let after = StateMerge.apply(
            [StateChange(.removeSessionSets(sessionID: "s-1", removals: [
                SetRemoval(exerciseID: "flat-bench", setIndex: 0),
            ]))],
            to: start
        )

        let stored = try XCTUnwrap(after.raw["sessions"]?.arrayValue?.first?.objectValue)
        XCTAssertNil(stored[LegacyAdapter.plannedSetCountKey])
        XCTAssertNil(stored[LegacyAdapter.completedSetCountKey])
        XCTAssertEqual(stored["date"]?.stringValue, "2026-09-18T17:00:00.000Z", "the session keeps everything else")
        XCTAssertEqual(stored["dayLabel"]?.stringValue, "Push")
    }

    func testNothingElseInTheAccountIsTouched() throws {
        let start = state(
            results: [bench([set("100", 8), set("100", 6)])],
            extra: ["note": .string("zware dag")]
        )
        var raw = start.raw
        raw["nutritionEntries"] = .array([.object(["id": .string("f-1"), "name": .string("Havermout")])])
        let before = LegacyState(raw: raw)

        let after = StateMerge.apply(
            [StateChange(.removeSessionSets(sessionID: "s-1", removals: [
                SetRemoval(exerciseID: "flat-bench", setIndex: 0),
            ]))],
            to: before
        )
        XCTAssertEqual(after.raw["nutritionEntries"], before.raw["nutritionEntries"])
        let stored = try XCTUnwrap(after.raw["sessions"]?.arrayValue?.first?.objectValue)
        XCTAssertEqual(stored["note"]?.stringValue, "zware dag", "keys this change does not own stay")
    }

    // MARK: - A removal that cannot be applied

    func testAnIndexThatIsNotThereChangesNothing() {
        let start = state(results: [bench([set("100", 8)])])
        let after = StateMerge.apply(
            [StateChange(.removeSessionSets(sessionID: "s-1", removals: [
                SetRemoval(exerciseID: "flat-bench", setIndex: 4),
            ]))],
            to: start
        )
        XCTAssertEqual(after.raw, start.raw)
    }

    func testARemovalForASessionTheAccountDoesNotHoldChangesNothing() {
        let start = state(results: [bench([set("100", 8)])])
        let after = StateMerge.apply(
            [StateChange(.removeSessionSets(sessionID: "s-99", removals: [
                SetRemoval(exerciseID: "flat-bench", setIndex: 0),
            ]))],
            to: start
        )
        XCTAssertEqual(after.raw, start.raw)
    }

    // MARK: - Corrections and removals in one save

    func testACorrectionAndARemovalInOneSaveBothLandOnTheRightSets() throws {
        let start = state(results: [bench([set("100", 8), set("100", 6), set("95", 6)])])
        let after = StateMerge.apply(
            [
                StateChange(.correctSessionSets(sessionID: "s-1", corrections: [
                    SetCorrection(exerciseID: "flat-bench", setIndex: 2, weightKg: 97.5, reps: 6),
                ])),
                StateChange(.removeSessionSets(sessionID: "s-1", removals: [
                    SetRemoval(exerciseID: "flat-bench", setIndex: 0),
                ])),
            ],
            to: start
        )

        let result = try XCTUnwrap(sessions(in: after).first?.results.first)
        XCTAssertEqual(
            result.sets.map { "\($0.weightKg ?? 0)×\($0.reps)" },
            ["100×6", "97,5×6".replacingOccurrences(of: ",", with: ".")],
            "the correction landed by the index the reader saw, and the removal after it"
        )
    }

    // MARK: - It survives the queue

    func testARemovalSurvivesBeingWrittenAndReadBack() throws {
        let change = StateChange(.removeSessionSets(sessionID: "s-1", removals: [
            SetRemoval(exerciseID: "flat-bench", occurrence: 1, setIndex: 2),
        ]))
        let data = try JSONEncoder().encode(change)
        let read = try JSONDecoder().decode(StateChange.self, from: data)
        XCTAssertEqual(read.kind, change.kind)
    }

    func testTheQueueSaysWhatIsWaiting() {
        let rows = SyncQueue.rows(from: [
            StateChange(.removeSessionSets(sessionID: "s-1", removals: [
                SetRemoval(exerciseID: "flat-bench", setIndex: 0),
            ])),
        ])
        XCTAssertEqual(rows.first?.title, "Correction")
        XCTAssertEqual(rows.first?.detail, "1 set removed from an earlier session")
    }
}
