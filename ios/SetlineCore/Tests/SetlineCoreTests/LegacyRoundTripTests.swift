import XCTest
@testable import SetlineCore

/// Phase 1's acceptance gate.
///
/// The blob stays the wire format while iOS is built, so importing it and
/// writing it back must not change, drop or invent a single value.
final class LegacyRoundTripTests: XCTestCase {

    func testRealBackupRoundTripsUnchanged() throws {
        guard let data = Fixtures.backupData else {
            throw XCTSkip("PRIVATE-DATA/yascha-training-backup.json not present")
        }
        let state = try LegacyState.fromExportOrState(data: data)
        let encoded = try state.encoded()
        let reread = try LegacyState(data: encoded)

        XCTAssertEqual(
            JSONValue.object(state.raw),
            JSONValue.object(reread.raw),
            "Re-encoding the state changed it"
        )
        XCTAssertEqual(Set(state.raw.keys), Set(reread.raw.keys))
    }

    func testEveryTopLevelKeySurvivesASessionWrite() throws {
        guard let data = Fixtures.backupData else {
            throw XCTSkip("PRIVATE-DATA/yascha-training-backup.json not present")
        }
        var state = try LegacyState.fromExportOrState(data: data)
        let before = Set(state.raw.keys)
        let sessions = LegacyAdapter.sessions(from: state)

        LegacyAdapter.apply(sessions: sessions, to: &state)

        let after = Set(state.raw.keys)
        XCTAssertTrue(before.isSubset(of: after), "Writing sessions dropped \(before.subtracting(after))")

        // Keys the adapter does not own must be byte-identical afterwards.
        let untouched = ["nutritionEntries", "recoveryDraft", "targets", "metrics", "plan", "scheduleOverrides", "completed", "performance"]
        let original = try LegacyState.fromExportOrState(data: data)
        for key in untouched where original[key] != nil {
            XCTAssertEqual(original[key], state[key], "Key \(key) was modified")
        }
    }

    func testImportReadsTheExpectedShape() throws {
        guard let data = Fixtures.backupData else {
            throw XCTSkip("PRIVATE-DATA/yascha-training-backup.json not present")
        }
        let state = try LegacyState.fromExportOrState(data: data)

        let sessions = LegacyAdapter.sessions(from: state)
        XCTAssertEqual(sessions.count, 6, "Expected the six logged sessions from the export")
        XCTAssertEqual(sessions.filter { $0.kind == .recovery }.count, 1)

        let totalSets = sessions.flatMap(\.results).flatMap(\.sets).count
        XCTAssertEqual(totalSets, 96, "Every logged set must survive the import")

        XCTAssertEqual(LegacyAdapter.metrics(from: state).count, 3)
        XCTAssertEqual(LegacyAdapter.targets(from: state)?.calories, 2750)
        XCTAssertEqual(LegacyAdapter.plan(from: state).count, 5)
        XCTAssertFalse(LegacyAdapter.scheduleOverrides(from: state).isEmpty)
    }

    /// The web app allowed one set to hold normal and paused reps and then
    /// summed them (`completedReps()`). TRAINING_LOGIC §15 change 2 and
    /// design addendum 16R both forbid that.
    func testPausedRepsAreNeverSummedIntoTheRepCount() throws {
        guard let data = Fixtures.backupData else {
            throw XCTSkip("PRIVATE-DATA/yascha-training-backup.json not present")
        }
        let state = try LegacyState.fromExportOrState(data: data)
        let sets = LegacyAdapter.sessions(from: state)
            .flatMap(\.results)
            .flatMap(\.sets)
        let mixed = sets.filter { ($0.pausedReps ?? 0) > 0 && $0.reps > 0 }

        XCTAssertEqual(mixed.count, 2, "The export holds two mixed sets")
        for set in mixed {
            XCTAssertFalse(set.countsTowardProgression, "A mixed set is comparable to neither series")
            XCTAssertTrue(set.countsTowardVolume, "16R: it still counts toward volume")
        }
        // 120 kg × 6 + 2 paused must read as 6, not 8.
        XCTAssertTrue(mixed.contains { $0.weightKg == 120 && $0.reps == 6 && $0.pausedReps == 2 })
    }

    func testSetsWithoutAWeightSurviveAsEmptyRows() throws {
        let json = """
        {"sessions":[{"id":"1","date":"2026-09-01T10:00:00.000Z","dayId":"push","dayLabel":"Push","completion":50,
        "results":[{"exerciseId":"flat-bench","name":"Flat bench press","sets":[
        {"weight":"","reps":"","pausedReps":"","pauseSeconds":"","pauseEnabled":false},
        {"weight":"100","reps":"5","pausedReps":"","pauseSeconds":"","pauseEnabled":false}]}]}]}
        """
        let state = try LegacyState(data: Data(json.utf8))
        let sets = LegacyAdapter.sessions(from: state).flatMap(\.results).flatMap(\.sets)
        XCTAssertEqual(sets.count, 2)
        XCTAssertFalse(sets[0].isLogged)
        XCTAssertTrue(sets[1].isLogged)
        XCTAssertEqual(sets[1].weightKg, 100)
    }
}

/// Pausing a workout must never cost a set, and must not disturb anything
/// else in the shared blob.
final class ActiveSessionTests: XCTestCase {

    private func snapshot() -> ActiveSessionSnapshot {
        ActiveSessionSnapshot(
            dayID: "push",
            dayLabel: "Push",
            startedAt: Date(timeIntervalSince1970: 1_788_000_000),
            currentIndex: 2,
            results: [
                ExerciseResult(
                    exerciseID: "flat-bench",
                    name: "Flat bench press",
                    sets: [
                        LoggedSet(index: 0, weightKg: 102.5, reps: 6, rirReported: 1),
                        LoggedSet(index: 1, weightKg: 102.5, reps: 0),
                    ]
                )
            ],
            proposedReps: ["flat-bench": 6]
        )
    }

    func testSnapshotRoundTripsThroughTheBlob() throws {
        // One snapshot, not two: every LoggedSet mints a fresh id, so
        // rebuilding it for the comparison would never match.
        let original = snapshot()
        var state = LegacyState(raw: ["sessions": .array([])])
        LegacyAdapter.apply(activeSession: original, to: &state)

        let encoded = try state.encoded()
        let reread = try LegacyState(data: encoded)
        let restored = try XCTUnwrap(LegacyAdapter.activeSession(from: reread))

        XCTAssertEqual(restored, original)
        XCTAssertEqual(restored.loggedSetCount, 1, "The written set survived")
        XCTAssertEqual(restored.plannedSetCount, 2, "The pre-filled draft survived too")
        XCTAssertEqual(restored.currentIndex, 2, "It reopens on the exercise it was left on")
    }

    func testClearingLeavesTheRestOfTheBlobAlone() throws {
        var state = LegacyState(raw: [
            "sessions": .array([]),
            "nutritionEntries": .array([.string("keep me")]),
        ])
        LegacyAdapter.apply(activeSession: snapshot(), to: &state)
        LegacyAdapter.apply(activeSession: nil, to: &state)

        XCTAssertNil(LegacyAdapter.activeSession(from: state))
        XCTAssertEqual(state["nutritionEntries"], .array([.string("keep me")]))
    }

    /// A paused session is not history: nothing in it may reach the sessions
    /// list, and therefore progression, records and volume, until it is
    /// finished.
    func testAPausedSessionIsNotASession() throws {
        var state = LegacyState(raw: ["sessions": .array([])])
        LegacyAdapter.apply(activeSession: snapshot(), to: &state)
        XCTAssertTrue(LegacyAdapter.sessions(from: state).isEmpty)
    }
}
