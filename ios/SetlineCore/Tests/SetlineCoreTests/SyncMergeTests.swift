import XCTest
@testable import SetlineCore

/// How iOS changes are applied to the stored state: only what they mention,
/// by identity, and never by rewriting what iOS did not touch.
final class SyncMergeTests: XCTestCase {

    private let date = Date(timeIntervalSince1970: 1_789_000_000)

    /// The regression this whole design exists for, against the real export.
    func testSavingOneWorkoutLeavesEveryStoredSessionByteIdentical() throws {
        guard let data = Fixtures.backupData else {
            throw XCTSkip("PRIVATE-DATA/yascha-training-backup.json not present")
        }
        let original = try LegacyState.fromExportOrState(data: data)
        let workout = TrainingSession(
            id: "ios-new", date: date, dayID: "push", dayLabel: "Push", completion: 100,
            results: [ExerciseResult(exerciseID: "flat-bench", name: "Flat bench press",
                                     sets: [LoggedSet(index: 0, weightKg: 100, reps: 6)])],
            durationSeconds: 1800
        )

        let merged = StateMerge.apply([.upsert(workout)], to: original)

        let before = original["sessions"]?.arrayValue ?? []
        let after = merged["sessions"]?.arrayValue ?? []
        XCTAssertEqual(after.count, before.count + 1)
        XCTAssertEqual(Array(after.dropFirst()), before, "every stored session, the recovery day included, is untouched")
        for (key, value) in original.raw where key != "sessions" {
            XCTAssertEqual(merged[key], value, "\(key) changed")
        }
    }

    func testPainFlagsAreChangedByIdentityAndExpiredOnesDropped() throws {
        let now = try XCTUnwrap(LegacyAdapter.isoDate("2026-09-14T12:00:00.000Z"))
        let expired = PainFlag(region: .knee, exerciseID: "squat", date: now.addingTimeInterval(-20 * 86_400))
        let current = PainFlag(region: .shoulder, exerciseID: "flat-bench", date: now.addingTimeInterval(-86_400))
        var state = LegacyState(raw: [LegacyAdapter.painFlagsKey: .array([try XCTUnwrap(LegacyAdapter.jsonValue(expired))])])

        state = StateMerge.apply([StateChange(.addPainFlag(current), createdAt: now)], to: state, now: now)
        XCTAssertEqual(LegacyAdapter.painFlags(from: state).map(\.id), [current.id])

        state = StateMerge.apply([StateChange(.removePainFlag(id: current.id), createdAt: now)], to: state, now: now)
        XCTAssertTrue(LegacyAdapter.painFlags(from: state).isEmpty)
    }

    func testUndoingAProgramReplacementRemovesExactlyThatRecord() {
        let bench = ProgramReplacement(originExerciseID: "flat-bench", substituteExerciseID: "chest-press-machine", scope: .thisPlan, dayID: "push", date: date)
        let squat = ProgramReplacement(originExerciseID: "squat", substituteExerciseID: "hack-squat", scope: .always, dayID: "legs", date: date)
        let state = StateMerge.apply([
            StateChange(.addProgramReplacement(bench), createdAt: date),
            StateChange(.addProgramReplacement(squat), createdAt: date),
            StateChange(.removeProgramReplacement(id: bench.id), createdAt: date),
        ], to: LegacyState(raw: [:]), now: date)
        XCTAssertEqual(LegacyAdapter.programReplacements(from: state).map(\.id), [squat.id])
    }

    func testEntriesThisBuildCannotReadAreKept() {
        let foreign: JSONValue = .object(["futureShape": .bool(true)])
        let sled = CustomExercise(name: "Sled", createdAt: date)
        let state = StateMerge.apply([
            StateChange(.addCustomExercise(sled), createdAt: date),
            StateChange(.addCustomExercise(sled), createdAt: date),
        ], to: LegacyState(raw: [LegacyAdapter.customExercisesKey: .array([foreign])]), now: date)

        let stored = state[LegacyAdapter.customExercisesKey]?.arrayValue ?? []
        XCTAssertEqual(stored.count, 2, "added once, the unreadable entry kept")
        XCTAssertTrue(stored.contains(foreign))
    }

    func testHiddenWarmupsAreASortedUnion() {
        let state = StateMerge.apply([
            StateChange(.hideWarmup(exerciseID: "flat-bench"), createdAt: date),
            StateChange(.hideWarmup(exerciseID: "pec-fly"), createdAt: date),
        ], to: LegacyState(raw: [LegacyAdapter.hiddenWarmupsKey: .array([.string("pec-fly")])]), now: date)
        XCTAssertEqual(state[LegacyAdapter.hiddenWarmupsKey], .array([.string("flat-bench"), .string("pec-fly")]))
    }

    func testClearingThePausedWorkoutWritesAnExplicitNull() {
        let snapshot = ActiveSessionSnapshot(dayID: "push", dayLabel: "Push", startedAt: date, currentIndex: 0, results: [])
        var state = StateMerge.apply([.activeSession(snapshot, createdAt: date)], to: LegacyState(raw: [:]), now: date)
        XCTAssertNotNil(LegacyAdapter.activeSession(from: state))

        state = StateMerge.apply([.activeSession(nil, createdAt: date)], to: state, now: date)
        XCTAssertEqual(state[LegacyAdapter.activeSessionKey], .null, "cleared on purpose, not merely absent")
        XCTAssertNil(LegacyAdapter.activeSession(from: state))
    }

    /// Pending changes wait on the device, possibly across a cold launch.
    func testEveryKindOfChangeSurvivesStorage() throws {
        let changes: [StateChange] = [
            .upsert(TrainingSession(id: "s", date: date, dayID: "push", dayLabel: "Push", completion: 100, results: []), createdAt: date),
            .activeSession(nil, createdAt: date),
            StateChange(.addPainFlag(PainFlag(region: .knee, exerciseID: "squat", date: date)), createdAt: date),
            StateChange(.removePainFlag(id: "squat|knee|2026-09-09T22:13:20.000Z"), createdAt: date),
            StateChange(.addProgramReplacement(ProgramReplacement(originExerciseID: "a", substituteExerciseID: "b", scope: .thisDay, dayID: "push", date: date)), createdAt: date),
            StateChange(.removeProgramReplacement(id: "a|b|thisDay|push"), createdAt: date),
            StateChange(.addCustomExercise(CustomExercise(name: "Sled", createdAt: date)), createdAt: date),
            StateChange(.hideWarmup(exerciseID: "pec-fly"), createdAt: date),
        ]
        let stored = try StateChange.encoder.encode(changes)
        XCTAssertEqual(try StateChange.decoder.decode([StateChange].self, from: stored), changes)
    }
}
