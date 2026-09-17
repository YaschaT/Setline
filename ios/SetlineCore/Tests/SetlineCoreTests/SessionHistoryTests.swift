import XCTest
@testable import SetlineCore

/// Segment Historiek states stored facts only: counts when the session
/// recorded them, the percentage it kept when it did not.
final class SessionHistoryTests: XCTestCase {


    private let calendar = Calendar(identifier: .gregorian)
    private let day = LegacyAdapter.isoDate("2026-09-07T17:00:00.000Z")!

    private func date(weeksAgo weeks: Int) -> Date {
        calendar.date(byAdding: .weekOfYear, value: -weeks, to: day)!
    }

    private func workout(
        _ id: String,
        _ when: Date,
        label: String = "Push A",
        sets: [LoggedSet],
        duration: Int? = 3_180,
        counts: (Int, Int)? = (18, 18),
        completion: Int = 100,
        kind: SessionKind = .workout
    ) -> TrainingSession {
        TrainingSession(
            id: id, date: when, dayID: "push", dayLabel: label, completion: completion, kind: kind,
            results: [ExerciseResult(exerciseID: "flat-bench", name: "Flat bench press", sets: sets)],
            durationSeconds: duration, plannedSetCount: counts?.0, completedSetCount: counts?.1
        )
    }

    // MARK: Rows


    func testHistoryStatesCountsWhenTheSessionRecordedThem() throws {
        let rows = SessionHistory.rows(from: [
            workout("s1", day, sets: [LoggedSet(index: 0, weightKg: 100, reps: 6), LoggedSet(index: 1, weightKg: 100, reps: 6)]),
        ])
        let row = try XCTUnwrap(rows.first)

        XCTAssertEqual(row.dayLabel, "Push A")
        XCTAssertEqual(row.counts, SessionHistoryRow.Counts(completed: 18, planned: 18))
        XCTAssertNil(row.completionPercent, "counts replace the percentage, never both")
        XCTAssertEqual(row.durationSeconds, 3_180)
        XCTAssertEqual(row.volumeKg, 1_200)
    }

    func testOlderSessionsKeepTheirPercentageAndHideAnUnknownDuration() throws {
        let legacy = workout(
            "web-1", date(weeksAgo: 4), label: "Pull A",
            sets: [LoggedSet(index: 0, weightKg: 60, reps: 10)],
            duration: nil, counts: nil, completion: 94
        )
        let row = try XCTUnwrap(SessionHistory.rows(from: [legacy]).first)

        XCTAssertNil(row.counts)
        XCTAssertEqual(row.completionPercent, 94)
        XCTAssertNil(row.durationSeconds, "a duration nobody recorded is not invented")
    }

    func testRecoveryDaysAreNotWorkoutsAndTheListIsNewestFirst() {
        let sessions = [
            workout("older", date(weeksAgo: 2), sets: [LoggedSet(index: 0, weightKg: 80, reps: 5)]),
            workout("newer", day, sets: [LoggedSet(index: 0, weightKg: 85, reps: 5)]),
            workout("rest", date(weeksAgo: 1), label: "Rustdag", sets: [], counts: nil, kind: .recovery),
        ]

        XCTAssertEqual(SessionHistory.rows(from: sessions).map(\.id), ["newer", "older"])
    }

    func testHalfARatioIsNoRatio() {
        var session = workout("s1", day, sets: [LoggedSet(index: 0, weightKg: 100, reps: 5)], counts: nil)
        session.plannedSetCount = 18
        XCTAssertNil(SessionHistory.counts(of: session), "a planned count alone says nothing")
        session.completedSetCount = 20
        XCTAssertNil(SessionHistory.counts(of: session), "more logged than planned cannot be right")
    }
}
