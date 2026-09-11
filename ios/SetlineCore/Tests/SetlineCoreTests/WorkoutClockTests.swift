import XCTest
@testable import SetlineCore

/// Session duration is active workout time. Rest, transitions and the app
/// going to the background all count; an explicit pause does not.
final class WorkoutClockTests: XCTestCase {

    private let start = Date(timeIntervalSince1970: 1_788_000_000)
    private func later(_ seconds: TimeInterval) -> Date { start.addingTimeInterval(seconds) }

    // MARK: 1 — a normal, uninterrupted workout

    func testUninterruptedWorkoutCountsWallClockWhileRunning() {
        let clock = WorkoutClock(segmentStartedAt: start)
        XCTAssertTrue(clock.isRunning)
        XCTAssertEqual(clock.activeSeconds(at: start), 0)
        XCTAssertEqual(clock.activeSeconds(at: later(53 * 60)), 53 * 60)
    }

    /// Rest and walking between machines are training, not pauses. Nothing
    /// stops the clock except `Pauzeer`, so a long rest simply counts.
    func testRestAndTransitionsCount() {
        let clock = WorkoutClock(segmentStartedAt: start)
        XCTAssertEqual(clock.activeSeconds(at: later(180)), 180)
    }

    // MARK: 2 — pause then resume

    func testPausedTimeIsNotCounted() {
        var clock = WorkoutClock(segmentStartedAt: start)

        clock.pause(at: later(600))            // ten minutes trained
        XCTAssertFalse(clock.isRunning)
        XCTAssertEqual(clock.activeSeconds(at: later(600)), 600)

        // Half an hour goes by while paused; none of it counts.
        XCTAssertEqual(clock.activeSeconds(at: later(2_400)), 600)

        clock.resume(at: later(2_400))
        XCTAssertEqual(clock.activeSeconds(at: later(2_400)), 600)
        XCTAssertEqual(clock.activeSeconds(at: later(2_700)), 900, "Five more minutes of training")
    }

    func testPausingTwiceBanksBothStretches() {
        var clock = WorkoutClock(segmentStartedAt: start)
        clock.pause(at: later(300))
        clock.resume(at: later(1_000))
        clock.pause(at: later(1_200))
        XCTAssertEqual(clock.activeSeconds(at: later(9_999)), 500)
    }

    func testResumingAnAlreadyRunningClockChangesNothing() {
        var clock = WorkoutClock(segmentStartedAt: start)
        clock.resume(at: later(100))
        XCTAssertEqual(clock.activeSeconds(at: later(200)), 200)
    }

    // MARK: 3 — pause, cold relaunch, resume

    /// The banked duration has to survive the blob, or a resumed session
    /// starts counting from zero.
    func testDurationSurvivesAColdRelaunch() throws {
        var clock = WorkoutClock(segmentStartedAt: start)
        clock.pause(at: later(1_500))

        var state = LegacyState(raw: ["sessions": .array([])])
        LegacyAdapter.apply(
            activeSession: ActiveSessionSnapshot(
                dayID: "push",
                dayLabel: "Push",
                startedAt: start,
                currentIndex: 0,
                results: [],
                activeSeconds: clock.activeSeconds(at: later(1_500))
            ),
            to: &state
        )

        // App is killed and relaunched: the blob is written out and read back.
        let reread = try LegacyState(data: try state.encoded())
        let restored = try XCTUnwrap(LegacyAdapter.activeSession(from: reread))
        XCTAssertEqual(restored.activeSeconds, 1_500)

        // Resuming picks up from the banked total, not from `startedAt`.
        var resumed = WorkoutClock(accumulatedSeconds: restored.activeSeconds, segmentStartedAt: later(86_400))
        XCTAssertEqual(resumed.activeSeconds(at: later(86_400)), 1_500)
        XCTAssertEqual(resumed.activeSeconds(at: later(86_700)), 1_800)
        resumed.pause(at: later(86_700))
        XCTAssertEqual(resumed.activeSeconds(at: later(90_000)), 1_800)
    }

    /// A snapshot written before duration tracking existed decodes as zero
    /// rather than failing.
    func testASnapshotWithoutADurationDecodes() throws {
        let json = """
        {"dayID":"push","dayLabel":"Push","startedAt":"2026-09-11T10:00:00Z",
         "currentIndex":0,"results":[],"proposedReps":{}}
        """
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let snapshot = try decoder.decode(ActiveSessionSnapshot.self, from: Data(json.utf8))
        XCTAssertEqual(snapshot.activeSeconds, 0)
    }

    // MARK: 4 — paused across a date boundary

    func testAnOvernightPauseAddsNothing() {
        var clock = WorkoutClock(segmentStartedAt: start)
        clock.pause(at: later(2_400))                    // 40 minutes trained

        // Fourteen hours later, the next morning.
        let nextMorning = later(2_400 + 14 * 3_600)
        XCTAssertEqual(clock.activeSeconds(at: nextMorning), 2_400)

        clock.resume(at: nextMorning)
        XCTAssertEqual(
            clock.activeSeconds(at: nextMorning.addingTimeInterval(900)),
            2_400 + 900,
            "Only the fifteen minutes actually trained the next morning"
        )
    }

    // MARK: 5 — what gets saved

    func testSavedDurationExcludesPausedTime() {
        var clock = WorkoutClock(segmentStartedAt: start)
        clock.pause(at: later(1_800))                    // 30 minutes
        clock.resume(at: later(80_000))                  // the next day
        let finishedAt = later(80_000 + 900)             // 15 more minutes

        let snapshot = ActiveSessionSnapshot(
            dayID: "push",
            dayLabel: "Push",
            startedAt: start,
            currentIndex: 0,
            results: [
                ExerciseResult(
                    exerciseID: "flat-bench",
                    name: "Flat bench press",
                    sets: [LoggedSet(index: 0, weightKg: 100, reps: 6)]
                )
            ],
            activeSeconds: clock.activeSeconds(at: finishedAt)
        )

        let session = snapshot.finishedSession()
        XCTAssertEqual(session.durationSeconds, 2_700, "45 minutes trained, not the 22 hours elapsed")
        XCTAssertEqual(session.date, start, "The session still belongs to the day it started")
        XCTAssertEqual(NumberDisplay.dutch.minutes(session.durationSeconds ?? 0), "45 min")
    }
}
