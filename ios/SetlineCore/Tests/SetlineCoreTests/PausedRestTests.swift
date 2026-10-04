import XCTest
@testable import SetlineCore

/// A rest that was counting when a session was paused must come back with the
/// time it has left — and only then. Rest is wall-clock time, so it keeps
/// running while the session is parked; nothing is ever added to it, and no
/// timer is made up for a session that was paused between rests.
final class PausedRestTests: XCTestCase {

    /// Whole seconds: the blob stores dates as ISO 8601 without fractions.
    private let start = Date(timeIntervalSince1970: 1_788_000_000)

    private func rest(target: Int = 180, adjustment: Int = 0) -> ActiveSessionSnapshot.PausedRest {
        ActiveSessionSnapshot.PausedRest(
            timer: RestTimerState(targetSeconds: target, startedAt: start, adjustmentSeconds: adjustment),
            title: "Rust · primaire lift 3:00"
        )
    }

    private func snapshot(rest: ActiveSessionSnapshot.PausedRest?) -> ActiveSessionSnapshot {
        ActiveSessionSnapshot(
            dayID: "push",
            dayLabel: "Push",
            startedAt: start.addingTimeInterval(-600),
            currentIndex: 0,
            results: [
                ExerciseResult(
                    exerciseID: "flat-bench",
                    name: "Flat bench press",
                    sets: [LoggedSet(index: 0, weightKg: 102.5, reps: 6, pausedReps: 2)]
                )
            ],
            activeSeconds: 600,
            rest: rest
        )
    }

    func testARunningRestTravelsWithThePausedSession() throws {
        let original = snapshot(rest: rest(adjustment: 15))
        var state = LegacyState(raw: ["sessions": .array([])])
        LegacyAdapter.apply(activeSession: original, to: &state)

        let reread = try LegacyState(data: try state.encoded())
        let restored = try XCTUnwrap(LegacyAdapter.activeSession(from: reread))

        XCTAssertEqual(restored, original)
        XCTAssertEqual(restored.rest?.timer.adjustmentSeconds, 15, "An adjustment made before the pause is kept")
        XCTAssertEqual(restored.rest?.title, "Rust · primaire lift 3:00")
    }

    func testAResumedRestHasOnlyTheTimeItHasLeft() throws {
        let paused = snapshot(rest: rest(target: 180, adjustment: 15))
        let resumed = try XCTUnwrap(paused.restToResume(at: start.addingTimeInterval(60)))
        XCTAssertEqual(resumed.timer.remaining(at: start.addingTimeInterval(60)), 135)
        XCTAssertEqual(resumed.timer.startedAt, start, "The count is not restarted on resume")
    }

    func testARestThatRanOutWhilePausedDoesNotComeBack() {
        let paused = snapshot(rest: rest(target: 180))
        XCTAssertNil(paused.restToResume(at: start.addingTimeInterval(180)))
        XCTAssertNil(paused.restToResume(at: start.addingTimeInterval(3_600)))
    }

    func testASessionPausedBetweenRestsResumesWithoutOne() {
        XCTAssertNil(snapshot(rest: nil).restToResume(at: start))
    }

    func testPausingKeepsOnlyARestThatIsStillCounting() {
        let timer = RestTimerState(targetSeconds: 90, startedAt: start)
        XCTAssertNotNil(ActiveSessionSnapshot.PausedRest.counting(timer, title: "Rust", at: start.addingTimeInterval(30)))
        XCTAssertNil(ActiveSessionSnapshot.PausedRest.counting(timer, title: "Rust", at: start.addingTimeInterval(90)))
        XCTAssertNil(ActiveSessionSnapshot.PausedRest.counting(nil, title: "", at: start))
    }

    /// Snapshots already parked on a device or in the account were written
    /// without a rest. They still open, and open without one.
    func testASnapshotWrittenBeforeRestsWereKeptStillOpens() throws {
        let json = """
        {"dayID":"push","dayLabel":"Push","startedAt":"2026-09-30T10:00:00Z","currentIndex":1,
         "results":[],"proposedReps":{},"activeSeconds":420}
        """
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let snapshot = try decoder.decode(ActiveSessionSnapshot.self, from: Data(json.utf8))
        XCTAssertNil(snapshot.rest)
        XCTAssertEqual(snapshot.activeSeconds, 420)
        XCTAssertNil(snapshot.restToResume(at: Date()))
    }

    /// The rest rides along; the sets do not change because of it. Six reps
    /// with two of them paused stay six reps.
    func testKeepingTheRestLeavesPausedRepsAlone() throws {
        let original = snapshot(rest: rest())
        var state = LegacyState(raw: ["sessions": .array([])])
        LegacyAdapter.apply(activeSession: original, to: &state)
        let restored = try XCTUnwrap(LegacyAdapter.activeSession(from: try LegacyState(data: try state.encoded())))
        let set = try XCTUnwrap(restored.results.first?.sets.first)
        XCTAssertEqual(set.reps, 6)
        XCTAssertEqual(set.pausedReps, 2)
    }
}
