import XCTest
@testable import SetlineCore

/// TRAINING_LOGIC §11: fatigue is read from logged sets, two signals propose,
/// one never does, and nothing is ever applied by itself.
final class FatigueTests: XCTestCase {

    private let now = LegacyAdapter.isoDate("2026-09-18T18:00:00.000Z")!

    private func set(_ weight: Decimal, _ reps: Int, rir: Int? = nil) -> LoggedSet {
        LoggedSet(index: 0, weightKg: weight, reps: reps, rirReported: rir)
    }

    private func session(
        _ id: String,
        daysAgo: Int,
        dayID: String = "push",
        results: [ExerciseResult],
        planned: Int? = nil,
        completed: Int? = nil
    ) -> TrainingSession {
        var session = TrainingSession(
            id: id,
            date: Calendar.current.date(byAdding: .day, value: -daysAgo, to: now)!,
            dayID: dayID,
            dayLabel: dayID.capitalized,
            completion: 100,
            results: results
        )
        session.plannedSetCount = planned
        session.completedSetCount = completed
        return session
    }

    private func result(_ id: String, _ name: String, _ sets: [LoggedSet]) -> ExerciseResult {
        ExerciseResult(exerciseID: id, name: name, sets: sets)
    }

    func testOneSignalNeverProposesAnything() {
        // Reps fell on a single exercise: a bad day, not a pattern.
        let reading = Fatigue.read(sessions: [
            session("b", daysAgo: 1, results: [result("flat-bench", "Bankdrukken", [set(100, 5)])]),
            session("a", daysAgo: 4, results: [result("flat-bench", "Bankdrukken", [set(100, 6)])]),
        ], now: now)
        XCTAssertFalse(reading.proposes)
    }

    func testRepsFallingOnTwoExercisesIsOneSignal() {
        let reading = Fatigue.read(sessions: [
            session("b", daysAgo: 1, results: [
                result("flat-bench", "Bankdrukken", [set(100, 5)]),
                result("pec-fly", "Pec-fly", [set(55, 11)]),
            ]),
            session("a", daysAgo: 4, results: [
                result("flat-bench", "Bankdrukken", [set(100, 6)]),
                result("pec-fly", "Pec-fly", [set(55, 12)]),
            ]),
        ], now: now)
        XCTAssertTrue(reading.signals.contains(.performanceRegression))
        XCTAssertFalse(reading.proposes, "still only one signal")
    }

    func testRepsFallingAndEffortDriftingTogetherPropose() {
        let reading = Fatigue.read(sessions: [
            session("b", daysAgo: 1, results: [
                result("flat-bench", "Bankdrukken", [set(100, 5)]),
                result("pec-fly", "Pec-fly", [set(55, 11)]),
                result("pressdown", "Pressdown", [set(35, 12, rir: 0)]),
            ]),
            session("a", daysAgo: 4, results: [
                result("flat-bench", "Bankdrukken", [set(100, 6)]),
                result("pec-fly", "Pec-fly", [set(55, 12)]),
                result("pressdown", "Pressdown", [set(35, 12, rir: 2)]),
            ]),
        ], now: now)
        XCTAssertEqual(reading.signals, [.performanceRegression, .effortDrift])
        XCTAssertTrue(reading.proposes)
        XCTAssertTrue(reading.evidence.contains { $0.detail.contains("→") })
    }

    func testFinishingLessThanFourFifthsTwiceIsItsOwnSignal() {
        let reading = Fatigue.read(sessions: [
            session("b", daysAgo: 1, results: [], planned: 20, completed: 12),
            session("a", daysAgo: 4, results: [], planned: 20, completed: 15),
        ], now: now)
        XCTAssertTrue(reading.signals.contains(.completionDrop))
    }

    func testNothingOlderThanAWeekCounts() {
        let reading = Fatigue.read(sessions: [
            session("b", daysAgo: 1, results: [result("flat-bench", "Bankdrukken", [set(100, 5, rir: 0)])]),
            session("a", daysAgo: 20, results: [result("flat-bench", "Bankdrukken", [set(100, 6, rir: 2)])]),
        ], now: now)
        XCTAssertEqual(reading, .none)
    }

    func testOneSessionSaysNothingAtAll() {
        XCTAssertEqual(
            Fatigue.read(sessions: [session("a", daysAgo: 1, results: [])], now: now),
            .none
        )
    }

    // MARK: The prescription

    func testTheLighterWeekCutsSetsAndNotExercises() {
        let deload = Deload(startedAt: now)
        XCTAssertEqual(deload.sets(from: 5), 3)
        XCTAssertEqual(deload.sets(from: 4), 2)
        XCTAssertEqual(deload.sets(from: 1), 1, "never to zero")
        XCTAssertEqual(deload.detail, "Zelfde oefeningen, 40% minder sets, RIR +2. Gewicht blijft.")
        XCTAssertEqual(deload.headline, "Voorstel: 5 dagen lichter")
    }

    func testTheLighterWeekEndsOnItsOwn() {
        let deload = Deload(startedAt: now)
        let calendar = Calendar.current
        XCTAssertTrue(deload.isActive(on: now))
        XCTAssertTrue(deload.isActive(on: calendar.date(byAdding: .day, value: 4, to: now)!))
        XCTAssertFalse(deload.isActive(on: calendar.date(byAdding: .day, value: 5, to: now)!))
        XCTAssertFalse(deload.isActive(on: calendar.date(byAdding: .day, value: -1, to: now)!))
    }

    func testItSurvivesBeingStored() throws {
        let deload = Deload(startedAt: now)
        let state = StateMerge.apply(
            [StateChange(.setDeload(LegacyAdapter.json(deload)), createdAt: now)],
            to: LegacyState(raw: [:]), now: now
        )
        let read = try XCTUnwrap(LegacyAdapter.deload(from: state))
        XCTAssertEqual(read.days, 5)
        XCTAssertEqual(read.rirIncrease, 2)

        let cleared = StateMerge.apply([StateChange(.setDeload(.null), createdAt: now)], to: state, now: now)
        XCTAssertNil(LegacyAdapter.deload(from: cleared))
    }
}

/// Addendum 12R and the review's PR treatment, as the row model states them.
final class SetRowReserveTests: XCTestCase {

    func testAReportedReserveTakesTheComparisonColumn() {
        XCTAssertFalse(SetDelta.reserve(1).describesTheSet, "it compares nothing, it reports")
        XCTAssertNotEqual(SetDelta.reserve(1), SetDelta.reserve(2))
    }
}
