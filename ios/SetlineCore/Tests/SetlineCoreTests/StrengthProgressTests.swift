import XCTest
@testable import SetlineCore

/// Artboard 20 · segment Kracht. The screen may only state what the series
/// supports: an estimate that is allowed to exist, a change over a counted
/// window, and a record only once there is a reference to beat.
final class StrengthProgressTests: XCTestCase {

    private let calendar = Calendar(identifier: .gregorian)
    private let day = LegacyAdapter.isoDate("2026-09-07T17:00:00.000Z")!

    private func date(weeksAgo weeks: Int) -> Date {
        calendar.date(byAdding: .weekOfYear, value: -weeks, to: day)!
    }

    private func session(
        _ id: String,
        _ when: Date,
        exercise: String = "flat-bench",
        name: String = "Flat bench press",
        sets: [LoggedSet],
        dayLabel: String = "Push A"
    ) -> TrainingSession {
        TrainingSession(
            id: id, date: when, dayID: "push", dayLabel: dayLabel, completion: 100,
            results: [ExerciseResult(exerciseID: exercise, name: name, sets: sets)]
        )
    }

    private func set(_ weight: Decimal, _ reps: Int, index: Int = 0) -> LoggedSet {
        LoggedSet(index: index, weightKg: weight, reps: reps)
    }

    /// Four sessions: the reference builds, then the load moves.
    private func benchSessions() -> [TrainingSession] {
        [
            session("s1", date(weeksAgo: 8), sets: [set(45, 8), set(45, 8, index: 1)]),
            session("s2", date(weeksAgo: 6), sets: [set(45, 8), set(45, 8, index: 1)]),
            session("s3", date(weeksAgo: 2), sets: [set(47.5, 8), set(47.5, 8, index: 1)], dayLabel: "Push B"),
            session("s4", day, sets: [set(50, 8), set(50, 8, index: 1), set(50, 7, index: 2)]),
        ]
    }

    // MARK: Headline

    func testTheEstimateAndItsChangeComeFromTheSameSeries() throws {
        let progress = StrengthProgress.make(
            exerciseID: "flat-bench", name: "Flat bench press",
            sessions: benchSessions(), calendar: calendar
        )

        // Epley on the newest top set: 50 × (1 + 8/30) = 63,33…
        let estimate = try XCTUnwrap(progress.estimate)
        XCTAssertEqual((estimate as NSDecimalNumber).doubleValue, 63.33, accuracy: 0.01)
        let change = try XCTUnwrap(progress.change)
        // Against eight weeks back: 45 × (1 + 8/30) = 57.
        XCTAssertEqual((change.value as NSDecimalNumber).doubleValue, 6.33, accuracy: 0.01)
        XCTAssertEqual(change.weeks, 8)
        XCTAssertEqual(progress.points.count, 4, "one point per comparable session")
    }

    func testAYoungerHistoryReportsTheWeeksItReallyHas() throws {
        let sessions = [
            session("s1", date(weeksAgo: 3), sets: [set(45, 8)]),
            session("s2", date(weeksAgo: 1), sets: [set(47.5, 8)]),
            session("s3", day, sets: [set(50, 8)]),
        ]
        let change = try XCTUnwrap(
            StrengthProgress.make(exerciseID: "flat-bench", name: "Flat bench press", sessions: sessions, calendar: calendar).change
        )
        XCTAssertEqual(change.weeks, 3, "the window is counted, never assumed")
    }

    func testNoEstimateAboveTenReps() {
        let sessions = [
            session("s1", date(weeksAgo: 4), exercise: "pec-fly", name: "Pec fly", sets: [set(40, 15)]),
            session("s2", day, exercise: "pec-fly", name: "Pec fly", sets: [set(42.5, 14)]),
        ]
        let progress = StrengthProgress.make(exerciseID: "pec-fly", name: "Pec fly", sessions: sessions, calendar: calendar)

        XCTAssertNil(progress.estimate, "Epley is not honest above ten reps (§10.2)")
        XCTAssertNil(progress.change)
        XCTAssertTrue(progress.points.isEmpty)
        XCTAssertEqual(progress.rows.count, 2, "the sessions themselves are still listed")
    }

    // MARK: Markers

    func testTheFirstThreeSessionsBuildAReferenceAndCannotSetARecord() {
        let progress = StrengthProgress.make(
            exerciseID: "flat-bench", name: "Flat bench press",
            sessions: benchSessions(), calendar: calendar
        )

        XCTAssertEqual(progress.rows.map(\.marker), [
            .record,
            .building(session: 3, of: 3),
            .building(session: 2, of: 3),
            .building(session: 1, of: 3),
        ])
        XCTAssertEqual(progress.rows.first?.weightKg, 50)
        XCTAssertEqual(progress.rows.first?.reps, 8)
        XCTAssertEqual(progress.rows.first?.setCount, 3)
        XCTAssertEqual(progress.rows.first?.dayLabel, "Push A")
    }

    func testAfterTheReferenceALighterOrEqualSessionReadsAsADelta() {
        var sessions = benchSessions()
        sessions.append(session("s5", calendar.date(byAdding: .day, value: 7, to: day)!, sets: [set(47.5, 8)]))
        sessions.append(session("s6", calendar.date(byAdding: .day, value: 14, to: day)!, sets: [set(47.5, 8)]))

        let rows = StrengthProgress.make(
            exerciseID: "flat-bench", name: "Flat bench press",
            sessions: sessions, calendar: calendar
        ).rows

        XCTAssertEqual(rows[0].marker, .same, "same load as the session before it")
        XCTAssertEqual(rows[1].marker, .delta(-2.5))
        XCTAssertEqual(rows[2].marker, .record, "50 kg still stands as the heaviest")
    }

    func testWorkOnASubstituteStaysOutOfTheOriginsSeries() {
        var sessions = benchSessions()
        let substituted = LoggedSet(index: 0, weightKg: 100, reps: 8, substitutedFrom: "flat-bench")
        sessions.append(session("s5", calendar.date(byAdding: .day, value: 7, to: day)!, exercise: "db-bench", name: "Dumbbell bench press", sets: [substituted]))

        let progress = StrengthProgress.make(
            exerciseID: "flat-bench", name: "Flat bench press",
            sessions: sessions, calendar: calendar
        )
        XCTAssertEqual(progress.rows.count, 4, "the dumbbell work belongs to its own series")
        XCTAssertEqual(progress.rows.first?.weightKg, 50)
    }

    // MARK: Which exercises the segment offers

    func testOnlyExercisesWithEnoughComparableHistoryAreOffered() {
        var sessions = benchSessions()
        sessions.append(session("s5", day, exercise: "pec-fly", name: "Pec fly", sets: [set(50, 12)]))

        let choices = StrengthSelection.choices(sessions: sessions, plan: PlanCatalog.personal)

        XCTAssertEqual(choices.map(\.exerciseID), ["flat-bench"], "one session of pec fly says nothing yet")
    }

    func testPrimaryLiftsComeFirstThenTheMostRecentlyTrained() {
        var sessions: [TrainingSession] = []
        for (index, weeks) in [6, 4, 2].enumerated() {
            sessions.append(session("b\(index)", date(weeksAgo: weeks), sets: [set(100, 5)]))
            sessions.append(session("f\(index)", date(weeksAgo: weeks), exercise: "pec-fly", name: "Pec fly", sets: [set(50, 8)]))
            sessions.append(session("p\(index)", date(weeksAgo: weeks + 1), exercise: "pressdown", name: "Triceps pressdown", sets: [set(35, 8)]))
        }

        let choices = StrengthSelection.choices(sessions: sessions, plan: PlanCatalog.personal)

        XCTAssertEqual(choices.first?.exerciseID, "flat-bench", "the plan's primary lift leads")
        XCTAssertEqual(choices.map(\.exerciseID), ["flat-bench", "pec-fly", "pressdown"])
        XCTAssertEqual(
            choices, StrengthSelection.choices(sessions: sessions.reversed(), plan: PlanCatalog.personal),
            "the order does not depend on how the sessions arrive"
        )
    }
}
