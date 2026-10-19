import XCTest
@testable import SetlineCore

/// A workout left open survives the app being closed in the background.
final class AutosavedSessionTests: XCTestCase {

    private let start = LegacyAdapter.isoDate("2026-10-19T17:00:00.000Z")!

    private func snapshot(runningSince: Date?) -> ActiveSessionSnapshot {
        ActiveSessionSnapshot(dayID: "push", dayLabel: "Push", startedAt: start, currentIndex: 0,
                              results: [], activeSeconds: 600, runningSince: runningSince)
    }

    func testAPauseKeepsOnlyTheBankedTime() {
        let paused = snapshot(runningSince: nil)
        XCTAssertEqual(paused.activeSeconds(resumingAt: start.addingTimeInterval(3600)), 600)
        XCTAssertFalse(paused.reopensOnLaunch(at: start.addingTimeInterval(60)))
    }

    func testTimeAwayFromAnOpenWorkoutCounts() {
        let left = snapshot(runningSince: start.addingTimeInterval(600))
        XCTAssertEqual(left.activeSeconds(resumingAt: start.addingTimeInterval(600 + 180)), 780)
        XCTAssertTrue(left.reopensOnLaunch(at: start.addingTimeInterval(600 + 180)))
    }

    func testAForgottenWorkoutIsCappedAndNotReopened() {
        let left = snapshot(runningSince: start)
        let nextDay = start.addingTimeInterval(24 * 3600)
        XCTAssertEqual(left.activeSeconds(resumingAt: nextDay), 600 + ActiveSessionSnapshot.maxAwaySeconds)
        XCTAssertFalse(left.reopensOnLaunch(at: nextDay))
    }

    func testTheMarkSurvivesTheSharedState() throws {
        var state = LegacyState(raw: [:])
        LegacyAdapter.apply(activeSession: snapshot(runningSince: start), to: &state)
        XCTAssertEqual(LegacyAdapter.activeSession(from: state)?.runningSince, start)
    }
}
